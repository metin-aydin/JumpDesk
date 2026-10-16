interface WebSocketStreamOptions {
  protocols?: string[]
  signal?: AbortSignal
}

interface WebSocketStreamOpenInfo {
  readable: ReadableStream<string | ArrayBuffer | Uint8Array>
  writable: WritableStream<string | ArrayBuffer | Uint8Array>
  protocol: string
  extensions: string
}

interface WebSocketStreamCloseInfo {
  closeCode?: number
  reason?: string
}

declare class WebSocketStream {
  constructor(url: string, options?: WebSocketStreamOptions)
  readonly url: string
  readonly opened: Promise<WebSocketStreamOpenInfo>
  readonly closed: Promise<WebSocketStreamCloseInfo>
  close(info?: WebSocketStreamCloseInfo): void
}

interface Window {
  WebSocketStream?: typeof WebSocketStream
}
