import { net } from 'electron'
import type { AiProvider } from '@shared/ai'
import { mt } from '../i18n'
import { SUGGESTION_SCHEMA } from './prompt'

const TIMEOUT_MS = 45_000
const MAX_TOKENS = 1024
const TOOL_NAME = 'suggest_commands'

export class AiError extends Error {}

interface CallInput {
  provider: AiProvider
  fields: Record<string, string>
  secrets: Record<string, string>
  system: string
  user: string
}

/** Gemini'nin yapılandırılmış çıktı şeması (OpenAPI alt kümesi). */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          command: { type: 'STRING' },
          description: { type: 'STRING' },
          risk: { type: 'STRING', enum: ['safe', 'caution', 'dangerous'] }
        },
        required: ['command', 'description', 'risk']
      }
    },
    note: { type: 'STRING' }
  },
  required: ['suggestions', 'note']
}

const trimSlash = (url: string): string => url.trim().replace(/\/+$/, '')

/** İstek sistem vekil sunucusu ayarlarıyla (Electron `net`) gider; süre aşılırsa iptal edilir. */
async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  return request(url, headers, body)
}

/** Gövde verilmezse GET isteği gönderilir. */
async function request(
  url: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<unknown> {
  let res: Response
  try {
    res = await net.fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError')
      throw new AiError(mt('Yapay zeka yanıt vermedi (zaman aşımı).'))
    throw new AiError(
      mt('Yapay zeka sağlayıcısına ulaşılamadı: {message}', { message: (err as Error).message })
    )
  }
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new AiError(mt('API anahtarı geçersiz ya da bu işlem için yetkisi yok.'))
    if (res.status === 404) throw new AiError(mt('Model ya da adres bulunamadı.'))
    if (res.status === 429)
      throw new AiError(mt('Sağlayıcının istek sınırına ulaşıldı; biraz sonra yeniden deneyin.'))
    let detail = text.slice(0, 200)
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      detail =
        (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) ??
        parsed.message ??
        detail
    } catch {
      /* gövde JSON değil; ilk karakterler gösterilir */
    }
    throw new AiError(
      mt('Yapay zeka isteği başarısız oldu (HTTP {status}): {detail}', {
        status: res.status,
        detail
      })
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new AiError(mt('Yapay zeka yanıtı okunamadı.'))
  }
}

/** Metin yanıttaki JSON nesnesini çıkarır (kod bloğu içinde gelse de). */
function jsonFromText(text: unknown): unknown {
  if (typeof text !== 'string') throw new AiError(mt('Yapay zeka yanıtı okunamadı.'))
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new AiError(mt('Yapay zeka yanıtı okunamadı.'))
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AiError(mt('Yapay zeka yanıtı okunamadı.'))
  }
}

function anthropicHeaders(
  fields: Record<string, string>,
  secrets: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-api-key': secrets['apiKey'] ?? '',
    'anthropic-version': '2023-06-01'
  }
  // Kuruluş düzeyindeki (çalışma alanına bağlı olmayan) anahtarlarda hangi çalışma alanının kullanılacağı bildirilir.
  if (fields['workspaceId']) headers['anthropic-workspace-id'] = fields['workspaceId']
  return headers
}

/** Zorunlu araç seçimini (`tool_choice: tool`) desteklemeyen modeller; bunlarda araç serbest seçimle verilir. */
const noForcedTool = new Set<string>()

async function anthropic(input: CallInput): Promise<unknown> {
  const model = input.fields['model'] ?? ''
  const send = (forced: boolean): Promise<unknown> =>
    post('https://api.anthropic.com/v1/messages', anthropicHeaders(input.fields, input.secrets), {
      model,
      max_tokens: MAX_TOKENS,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Return shell command suggestions for the administrator.',
          input_schema: SUGGESTION_SCHEMA
        }
      ],
      tool_choice: forced ? { type: 'tool', name: TOOL_NAME } : { type: 'auto' }
    })
  let data: { content?: { type: string; input?: unknown; text?: string }[] }
  if (noForcedTool.has(model)) data = (await send(false)) as typeof data
  else {
    try {
      data = (await send(true)) as typeof data
    } catch (err) {
      if (!(err instanceof AiError && /tool_choice/.test(err.message))) throw err
      noForcedTool.add(model)
      data = (await send(false)) as typeof data
    }
  }
  const tool = data.content?.find((c) => c.type === 'tool_use')
  if (tool?.input) return tool.input
  return jsonFromText(data.content?.find((c) => c.type === 'text')?.text)
}

/** OpenAI biçimli sohbet yanıtındaki içerik (ret varsa not olarak). */
function chatContent(data: unknown): unknown {
  const message = (data as { choices?: { message?: { content?: string; refusal?: string } }[] })
    .choices?.[0]?.message
  if (message?.refusal) return { suggestions: [], note: message.refusal }
  return jsonFromText(message?.content)
}

const chatMessages = (input: CallInput): { role: string; content: string }[] => [
  { role: 'system', content: input.system },
  { role: 'user', content: input.user }
]

const jsonSchemaFormat = {
  type: 'json_schema',
  json_schema: { name: TOOL_NAME, strict: true, schema: SUGGESTION_SCHEMA }
}

async function openai(input: CallInput): Promise<unknown> {
  return chatContent(
    await post(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${input.secrets['apiKey'] ?? ''}` },
      {
        model: input.fields['model'],
        messages: chatMessages(input),
        response_format: jsonSchemaFormat
      }
    )
  )
}

async function azure(input: CallInput): Promise<unknown> {
  const url = `${trimSlash(input.fields['endpoint'] ?? '')}/openai/deployments/${encodeURIComponent(
    input.fields['deployment'] ?? ''
  )}/chat/completions?api-version=${encodeURIComponent(input.fields['apiVersion'] ?? '')}`
  return chatContent(
    await post(
      url,
      { 'api-key': input.secrets['apiKey'] ?? '' },
      { messages: chatMessages(input), response_format: jsonSchemaFormat }
    )
  )
}

async function compatible(input: CallInput): Promise<unknown> {
  const url = `${trimSlash(input.fields['baseUrl'] ?? '')}/chat/completions`
  const headers: Record<string, string> = input.secrets['apiKey']
    ? { authorization: `Bearer ${input.secrets['apiKey']}` }
    : {}
  const body = { model: input.fields['model'], messages: chatMessages(input) }
  try {
    return chatContent(
      await post(url, headers, { ...body, response_format: { type: 'json_object' } })
    )
  } catch (err) {
    // JSON kipini desteklemeyen sunucularda biçim yalnız sistem talimatıyla istenir.
    if (err instanceof AiError && /HTTP 400/.test(err.message))
      return chatContent(await post(url, headers, body))
    throw err
  }
}

async function gemini(input: CallInput): Promise<unknown> {
  const model = encodeURIComponent(input.fields['model'] ?? '')
  const data = (await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': input.secrets['apiKey'] ?? '' },
    {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: [{ text: input.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA,
        maxOutputTokens: MAX_TOKENS
      }
    }
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return jsonFromText(data.candidates?.[0]?.content?.parts?.[0]?.text)
}

/** Çalışma alanı istenen kuruluş anahtarında sağlayıcının İngilizce iletisi yerine ne yapılacağı söylenir. */
async function anthropicWithHint(input: CallInput): Promise<unknown> {
  try {
    return await anthropic(input)
  } catch (err) {
    if (err instanceof AiError && err.message.includes('anthropic-workspace-id'))
      throw new AiError(
        mt(
          'Bu kuruluş anahtarı bir çalışma alanına bağlı değil. "Çalışma Alanı Kimliği" alanına kullanılacak çalışma alanının kimliğini (wrkspc_…) girin ya da bir çalışma alanına ait anahtar kullanın.'
        )
      )
    throw err
  }
}

const CALLS: Record<AiProvider, (input: CallInput) => Promise<unknown>> = {
  anthropic: anthropicWithHint,
  openai,
  gemini,
  azure,
  compatible
}

export interface ModelInfo {
  id: string
  label: string
}

/** OpenAI listesinde sohbet için kullanılamayan modeller (ses, görüntü, gömme…). */
const NON_CHAT =
  /(embedding|tts|whisper|transcribe|audio|realtime|image|dall-e|moderation|search|computer-use|babbage|davinci)/i

/** Sağlayıcının, girilen anahtarla kullanılabilen modelleri. Azure'da model yerine dağıtım adı girildiği için yoktur. */
export async function listModels(
  provider: AiProvider,
  fields: Record<string, string>,
  secrets: Record<string, string>
): Promise<ModelInfo[]> {
  if (provider === 'anthropic') {
    const data = (await request(
      'https://api.anthropic.com/v1/models?limit=1000',
      anthropicHeaders(fields, secrets)
    )) as { data?: { id: string; display_name?: string }[] }
    return (data.data ?? []).map((m) => ({ id: m.id, label: m.display_name || m.id }))
  }
  if (provider === 'openai' || provider === 'compatible') {
    const url =
      provider === 'openai'
        ? 'https://api.openai.com/v1/models'
        : `${trimSlash(fields['baseUrl'] ?? '')}/models`
    const headers: Record<string, string> = secrets['apiKey']
      ? { authorization: `Bearer ${secrets['apiKey']}` }
      : {}
    const data = (await request(url, headers)) as { data?: { id: string }[] }
    return (data.data ?? [])
      .map((m) => m.id)
      .filter(
        (id) => provider === 'compatible' || (/^(gpt|o\d|chatgpt)/i.test(id) && !NON_CHAT.test(id))
      )
      .sort((a, b) => b.localeCompare(a))
      .map((id) => ({ id, label: id }))
  }
  if (provider === 'gemini') {
    const data = (await request(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      { 'x-goog-api-key': secrets['apiKey'] ?? '' }
    )) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
    }
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => {
        const id = m.name.replace(/^models\//, '')
        return { id, label: m.displayName ? `${m.displayName} (${id})` : id }
      })
  }
  return []
}

export function callProvider(input: CallInput): Promise<unknown> {
  return CALLS[input.provider](input)
}
