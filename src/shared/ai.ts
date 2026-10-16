/**
 * Yapay zeka sağlayıcıları ve komut önerisi türleri. Alan adları ve açıklamalar Türkçe kaynak metindir; arayüz `t()` ile
 * çevirir. Gizli alanlar (API anahtarı) arayüze hiç gönderilmez, yalnız kayıtlı olup olmadığı bildirilir.
 */
export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'azure' | 'compatible'

export interface AiField {
  key: string
  label: string
  secret?: boolean
  required?: boolean
  placeholder?: string
  /** Alanın altında gösterilen kısa açıklama. */
  hint?: string
  /** Değerin biçimi (ör. kimlik); uymayan değer kaydedilmez. */
  pattern?: string
  /** Model gibi alanlarda öneri listesi. */
  options?: string[]
}

export interface AiProviderInfo {
  id: AiProvider
  label: string
  description: string
  fields: AiField[]
  /** Alan verilmediğinde kullanılan değerler. */
  defaults: Record<string, string>
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description: 'Claude modelleri; anahtar console.anthropic.com adresinden alınır.',
    fields: [
      {
        key: 'apiKey',
        label: 'API Anahtarı',
        secret: true,
        required: true,
        placeholder: 'sk-ant-…'
      },
      {
        key: 'model',
        label: 'Model',
        required: true,
        options: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']
      },
      {
        key: 'workspaceId',
        label: 'Çalışma Alanı Kimliği (İsteğe Bağlı)',
        placeholder: 'wrkspc_…',
        pattern: '^[A-Za-z0-9_-]{1,128}$',
        hint: 'Bir çalışma alanına bağlı olmayan kuruluş anahtarlarında gerekir: console.anthropic.com → Settings → Workspaces.'
      }
    ],
    defaults: { model: 'claude-opus-5-5' }
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI modelleri; anahtar platform.openai.com adresinden alınır.',
    fields: [
      { key: 'apiKey', label: 'API Anahtarı', secret: true, required: true, placeholder: 'sk-…' },
      {
        key: 'model',
        label: 'Model',
        required: true,
        options: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o']
      }
    ],
    defaults: { model: 'gpt-4.1' }
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini modelleri; anahtar aistudio.google.com adresinden alınır.',
    fields: [
      { key: 'apiKey', label: 'API Anahtarı', secret: true, required: true, placeholder: 'AIza…' },
      {
        key: 'model',
        label: 'Model',
        required: true,
        options: ['gemini-2.5-pro', 'gemini-2.5-flash']
      }
    ],
    defaults: { model: 'gemini-2.5-flash' }
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    description: 'Kurumunuzun Azure OpenAI kaynağı.',
    fields: [
      {
        key: 'endpoint',
        label: 'Uç Nokta',
        required: true,
        placeholder: 'https://<kaynak>.openai.azure.com'
      },
      { key: 'deployment', label: 'Dağıtım Adı', required: true },
      { key: 'apiVersion', label: 'API Sürümü', required: true },
      { key: 'apiKey', label: 'API Anahtarı', secret: true, required: true }
    ],
    defaults: { apiVersion: '2024-10-21' }
  },
  {
    id: 'compatible',
    label: 'OpenAI Uyumlu',
    description: 'Ollama, LM Studio, vLLM gibi OpenAI uyumlu bir sunucu (kurum içi model).',
    fields: [
      {
        key: 'baseUrl',
        label: 'Adres',
        required: true,
        placeholder: 'http://localhost:11434/v1'
      },
      { key: 'model', label: 'Model', required: true, placeholder: 'llama3.1' },
      { key: 'apiKey', label: 'API Anahtarı (İsteğe Bağlı)', secret: true }
    ],
    defaults: {}
  }
]

export const aiProviderInfo = (id: AiProvider): AiProviderInfo =>
  AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]

/** Yapay zeka ile açılıp kapatılan özellikler. */
export interface AiFeatures {
  /** Autocomplete penceresinde yapay zekaya sorup komut önerisi alma. */
  autocomplete: boolean
}

/** Arayüze verilen ayarlar: gizli alanların değeri yoktur, yalnız hangilerinin kayıtlı olduğu bilinir. */
export interface AiConfig {
  provider: AiProvider | null
  fields: Partial<Record<AiProvider, Record<string, string>>>
  secretsSet: Partial<Record<AiProvider, string[]>>
  features: AiFeatures
  /** Anahtarlar işletim sisteminin anahtar deposuyla şifreleniyor mu. */
  encryption: boolean
}

export type AiRisk = 'safe' | 'caution' | 'dangerous'

export interface AiSuggestion {
  command: string
  description: string
  risk: AiRisk
}

/** Sohbetin önceki adımları: kullanıcının sorusu ve verilen komutlar. */
export interface AiTurn {
  question: string
  commands: string[]
}

export interface AiSuggestRequest {
  question: string
  history: AiTurn[]
  /** Yalnız sunucunun türü (ör. linux, windows); ad, adres ya da sunucudaki hiçbir veri gönderilmez. */
  platform: string
  language: 'en' | 'tr'
}

export type AiSuggestResult =
  { ok: true; suggestions: AiSuggestion[]; note: string } | { ok: false; error: string }

/** Ayarların eksiksiz olup olmadığı (sağlayıcı seçili, zorunlu alanlar ve anahtar dolu). */
export function aiConfigured(config: AiConfig): boolean {
  if (!config.provider) return false
  const info = aiProviderInfo(config.provider)
  const fields = { ...info.defaults, ...config.fields[config.provider] }
  const secrets = config.secretsSet[config.provider] ?? []
  return info.fields.every(
    (f) => !f.required || (f.secret ? secrets.includes(f.key) : Boolean(fields[f.key]?.trim()))
  )
}
