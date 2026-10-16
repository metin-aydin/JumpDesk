import { EventEmitter } from 'events'
import type { ApiResult } from '@shared/types'
import { jmsSession, serverOrigin, serverUrl } from '../config'
import { mt } from '../i18n'

/** `unauthorized`: sunucu oturumu geçersiz saydı (401). */
export const jmsEvents = new EventEmitter()

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function cookieValue(name: string): Promise<string | undefined> {
  const cookies = await jmsSession().cookies.get({ url: serverUrl(), name })
  return cookies[0]?.value
}

function errorMessage(body: unknown, fallback: string): { error: string; code?: string } {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const text = b['detail'] ?? b['msg'] ?? b['error']
    if (typeof text === 'string')
      return { error: text, code: typeof b['code'] === 'string' ? b['code'] : undefined }
    const first = Object.values(b)[0]
    if (Array.isArray(first) && typeof first[0] === 'string') return { error: first[0] }
  }
  return { error: fallback }
}

export interface JmsRequestOptions {
  method?: string
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export async function jmsRequest<T>(
  path: string,
  options: JmsRequestOptions = {}
): Promise<ApiResult<T>> {
  const method = (options.method ?? 'GET').toUpperCase()
  if (!serverUrl()) return { ok: false, status: 0, error: mt('Sunucu adresi girilmedi.') }
  const url = new URL(path, `${serverUrl()}/`)
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'en',
    'X-Requested-With': 'XMLHttpRequest'
  }
  const org = (await cookieValue('X-JMS-LUNA-ORG')) ?? (await cookieValue('X-JMS-ORG'))
  if (org) headers['X-JMS-ORG'] = org
  if (UNSAFE.has(method)) {
    headers['X-CSRFToken'] = (await cookieValue('jms_csrftoken')) ?? ''
    headers['Origin'] = serverOrigin()
    headers['Referer'] = `${serverOrigin()}/luna/`
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await jmsSession().fetch(url.toString(), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'include',
      redirect: 'manual'
    })
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: mt('Sunucuya ulaşılamadı: {message}', { message: (err as Error).message })
    }
  }

  const text = await res.text()
  let body: unknown = undefined
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = text
  }

  if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
    jmsEvents.emit('unauthorized')
    return { ok: false, status: 401, error: mt('Oturum süresi doldu') }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, ...errorMessage(body, `HTTP ${res.status}`) }
  }
  return { ok: true, data: body as T }
}

/** Sunucudaki bir görseli oturum çereziyle indirir; yalnız sunucunun kendi adresindeki yollar kabul edilir. */
export async function jmsImage(path: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(path, `${serverUrl()}/`)
  } catch {
    return null
  }
  if (url.origin !== new URL(serverUrl()).origin) return null
  try {
    const res = await jmsSession().fetch(url.toString(), { credentials: 'include' })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 2 * 1024 * 1024) return null
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
