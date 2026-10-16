/**
 * koko web SFTP protokolü (`/koko/ws/sftp/?token=`, alt protokol JMS-KOKO). Sunucu önce `CONNECT` gönderir;
 * istemci `SFTP_DATA` tipinde `cmd` + JSON `data` ile istekte bulunur, yanıt aynı `cmd` ile döner.
 * İndirmede içerik base64 `raw` alanlı `SFTP_BINARY` mesajlarıyla gelir, son mesaj dosya adını taşır.
 * koko istek gövdesini işleyiciye paylaşılan bir alan üzerinden aktarır; bu yüzden aynı anda tek istek gönderilir.
 *
 * Yollar sunucudaki gerçek yollardır ve platformun SFTP kök dizinine bağlıdır: kökle başlamayan yol kökün altına
 * eklenir. Kök, ilk listelemede (`path: ''`) dönen `current_path`'tir.
 */

import { t } from '@/lib/i18n'

export interface SftpEntry {
  name: string
  size: number
  perm: string
  /** Unix saniyesi. */
  mtime: number
  isDir: boolean
}

export interface SftpListing {
  path: string
  entries: SftpEntry[]
}

export type SftpState = 'connecting' | 'ready' | 'closed' | 'error'

interface SftpMessage {
  id: string
  type: string
  cmd?: string
  data?: string
  raw?: string
  err?: string
  current_path?: string
}

interface Pending {
  cmd: string
  resolve: (msg: SftpMessage) => void
  reject: (err: Error) => void
  onBinary?: (bytes: Uint8Array) => void
  timer?: ReturnType<typeof setTimeout>
}

export class SftpError extends Error {
  constructor(
    message: string,
    readonly permission = false
  ) {
    super(message)
  }
}

const REQUEST_TIMEOUT = 45_000
const PING_INTERVAL = 60_000
const CHUNK_SIZE = 5 * 1024 * 1024
const MAX_CHUNK_SIZE = 10 * 1024 * 1024
const MAX_CHUNKS = 100

const isPermissionError = (err: string): boolean => /permission denied/i.test(err)

function translate(err: string): SftpError {
  if (isPermissionError(err)) return new SftpError(t('Bu işlem için yetkiniz yok.'), true)
  if (/session expired/i.test(err)) return new SftpError(t('Dosya oturumu sona erdi.'))
  return new SftpError(err)
}

function decodeBase64(text: string): Uint8Array {
  const native = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64
  if (native) return native(text)
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error(t('Dosya okunamadı')))
    reader.readAsDataURL(blob)
  })
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`
}

export function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}

export class SftpClient {
  state: SftpState = 'connecting'
  detail?: string
  /** Platformun SFTP kök dizini; ilk listelemeden sonra bilinir. */
  root: string | null = null
  private ws: WebSocket
  private chain: Promise<unknown> = Promise.resolve()
  private current: Pending | null = null
  private counter = Math.floor(Math.random() * 1_000_000)
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] = []
  private listeners = new Set<() => void>()

  constructor(url: string) {
    this.ws = new WebSocket(url, ['JMS-KOKO'])
    this.ws.onmessage = (e) => {
      if (typeof e.data === 'string') this.handle(JSON.parse(e.data) as SftpMessage)
    }
    this.ws.onclose = () =>
      this.finish(
        'closed',
        this.state === 'connecting'
          ? t('Dosya sunucusuna bağlanılamadı.')
          : t('Dosya oturumu kapandı.')
      )
    this.ws.onerror = () => undefined
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(state: SftpState, detail?: string): void {
    if (this.state === 'closed' || this.state === 'error') return
    this.state = state
    this.detail = detail
    if (state === 'ready') this.readyWaiters.splice(0).forEach((w) => w.resolve())
    else if (state !== 'connecting')
      this.readyWaiters
        .splice(0)
        .forEach((w) => w.reject(new SftpError(detail ?? t('Bağlantı kapandı'))))
    this.listeners.forEach((l) => l())
  }

  private finish(state: 'closed' | 'error', detail: string): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    const pending = this.current
    this.current = null
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(new SftpError(detail))
    }
    this.setState(state, detail)
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private nextId(): string {
    this.counter = (this.counter + 1) % Number.MAX_SAFE_INTEGER
    return String(this.counter)
  }

  private handle(msg: SftpMessage): void {
    switch (msg.type) {
      case 'CONNECT':
        this.pingTimer = setInterval(
          () => this.send({ id: this.nextId(), type: 'PING', data: 'ping' }),
          PING_INTERVAL
        )
        this.setState('ready')
        return
      case 'PING':
        this.send({ id: this.nextId(), type: 'PONG', data: 'pong' })
        return
      case 'SFTP_BINARY':
        if (msg.raw && this.current?.onBinary) this.current.onBinary(decodeBase64(msg.raw))
        return
      case 'SFTP_DATA': {
        const pending = this.current
        if (!pending || (msg.cmd && msg.cmd !== pending.cmd)) return
        this.current = null
        if (pending.timer) clearTimeout(pending.timer)
        if (msg.err) pending.reject(translate(msg.err))
        else pending.resolve(msg)
        return
      }
      case 'ERROR':
        this.finish('error', msg.err ? translate(msg.err).message : t('Dosya sunucusu hata verdi.'))
        this.ws.close()
        return
      case 'CLOSE':
        this.finish('closed', t('Dosya oturumu sona erdi.'))
        this.ws.close()
    }
  }

  whenReady(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve()
    if (this.state !== 'connecting')
      return Promise.reject(new SftpError(this.detail ?? t('Bağlantı kapandı')))
    return new Promise((resolve, reject) => this.readyWaiters.push({ resolve, reject }))
  }

  private request(
    cmd: string,
    data: Record<string, unknown>,
    opts: { id?: string; raw?: string; onBinary?: (b: Uint8Array) => void; timeout?: boolean } = {}
  ): Promise<SftpMessage> {
    const run = this.chain.then(async () => {
      await this.whenReady()
      return new Promise<SftpMessage>((resolve, reject) => {
        const pending: Pending = { cmd, resolve, reject, onBinary: opts.onBinary }
        if (opts.timeout !== false) {
          pending.timer = setTimeout(() => {
            if (this.current !== pending) return
            this.current = null
            reject(new SftpError(t('Sunucu yanıt vermedi.')))
          }, REQUEST_TIMEOUT)
        }
        this.current = pending
        this.send({
          id: opts.id ?? this.nextId(),
          type: 'SFTP_DATA',
          cmd,
          data: JSON.stringify(data),
          raw: opts.raw ?? ''
        })
      })
    })
    this.chain = run.catch(() => undefined)
    return run
  }

  async list(path: string): Promise<SftpListing> {
    const msg = await this.request('list', { path })
    const raw = JSON.parse(msg.data || '[]') as {
      name: string
      size: string
      perm: string
      mod_time: string
      is_dir: boolean
    }[]
    const current = msg.current_path || path || '/'
    if (path === '' && this.root === null) this.root = current
    return {
      path: current,
      entries: (raw ?? []).map((f) => ({
        name: f.name,
        size: Number(f.size) || 0,
        perm: f.perm,
        mtime: Number(f.mod_time) || 0,
        isDir: f.is_dir
      }))
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.request('mkdir', { path })
  }

  /** `newName` yalnız yeni addır; dosya aynı klasörde kalır. */
  async rename(path: string, newName: string): Promise<void> {
    await this.request('rename', { path, new_name: newName })
  }

  async remove(path: string): Promise<void> {
    await this.request('rm', { path })
  }

  /** Klasörler sunucuda zip'lenir. Parçalar sırayla `onChunk`'a verilir; dönen değer sunucunun önerdiği dosya adıdır. */
  async download(
    path: string,
    isDir: boolean,
    onChunk: (bytes: Uint8Array) => void
  ): Promise<string> {
    const msg = await this.request(
      'download',
      { path, is_dir: isDir },
      { onBinary: onChunk, timeout: false }
    )
    return msg.data || path.split('/').pop() || 'dosya'
  }

  async upload(
    file: Blob,
    path: string,
    onProgress: (sent: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const id = String(Math.floor(Math.random() * 2 ** 31))
    let chunkSize = CHUNK_SIZE
    let count = Math.max(1, Math.ceil(file.size / chunkSize))
    if (count > MAX_CHUNKS) {
      count = MAX_CHUNKS
      chunkSize = Math.ceil(file.size / MAX_CHUNKS)
    }
    if (chunkSize > MAX_CHUNK_SIZE) {
      chunkSize = MAX_CHUNK_SIZE
      count = Math.ceil(file.size / chunkSize)
    }
    if (count === 1) {
      const raw = await blobToBase64(file)
      await this.request(
        'upload',
        { path, size: file.size, offset: 0, chunk: false },
        { id, raw, timeout: false }
      )
      onProgress(file.size)
      return
    }
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new SftpError(t('Yükleme iptal edildi.'))
      const slice = file.slice(i * chunkSize, (i + 1) * chunkSize)
      const raw = await blobToBase64(slice)
      await this.request(
        'upload',
        { path, size: file.size, offset: i * chunkSize, chunk: true, merge: false },
        { id, raw, timeout: false }
      )
      onProgress(Math.min(file.size, (i + 1) * chunkSize))
    }
    await this.request('upload', { path, size: 0, offset: 0, merge: true }, { id })
  }

  close(): void {
    this.finish('closed', t('Dosya oturumu kapandı.'))
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
      this.ws.close()
  }
}

export function sftpUrl(server: string, tokenId: string): string {
  const url = new URL(server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/koko/ws/sftp/'
  url.search = `?token=${encodeURIComponent(tokenId)}`
  return url.toString()
}
