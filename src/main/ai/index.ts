import { safeStorage } from 'electron'
import {
  AI_PROVIDERS,
  aiConfigured,
  aiProviderInfo,
  type AiConfig,
  type AiFeatures,
  type AiProvider,
  type AiSuggestRequest,
  type AiSuggestResult
} from '@shared/ai'
import { hasControlChars } from '@shared/ai-safety'
import { mt } from '../i18n'
import { store, type StoredAi } from '../store'
import { AiError, callProvider, listModels } from './providers'
import { parseSuggestions, systemPrompt, userPrompt } from './prompt'

const MAX_FIELD = 2000
const MAX_SECRET = 4000
const DEFAULT_FEATURES: AiFeatures = { autocomplete: false }

const isProvider = (v: unknown): v is AiProvider => AI_PROVIDERS.some((p) => p.id === v)

function stored(): StoredAi {
  const ai = store.userAi
  return {
    provider: ai?.provider ?? null,
    fields: ai?.fields ?? {},
    secrets: ai?.secrets ?? {},
    features: { ...DEFAULT_FEATURES, ...ai?.features }
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
    if (typeof patch.features.autocomplete === 'boolean')
      ai.features.autocomplete = patch.features.autocomplete
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

export async function aiSuggest(raw: unknown, requireFeature = true): Promise<AiSuggestResult> {
  try {
    const config = aiConfig()
    if (requireFeature && !config.features.autocomplete)
      throw new AiError(mt('Yapay zeka ile autocomplete kapalı.'))
    if (!config.provider || !aiConfigured(config))
      throw new AiError(mt('Yapay zeka ayarları eksik. Ayarlar → Yapay Zeka bölümünü doldurun.'))
    const req = cleanRequest(raw)
    const result = parseSuggestions(
      await callProvider({
        provider: config.provider,
        fields: config.fields[config.provider] ?? {},
        secrets: secretsOf(config.provider),
        system: systemPrompt(req),
        user: userPrompt(req)
      })
    )
    return { ok: true, ...result }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AiError ? err.message : mt('Yapay zeka isteği başarısız oldu.')
    }
  }
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
