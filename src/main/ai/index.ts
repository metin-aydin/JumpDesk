import { safeStorage } from 'electron'
import {
  AI_EXPLAIN_MAX_CONTEXT,
  AI_EXPLAIN_MAX_TEXT,
  AI_FEATURE_KEYS,
  AI_PROVIDERS,
  aiConfigured,
  aiProviderInfo,
  DEFAULT_AI_FEATURES,
  type AiConfig,
  type AiExplainRequest,
  type AiExplainResult,
  type AiFeatures,
  type AiProvider,
  type AiRuleRequest,
  type AiRuleResult,
  type AiSnippetRequest,
  type AiSnippetResult,
  type AiSuggestRequest,
  type AiSuggestResult
} from '@shared/ai'
import { hasControlChars } from '@shared/ai-safety'
import { mt } from '../i18n'
import { store, type StoredAi } from '../store'
import { AiError, callProvider, listModels, type AiTaskSpec } from './providers'
import {
  EXPLAIN_TASK,
  explainSystemPrompt,
  explainUserPrompt,
  parseExplanation,
  parseRules,
  parseSnippets,
  parseSuggestions,
  RULE_TASK,
  ruleSystemPrompt,
  ruleUserPrompt,
  SNIPPET_TASK,
  snippetSystemPrompt,
  snippetUserPrompt,
  SUGGEST_TASK,
  systemPrompt,
  userPrompt
} from './prompt'

const MAX_FIELD = 2000
const MAX_SECRET = 4000

const isProvider = (v: unknown): v is AiProvider => AI_PROVIDERS.some((p) => p.id === v)

function stored(): StoredAi {
  const ai = store.userAi
  return {
    provider: ai?.provider ?? null,
    fields: ai?.fields ?? {},
    secrets: ai?.secrets ?? {},
    features: { ...DEFAULT_AI_FEATURES, ...ai?.features }
  }
}

/**
 * Linux'ta anahtar deposu (GNOME Keyring, KWallet) yoksa Chromium'un sabit parolalı yedeği kullanılır; anahtar yine
 * kaydedilir, arayüz zayıf şifreleme uyarısı gösterir.
 */
function ensureEncryption(): boolean {
  if (!safeStorage.isEncryptionAvailable() && process.platform === 'linux')
    safeStorage.setUsePlainTextEncryption(true)
  return safeStorage.isEncryptionAvailable()
}

/** Anahtarlar işletim sisteminin anahtar deposuyla mı şifreleniyor. */
function strongEncryption(): boolean {
  if (!ensureEncryption()) return false
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

/** Arayüze verilen ayarlar; gizli alanların yalnız kayıtlı olup olmadığı bildirilir. */
export function aiConfig(): AiConfig {
  const ai = stored()
  const fields: AiConfig['fields'] = {}
  const secretsSet: AiConfig['secretsSet'] = {}
  for (const info of AI_PROVIDERS) {
    fields[info.id] = { ...info.defaults, ...ai.fields[info.id] }
    secretsSet[info.id] = Object.keys(ai.secrets[info.id] ?? {})
  }
  return {
    provider: ai.provider,
    fields,
    secretsSet,
    features: ai.features,
    encryption: strongEncryption()
  }
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export interface AiConfigPatch {
  provider?: AiProvider | null
  field?: { provider: AiProvider; key: string; value: string }
  features?: Partial<AiFeatures>
}

export function setAiConfig(patch: AiConfigPatch): AiConfig {
  const ai = stored()
  if (patch.provider !== undefined) {
    if (patch.provider !== null && !isProvider(patch.provider))
      throw new Error('Geçersiz sağlayıcı')
    ai.provider = patch.provider
  }
  if (patch.field) {
    const { provider, key, value } = patch.field
    const def = isProvider(provider)
      ? aiProviderInfo(provider).fields.find((f) => f.key === key)
      : null
    if (!def || def.secret || typeof value !== 'string' || value.length > MAX_FIELD)
      throw new Error('Geçersiz alan')
    const trimmed = value.trim()
    if (trimmed && (key === 'baseUrl' || key === 'endpoint') && !validUrl(trimmed))
      throw new AiError(mt('Adres http:// ya da https:// ile başlamalı.'))
    // Alanlar istek adresine ve başlıklarına girer; kontrol karakteri ve biçime uymayan değer kabul edilmez.
    if (
      trimmed &&
      (hasControlChars(trimmed) || (def.pattern && !new RegExp(def.pattern).test(trimmed)))
    )
      throw new AiError(mt('{field} geçerli değil.', { field: mt(def.label) }))
    ai.fields[provider] = { ...ai.fields[provider], [key]: trimmed }
  }
  if (patch.features) {
    for (const key of AI_FEATURE_KEYS) {
      const value = patch.features[key]
      if (typeof value === 'boolean') ai.features[key] = value
    }
  }
  store.setUserAi(ai)
  return aiConfig()
}

/** Gizli alanı şifreleyip kaydeder; boş değer kaydı siler. Değer hiçbir zaman arayüze geri verilmez. */
export function setAiSecret(provider: AiProvider, key: string, value: string | null): AiConfig {
  const def = isProvider(provider)
    ? aiProviderInfo(provider).fields.find((f) => f.key === key)
    : null
  if (!def?.secret) throw new Error('Geçersiz alan')
  const ai = stored()
  const secrets = { ...ai.secrets[provider] }
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) delete secrets[key]
  else {
    if (trimmed.length > MAX_SECRET) throw new Error('Geçersiz alan')
    if (!ensureEncryption())
      throw new AiError(mt('Bu sistemde şifreleme kullanılamıyor; API anahtarı kaydedilmedi.'))
    secrets[key] = safeStorage.encryptString(trimmed).toString('base64')
  }
  ai.secrets[provider] = secrets
  store.setUserAi(ai)
  return aiConfig()
}

function secretsOf(provider: AiProvider): Record<string, string> {
  ensureEncryption()
  const out: Record<string, string> = {}
  for (const [key, enc] of Object.entries(stored().secrets[provider] ?? {})) {
    try {
      out[key] = safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      throw new AiError(mt('Kayıtlı API anahtarı çözülemedi; anahtarı yeniden girin.'))
    }
  }
  return out
}

const MAX_TURNS = 6

/** İstek doğrulanır: soru ve önceki sorular metin, platform yalnız bilinen tür adlarından biri. */
function cleanRequest(raw: unknown): AiSuggestRequest {
  const r = (raw ?? {}) as Partial<AiSuggestRequest>
  const question = typeof r.question === 'string' ? r.question.trim() : ''
  if (!question) throw new AiError(mt('Bir soru yazın.'))
  const history = Array.isArray(r.history)
    ? r.history
        .filter((h) => h && typeof h.question === 'string' && Array.isArray(h.commands))
        .slice(-MAX_TURNS)
        .map((h) => ({
          question: h.question.slice(0, 1000),
          commands: h.commands.filter((c): c is string => typeof c === 'string').slice(0, 5)
        }))
    : []
  const platform = ['linux', 'unix', 'windows', 'macos', 'bsd'].includes(String(r.platform))
    ? String(r.platform)
    : 'linux'
  return { question, history, platform, language: r.language === 'tr' ? 'tr' : 'en' }
}

const FEATURE_OFF: Record<keyof AiFeatures, string> = {
  autocomplete: 'Yapay zeka ile autocomplete kapalı.',
  snippets: 'Yapay zeka ile snippet üretme kapalı.',
  rules: 'Yapay zeka ile kural üretme kapalı.',
  explainSelection: 'Yapay zeka ile seçili çıktıyı açıklama kapalı.',
  explainAlarm: 'Yapay zeka ile alarm açıklama kapalı.'
}

/**
 * Seçili sağlayıcıya görev isteğini gönderir: özellik kapalıysa ya da ayarlar eksikse istek gitmez. Hata iletileri
 * kullanıcının dilindedir; sağlayıcıdan gelmeyen beklenmedik hatalar genel bir iletiyle bildirilir.
 */
async function runTask<T>(
  feature: keyof AiFeatures | null,
  task: AiTaskSpec,
  build: () => { system: string; user: string },
  parse: (raw: unknown) => T
): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const config = aiConfig()
    if (feature && !config.features[feature]) throw new AiError(mt(FEATURE_OFF[feature]))
    if (!config.provider || !aiConfigured(config))
      throw new AiError(mt('Yapay zeka ayarları eksik. Ayarlar → Yapay Zeka bölümünü doldurun.'))
    const prompt = build()
    const raw = await callProvider({
      provider: config.provider,
      fields: config.fields[config.provider] ?? {},
      secrets: secretsOf(config.provider),
      ...prompt,
      task
    })
    return { ok: true, ...parse(raw) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AiError ? err.message : mt('Yapay zeka isteği başarısız oldu.')
    }
  }
}

export function aiSuggest(raw: unknown, requireFeature = true): Promise<AiSuggestResult> {
  return runTask(
    requireFeature ? 'autocomplete' : null,
    SUGGEST_TASK,
    () => {
      const req = cleanRequest(raw)
      return { system: systemPrompt(req), user: userPrompt(req) }
    },
    parseSuggestions
  )
}

const cleanLanguage = (value: unknown): 'en' | 'tr' => (value === 'tr' ? 'tr' : 'en')
const cleanPlatform = (value: unknown): string =>
  ['linux', 'unix', 'windows', 'macos', 'bsd'].includes(String(value)) ? String(value) : 'linux'
const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : ''

/** Tariften snippet seçenekleri (yalnız kullanıcının yazdığı tarif gönderilir). */
export function aiSnippet(raw: unknown): Promise<AiSnippetResult> {
  return runTask(
    'snippets',
    SNIPPET_TASK,
    () => {
      const r = (raw ?? {}) as Partial<AiSnippetRequest>
      const description = text(r.description, 1000).trim()
      if (!description) throw new AiError(mt('Snippet’in ne yapacağını yazın.'))
      const req = { description, language: cleanLanguage(r.language) }
      return { system: snippetSystemPrompt(req), user: snippetUserPrompt(req) }
    },
    parseSnippets
  )
}

/** Tariften (ve isteğe bağlı örnek satırdan) alarm/vurgu kuralı seçenekleri. */
export function aiRule(raw: unknown): Promise<AiRuleResult> {
  return runTask(
    'rules',
    RULE_TASK,
    () => {
      const r = (raw ?? {}) as Partial<AiRuleRequest>
      const description = text(r.description, 1000).trim()
      if (!description) throw new AiError(mt('Neyin yakalanacağını yazın.'))
      const req = { description, sample: text(r.sample, 500), language: cleanLanguage(r.language) }
      return { system: ruleSystemPrompt(req), user: ruleUserPrompt(req) }
    },
    parseRules
  )
}

/**
 * Metni açıklar. Seçili çıktı ve alarm metni sunucudan gelir; arayüz göndermeden önce metni gösterip onay alır.
 * Komut açıklaması snippet özelliğine bağlıdır.
 */
export function aiExplain(raw: unknown): Promise<AiExplainResult> {
  const r = (raw ?? {}) as Partial<AiExplainRequest>
  const subject = r.subject === 'alarm' || r.subject === 'command' ? r.subject : 'output'
  const feature: keyof AiFeatures =
    subject === 'alarm' ? 'explainAlarm' : subject === 'command' ? 'snippets' : 'explainSelection'
  return runTask(
    feature,
    EXPLAIN_TASK,
    () => {
      const req: AiExplainRequest = {
        subject,
        text: text(r.text, AI_EXPLAIN_MAX_TEXT),
        context: text(r.context, AI_EXPLAIN_MAX_CONTEXT),
        question: text(r.question, 1000),
        platform: cleanPlatform(r.platform),
        language: cleanLanguage(r.language)
      }
      if (!req.text.trim()) throw new AiError(mt('Açıklanacak metin boş.'))
      return { system: explainSystemPrompt(req), user: explainUserPrompt(req) }
    },
    parseExplanation
  )
}

/** Ayarların denenmesi: sabit, zararsız bir soruyla istek gönderilir. */
export function aiTest(language: 'en' | 'tr'): Promise<AiSuggestResult> {
  return aiSuggest(
    { question: 'Show free disk space', history: [], platform: 'linux', language },
    false
  )
}

/** Seçili olmasa da verilen sağlayıcının modelleri; anahtar ya da adres eksikse boş liste ve neden. */
export async function aiListModels(
  provider: unknown
): Promise<{ ok: true; models: { id: string; label: string }[] } | { ok: false; error: string }> {
  if (!isProvider(provider) || provider === 'azure') return { ok: true, models: [] }
  try {
    const config = aiConfig()
    const fields = config.fields[provider] ?? {}
    const secrets = secretsOf(provider)
    if (provider === 'compatible' ? !fields['baseUrl'] : !secrets['apiKey'])
      return { ok: true, models: [] }
    return { ok: true, models: await listModels(provider, fields, secrets) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AiError ? err.message : mt('Model listesi alınamadı.')
    }
  }
}
