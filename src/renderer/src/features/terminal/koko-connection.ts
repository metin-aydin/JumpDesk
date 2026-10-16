/**
 * koko web terminal protokolü (JMS-KOKO): sunucu önce `CONNECT` gönderir, istemci `TERMINAL_INIT` ile
 * boyutu bildirir; terminal çıktısı binary çerçevelerle gelir, girdi ve kontrol mesajları JSON metindir.
 * Okuma WebSocketStream ile yapılır: terminal yetişemediğinde okuma durur ve koko uzak akışı yavaşlatır.
 */

import { t } from '@/lib/i18n'

export type KokoState = 'connecting' | 'connected' | 'closed' | 'error'

export interface KokoMessage {
  id: string
  type: string
  data: string
  err?: string
}

export interface KokoCallbacks {
  /** `done` çıktı terminalde işlendiğinde çağrılmalıdır; akış kontrolü buna dayanır. */
  onOutput: (bytes: Uint8Array, done: () => void) => void
  onState: (state: KokoState, detail?: string) => void
  onMessage?: (msg: KokoMessage) => void
  getSize: () => { cols: number; rows: number }
}

const HIGH_WATERMARK = 512 * 1024
const LOW_WATERMARK = 128 * 1024
const PING_INTERVAL = 25_000

export class KokoConnection {
  private id = ''
  private writer: WritableStreamDefaultWriter<string | ArrayBuffer | Uint8Array> | null = null
  private socket: WebSocket | null = null
  private stream: WebSocketStream | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pendingBytes = 0
  private resume: (() => void) | null = null
  private state: KokoState = 'connecting'
  private closedByUser = false

  constructor(
    private readonly url: string,
    private readonly cb: KokoCallbacks
  ) {}

  connect(): void {
    this.setState('connecting')
    if (window.WebSocketStream) void this.connectStream(window.WebSocketStream)
    else this.connectSocket()
  }

  private setState(state: KokoState, detail?: string): void {
    if (this.state === 'closed' || this.state === 'error') {
      if (state !== 'connecting') return
    }
    this.state = state
    this.cb.onState(state, detail)
  }

  private async connectStream(Ctor: typeof WebSocketStream): Promise<void> {
    const stream = new Ctor(this.url, { protocols: ['JMS-KOKO'] })
    this.stream = stream
    try {
      const { readable, writable } = await stream.opened
      this.writer = writable.getWriter()
      const reader = readable.getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (typeof value === 'string') this.handleText(value)
        else await this.handleBinary(value instanceof Uint8Array ? value : new Uint8Array(value))
      }
      const info = await stream.closed.catch(() => ({ closeCode: 1006 }))
      this.finish(info.closeCode)
    } catch (err) {
      this.finish(1006, (err as Error).message)
    }
  }

  private connectSocket(): void {
    const ws = new WebSocket(this.url, ['JMS-KOKO'])
    ws.binaryType = 'arraybuffer'
    this.socket = ws
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.handleText(ev.data)
      else void this.handleBinary(new Uint8Array(ev.data as ArrayBuffer))
    }
    ws.onclose = (ev) => this.finish(ev.code)
    ws.onerror = () => undefined
  }

  private async handleBinary(bytes: Uint8Array): Promise<void> {
    this.pendingBytes += bytes.byteLength
    this.cb.onOutput(bytes, () => {
      this.pendingBytes -= bytes.byteLength
      if (this.resume && this.pendingBytes <= LOW_WATERMARK) {
        const r = this.resume
        this.resume = null
        r()
      }
    })
    if (this.pendingBytes > HIGH_WATERMARK) {
      await new Promise<void>((resolve) => (this.resume = resolve))
    }
  }

  private handleText(text: string): void {
    let msg: KokoMessage
    try {
      msg = JSON.parse(text) as KokoMessage
    } catch {
      return
    }
    switch (msg.type) {
      case 'CONNECT': {
        this.id = msg.id
        const { cols, rows } = this.cb.getSize()
        this.send('TERMINAL_INIT', JSON.stringify({ cols, rows, code: '' }))
        this.startPing()
        this.setState('connected')
        break
      }
      case 'CLOSE':
        this.finish(1000)
        break
      case 'ERROR':
      case 'TERMINAL_ERROR':
        this.setState('error', msg.err || msg.data || t('Bağlantı hatası'))
        break
      default:
        break
    }
    this.cb.onMessage?.(msg)
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => this.send('PING'), PING_INTERVAL)
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  private finish(code?: number, detail?: string): void {
    this.stopPing()
    this.resume?.()
    this.resume = null
    if (this.state === 'error') return
    if (this.state === 'connecting' && !this.closedByUser) {
      this.setState('error', detail ?? t('Sunucuya bağlanılamadı (oturum geçersiz olabilir)'))
      return
    }
    this.setState(
      'closed',
      code && code !== 1000 && code !== 1005 ? t('Bağlantı kapandı ({code})', { code }) : undefined
    )
  }

  send(type: string, data = ''): void {
    const payload = JSON.stringify({ id: this.id, type, data })
    if (this.writer) void this.writer.write(payload).catch(() => undefined)
    else if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(payload)
  }

  input(data: string): void {
    if (this.state === 'connected') this.send('TERMINAL_DATA', data)
  }

  resize(cols: number, rows: number): void {
    if (this.state === 'connected') this.send('TERMINAL_RESIZE', JSON.stringify({ cols, rows }))
  }

  close(): void {
    this.closedByUser = true
    this.stopPing()
    try {
      if (this.state === 'connected') this.send('CLOSE')
      this.stream?.close({ closeCode: 1000 })
      this.socket?.close(1000)
    } catch {
      /* zaten kapalı */
    }
  }
}
