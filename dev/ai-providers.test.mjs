// Yapay zeka sağlayıcı isteklerinin birim testi: Electron'un `net.fetch`'i taklit edilir, istek ağa çıkmaz; adres,
// başlıklar ve gövde denetlenir. Kullanım: node dev/ai-providers.test.mjs
import { build } from 'esbuild'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-ai-providers-'))
const stub = path.join(dir, 'electron-stub.mjs')
fs.writeFileSync(
  stub,
  `export const app = { getPath: () => ${JSON.stringify(dir)} }
export const net = { fetch: (...args) => globalThis.__fakeFetch(...args) }
`
)
const out = path.join(dir, 'providers.mjs')
await build({
  entryPoints: [path.join(root, 'src/main/ai/providers.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  alias: { '@shared': path.join(root, 'src/shared'), electron: stub },
  logLevel: 'error'
})
const { callProvider, geminiSchema, listModels } = await import(out)

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const calls = []
let reply = { status: 200, body: {} }
globalThis.__fakeFetch = async (url, init) => {
  calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
  return new Response(JSON.stringify(reply.body), { status: reply.status })
}
const toolReply = {
  content: [
    {
      type: 'tool_use',
      input: { suggestions: [{ command: 'df -h', description: 'x', risk: 'safe' }], note: '' }
    }
  ]
}
const task = {
  name: 'suggest_commands',
  description: 'Return shell command suggestions for the administrator.',
  maxTokens: 1024,
  schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { command: { type: 'string' }, risk: { type: 'string', enum: ['safe'] } },
          required: ['command', 'risk'],
          additionalProperties: false
        }
      },
      note: { type: 'string' }
    },
    required: ['suggestions', 'note'],
    additionalProperties: false
  }
}
const base = { system: 'S', user: 'U', secrets: { apiKey: 'sk-ant-test' }, task }

reply = { status: 200, body: toolReply }
let result = await callProvider({
  ...base,
  provider: 'anthropic',
  fields: { model: 'claude-opus-5-5' }
})
let call = calls.at(-1)
check('anthropic: endpoint', call.url === 'https://api.anthropic.com/v1/messages')
check('anthropic: key header', call.headers['x-api-key'] === 'sk-ant-test')
check('anthropic: no workspace header by default', !('anthropic-workspace-id' in call.headers))
check('anthropic: forced tool', call.body.tool_choice?.name === 'suggest_commands')
check('anthropic: tool input returned', result.suggestions?.[0]?.command === 'df -h')

await callProvider({
  ...base,
  provider: 'anthropic',
  fields: { model: 'claude-opus-5-5', workspaceId: 'wrkspc_01ABC' }
})
call = calls.at(-1)
check('anthropic: workspace header sent', call.headers['anthropic-workspace-id'] === 'wrkspc_01ABC')

reply = {
  status: 400,
  body: {
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message:
        'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.'
    }
  }
}
try {
  await callProvider({ ...base, provider: 'anthropic', fields: { model: 'claude-opus-5-5' } })
  check('anthropic: workspace error explained', false, 'no error')
} catch (err) {
  check('anthropic: workspace error explained', /Workspace ID/.test(err.message), err.message)
}

reply = {
  status: 200,
  body: { choices: [{ message: { content: '```json\n{"suggestions":[],"note":"n"}\n```' } }] }
}
result = await callProvider({
  ...base,
  provider: 'compatible',
  fields: { baseUrl: 'http://localhost:11434/v1/', model: 'llama3.1' },
  secrets: {}
})
call = calls.at(-1)
check(
  'compatible: url without double slash',
  call.url === 'http://localhost:11434/v1/chat/completions'
)
check('compatible: no auth header without key', !('authorization' in call.headers))
check('compatible: JSON in code block parsed', result.note === 'n')

await callProvider({ ...base, provider: 'openai', fields: { model: 'gpt-4.1' } })
call = calls.at(-1)
check(
  'openai: bearer and strict schema',
  call.headers.authorization === 'Bearer sk-ant-test' &&
    call.body.response_format?.json_schema?.strict === true
)
// Zorunlu araç seçimini desteklemeyen model: 400 sonrası serbest seçimle yeniden denenir ve model hatırlanır
let attempt = 0
globalThis.__fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body)
  calls.push({ url, headers: init.headers, body })
  attempt++
  if (body.tool_choice?.type === 'tool')
    return new Response(
      JSON.stringify({
        type: 'error',
        error: { message: 'tool_choice: type "tool" and "any" are not supported for this model.' }
      }),
      { status: 400 }
    )
  return new Response(JSON.stringify(toolReply), { status: 200 })
}
result = await callProvider({ ...base, provider: 'anthropic', fields: { model: 'claude-x' } })
check(
  'anthropic: falls back to auto tool choice',
  attempt === 2 && result.suggestions?.[0]?.command === 'df -h'
)
attempt = 0
await callProvider({ ...base, provider: 'anthropic', fields: { model: 'claude-x' } })
check(
  'anthropic: remembers model without forced tool',
  attempt === 1 && calls.at(-1).body.tool_choice.type === 'auto'
)

// Model listeleri
const listReply = (body) => {
  globalThis.__fakeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, method: init.method })
    return new Response(JSON.stringify(body), { status: 200 })
  }
}
listReply({
  data: [
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
    { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' }
  ]
})
let models = await listModels('anthropic', { workspaceId: 'wrkspc_1' }, { apiKey: 'k' })
call = calls.at(-1)
check(
  'list anthropic: GET with workspace header',
  call.method === 'GET' &&
    call.url.startsWith('https://api.anthropic.com/v1/models') &&
    call.headers['anthropic-workspace-id'] === 'wrkspc_1'
)
check('list anthropic: labels', models.length === 2 && models[0].label === 'Claude Opus 5.5')
listReply({
  data: [
    { id: 'gpt-4.1' },
    { id: 'text-embedding-3-large' },
    { id: 'tts-1' },
    { id: 'o3' },
    { id: 'dall-e-3' }
  ]
})
models = await listModels('openai', {}, { apiKey: 'k' })
check(
  'list openai: chat models only',
  models
    .map((m) => m.id)
    .sort()
    .join(',') === 'gpt-4.1,o3',
  models.map((m) => m.id).join(',')
)
listReply({
  models: [
    {
      name: 'models/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      supportedGenerationMethods: ['generateContent']
    },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }
  ]
})
models = await listModels('gemini', {}, { apiKey: 'k' })
check(
  'list gemini: generateContent models',
  models.length === 1 && models[0].id === 'gemini-2.5-flash'
)
listReply({ data: [{ id: 'llama3.1' }, { id: 'qwen2.5' }] })
models = await listModels('compatible', { baseUrl: 'http://localhost:11434/v1' }, {})
check(
  'list compatible: all models',
  models.length === 2 && calls.at(-1).url === 'http://localhost:11434/v1/models'
)
// Gemini şeması JSON şemasından çevrilir: türler büyük harf, additionalProperties yok
const converted = geminiSchema(task.schema)
check(
  'gemini schema: upper-case types without additionalProperties',
  converted.type === 'OBJECT' &&
    converted.properties.suggestions.type === 'ARRAY' &&
    converted.properties.suggestions.items.properties.risk.type === 'STRING' &&
    converted.properties.suggestions.items.properties.risk.enum[0] === 'safe' &&
    !JSON.stringify(converted).includes('additionalProperties') &&
    converted.required.join(',') === 'suggestions,note',
  JSON.stringify(converted)
)
globalThis.__fakeFetch = async (url, init) => {
  calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
  return new Response(JSON.stringify(reply.body), { status: reply.status })
}
reply = {
  status: 200,
  body: { candidates: [{ content: { parts: [{ text: '{"suggestions":[],"note":"x"}' }] } }] }
}
await callProvider({
  ...base,
  provider: 'gemini',
  fields: { model: 'gemini-2.5-flash' },
  task: { ...task, maxTokens: 1500 }
})
check(
  'gemini: task schema and token limit sent',
  calls.at(-1).body.generationConfig.responseSchema.type === 'OBJECT' &&
    calls.at(-1).body.generationConfig.maxOutputTokens === 1500
)
reply = { status: 200, body: toolReply }
await callProvider({
  ...base,
  provider: 'anthropic',
  fields: { model: 'claude-opus-5-5' },
  task: { ...task, name: 'explain_text' }
})
check(
  'anthropic: task name used as tool',
  calls.at(-1).body.tools[0].name === 'explain_text' &&
    calls.at(-1).body.tool_choice.name === 'explain_text'
)
// Azure: yalnız kaynak adı yazılırsa adres ondan kurulur, API sürümü verilmezse varsayılan kullanılır
reply = {
  status: 200,
  body: { choices: [{ message: { content: '{"suggestions":[],"note":""}' } }] }
}
await callProvider({
  ...base,
  provider: 'azure',
  fields: { endpoint: 'sirket-openai', deployment: 'gpt-4o' }
})
check(
  'azure: resource name becomes the endpoint, default API version',
  calls.at(-1).url ===
    'https://sirket-openai.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21',
  calls.at(-1).url
)
await callProvider({
  ...base,
  provider: 'azure',
  fields: { endpoint: 'https://ozel.openai.azure.com/', deployment: 'd', apiVersion: '2025-01-01' }
})
check(
  'azure: full endpoint and stored API version are kept',
  calls.at(-1).url ===
    'https://ozel.openai.azure.com/openai/deployments/d/chat/completions?api-version=2025-01-01',
  calls.at(-1).url
)
process.exitCode = failed ? 1 : 0
