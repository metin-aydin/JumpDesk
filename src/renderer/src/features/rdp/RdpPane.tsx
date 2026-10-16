import { useEffect, useRef } from 'react'
import Guacamole from 'guacamole-common-js'
import { t } from '@/lib/i18n'
import { previewRegistry } from '@/features/workspace/preview-registry'
import { observeSize, onTabHostMoved } from '@/features/windows/tab-hosts'

export type RdpState = 'connecting' | 'connected' | 'closed' | 'error'

export interface RdpPaneProps {
  tabId: string
  server: string
  tokenId: string
  visible: boolean
  active: boolean
  onState: (state: RdpState, detail?: string) => void
  /** lion'un `jms_event` bildirimleri (oturum duraklatma, paylaşım vb.). */
  onJmsEvent?: (event: string, data: unknown) => void
}

const KEYBOARD_LAYOUT = 'tr-tr-qwerty'
const RESIZE_DEBOUNCE_MS = 300

function lionWsUrl(server: string): string {
  const url = new URL(server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/lion/ws/connect/'
  url.search = ''
  return url.toString()
}

function supportedMimeTypes(): Record<string, string[]> {
  return {
    GUAC_IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
    GUAC_AUDIO: Guacamole.AudioPlayer.getSupportedTypes(),
    GUAC_VIDEO: Guacamole.VideoPlayer.getSupportedTypes()
  }
}

function errorText(status: Guacamole.Status): string {
  const code = status.code
  if (code === 0x0203 || code === 0x0201) return t('Uzak masaüstü sunucusuna ulaşılamadı')
  if (code === 0x0205) return t('Oturum başka bir bağlantı tarafından kapatıldı')
  if (code === 0x0301 || code === 0x0303) return t('Uzak masaüstü kimlik doğrulaması reddedildi')
  if (code === 0x0308) return t('Oturum zaman aşımına uğradı')
  return status.message || t('Bağlantı hatası ({code})', { code: `0x${code.toString(16)}` })
}

export function RdpPane({
  tabId,
  server,
  tokenId,
  visible,
  active,
  onState,
  onJmsEvent
}: RdpPaneProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onState, onJmsEvent })
  callbacks.current = { onState, onJmsEvent }
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useEffect(() => {
    const wrap = wrapRef.current
    const host = displayRef.current
    if (!wrap || !host) return

    const tunnel = new Guacamole.WebSocketTunnel(lionWsUrl(server))
    const client = new Guacamole.Client(tunnel)
    const display = client.getDisplay()
    const displayEl = display.getElement()
    host.appendChild(displayEl)
    display.showCursor(false)

    previewRegistry.set(tabId, () => {
      if (!display.getWidth()) return null
      const flat = display.flatten()
      const scale = Math.min(1, 480 / flat.width)
      const thumb = document.createElement('canvas')
      thumb.width = Math.round(flat.width * scale)
      thumb.height = Math.round(flat.height * scale)
      thumb.getContext('2d')?.drawImage(flat, 0, 0, thumb.width, thumb.height)
      return { kind: 'image', src: thumb.toDataURL('image/jpeg', 0.7) }
    })

    let lastClipboard = ''
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    let connected = false

    const fitScale = (): void => {
      const w = display.getWidth()
      const h = display.getHeight()
      if (!w || !h || !wrap.clientWidth || !wrap.clientHeight) return
      const scale = Math.min(wrap.clientWidth / w, wrap.clientHeight / h)
      if (Math.abs(display.getScale() - scale) > 0.001) display.scale(scale)
    }
    display.onresize = () => fitScale()

    const originalInstruction = tunnel.oninstruction
    tunnel.oninstruction = (opcode, args) => {
      originalInstruction?.(opcode, args)
      if (opcode === 'jms_event') {
        let data: unknown = args[1]
        try {
          data = JSON.parse(String(args[1]))
        } catch {
          /* veri düz metin olabilir */
        }
        callbacks.current.onJmsEvent?.(String(args[0]), data)
      }
    }

    client.onstatechange = (state) => {
      if (state === 3) {
        connected = true
        callbacks.current.onState('connected')
        fitScale()
      } else if (state === 5) {
        callbacks.current.onState(
          connected ? 'closed' : 'error',
          connected ? undefined : t('Uzak masaüstüne bağlanılamadı')
        )
      } else if (state === 1 || state === 2) {
        callbacks.current.onState('connecting')
      }
    }
    client.onerror = (status) => callbacks.current.onState('error', errorText(status))
    tunnel.onerror = (status) => callbacks.current.onState('error', errorText(status))

    client.onclipboard = (stream, mimetype) => {
      if (!/^text\//.test(mimetype)) return
      const reader = new Guacamole.StringReader(stream)
      let text = ''
      reader.ontext = (chunk) => (text += chunk)
      reader.onend = () => {
        lastClipboard = text
        void navigator.clipboard.writeText(text).catch(() => undefined)
      }
    }

    const pushClipboard = async (): Promise<void> => {
      if (!connected) return
      const text = await navigator.clipboard.readText().catch(() => '')
      if (!text || text === lastClipboard) return
      lastClipboard = text
      const stream = client.createClipboardStream('text/plain')
      const writer = new Guacamole.StringWriter(stream)
      writer.sendText(text)
      writer.sendEnd()
    }

    const mouse = new Guacamole.Mouse(displayEl)
    mouse.onEach(['mousedown', 'mousemove', 'mouseup'], (e) => {
      client.sendMouseState((e as Guacamole.Mouse.Event).state, true)
    })

    const keyboard = new Guacamole.Keyboard(wrap)
    keyboard.onkeydown = (keysym) => {
      client.sendKeyEvent(1, keysym)
      return false
    }
    keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym)

    const onFocus = (): void => void pushClipboard()
    const onBlur = (): void => keyboard.reset()
    wrap.addEventListener('focus', onFocus)
    wrap.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)

    const ro = observeSize(wrap, () => {
      if (!visibleRef.current) return
      fitScale()
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (connected && wrap.clientWidth > 100 && wrap.clientHeight > 100) {
          client.sendSize(wrap.clientWidth, wrap.clientHeight)
        }
      }, RESIZE_DEBOUNCE_MS)
    })
    const unsubscribeMoved = onTabHostMoved(tabId, () => {
      ro.restart()
      fitScale()
    })

    const params = new URLSearchParams({
      TOKEN_ID: tokenId,
      GUAC_WIDTH: String(Math.max(wrap.clientWidth, 800)),
      GUAC_HEIGHT: String(Math.max(wrap.clientHeight, 600)),
      GUAC_DPI: '96',
      GUAC_KEYBOARD: KEYBOARD_LAYOUT,
      GUAC_TIMEZONE: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    for (const [key, values] of Object.entries(supportedMimeTypes())) {
      for (const v of values) params.append(key, v)
    }
    callbacks.current.onState('connecting')
    client.connect(params.toString())

    return () => {
      ro.stop()
      unsubscribeMoved()
      if (resizeTimer) clearTimeout(resizeTimer)
      wrap.removeEventListener('focus', onFocus)
      wrap.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      keyboard.onkeydown = null
      keyboard.onkeyup = null
      keyboard.reset()
      previewRegistry.delete(tabId)
      client.disconnect()
      displayEl.remove()
    }
  }, [server, tokenId, tabId])

  useEffect(() => {
    if (active && visible) wrapRef.current?.focus()
  }, [active, visible])

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black outline-none"
      onMouseEnter={() => wrapRef.current?.focus()}
    >
      {/* Guacamole varsayılan katman tuvaline z-index -1 verir; kendi katman bağlamı olmazsa siyah zeminin arkasında kalır. */}
      <div
        ref={displayRef}
        data-rdp-display
        className="isolate [&_canvas]:!cursor-default"
        style={{ cursor: 'none' }}
      />
    </div>
  )
}
