import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { ArrowDown } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { isAppShortcut, isMac } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useSnippets } from '@/stores/snippets'
import { alarmConnectWaitMs, alarmSnippetWaitMs } from '@/stores/notification-settings'
import { previewRegistry } from '@/features/workspace/preview-registry'
import { usePreferences } from '@/stores/preferences'
import { terminalFontSize, useFontSizes } from '@/stores/font-sizes'
import { useSessionInfo } from '@/stores/session-info'
import { clearStats, markStatsRequested, recordStats } from '@/stores/server-stats'
import { cacheCommandNames, cachedCommandNames } from '@/stores/command-cache'
import { broadcastPeers, findTab, useWorkspace } from '@/stores/workspace'
import { aiAutocompleteReady, useAi } from '@/stores/ai'
import { AiAssistPopup, type AiAnchor } from '@/features/ai/AiAssistPopup'
import { useStatusBarVisible } from '@/features/server-status/use-status-bar'
import { useTheme } from '@/stores/theme'
import { AutocompletePopup, type AutocompleteState } from './AutocompletePopup'
import type { CursorAnchor } from './CursorPopup'
import { computeSuggestions } from './autocomplete'
import { paintInputLine } from './command-highlight'
import { readInputLine } from './input-line'
import { KokoConnection, type KokoMessage, type KokoState } from './koko-connection'
import { OutputHighlighter } from './output-highlighter'
import { HighlightDecorator } from './highlight-decorator'
import { observeSize, onTabHostMoved } from '@/features/windows/tab-hosts'
import { AlarmDetector } from '@/features/alarms/alarm-detector'
import { reportAlarm } from '@/features/alarms/report'
import { terminalRegistry, type TerminalHandle } from './registry'
import { SetupEchoGate, attachIntegration, buildSetupCommand } from './shell-integration'
import { TerminalSearchBar } from './TerminalSearchBar'
import { raiseActiveMatch } from './search-decorations'
import { terminalTheme } from './themes'
import {
  acquireWebgl,
  forgetTerminal,
  needsWebgl,
  releaseWebgl,
  setWebglVisible
} from './webgl-pool'
import { patchHiddenRendering, resyncViewport, setRenderingPaused } from './xterm-patches'

export const TERMINAL_FONT =
  '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Mono", Menlo, monospace'
const RESIZE_THROTTLE_MS = 50
/** Yazı boyutu ayarı değişmeyi bıraktıktan sonra terminallere uygulanma gecikmesi. */
const FONT_APPLY_DELAY_MS = 150
const IDLE_BEFORE_SETUP_MS = 400
const MAX_WAIT_FOR_PROMPT_MS = 6000
/** Varsayılan satır yüksekliği (yazı yüksekliğinin katı); terminal yüksekliğini doldurmak için ±1 piksel oynar. */
const LINE_HEIGHT = 1.15
/** Kurulum yanıtı bekleme süresi dolduktan sonra entegrasyonun kurulamadı sayılmasına kadar geçen süre. */
const INTEGRATION_GRACE_MS = 10_000
const APP_KEYS = ['T', 'W', 'B', 'F', 'A', 'E', 'P', 'S', 'K', 'Tab', 'Enter']

export interface TerminalPaneProps {
  tabId: string
  wsUrl: string
  visible: boolean
  active: boolean
  /** Uzak kabuğa entegrasyon betiği kurulsun mu (yalnız linux/unix + ssh). */
  integrate: boolean
  /** Bağlantı hazır olunca çalıştırılacak komutlar (sunucuya özel otomatik snippetler). */
  autoRunCommands: () => string[]
  onState: (state: KokoState, detail?: string) => void
  onIps?: (ips: string[]) => void
  /** Pane görünmezken yeni çıktı geldiğinde çağrılır (ilk karşılama çıktısı sayılmaz). */
  onActivity?: () => void
  onMessage?: (msg: KokoMessage) => void
}

/** Girdi yalnız yazdırılabilir karakterlerden mi oluşuyor (denetim tuşu değil). */
// eslint-disable-next-line no-control-regex -- denetim karakterleri (C0 ve DEL) dışarıda bırakılır
const PRINTABLE = /^[^\x00-\x1f\x7f]+$/
const isPrintable = (data: string): boolean => PRINTABLE.test(data)

/** Ekranı ya da geri kaydırma arabelleğini silen diziler: ED 2/3 ve RIS. */
const CLEAR_SEQUENCES = ['\x1b[2J', '\x1b[3J', '\x1bc']

const HINT_HALF_WIDTH = 150
const HINT_ROOM_ABOVE = 56

interface LinkHintState {
  x: number
  y: number
  /** Terminal kabının genişliği (ipucunu kenarlara taşırmamak için). */
  width: number
  uri: string
}

/** Bağlantı ipucu: imlecin üstünde (yer yoksa altında), terminal kenarlarına taşmadan. */
function LinkHint({ hint }: { hint: LinkHintState }): React.JSX.Element {
  const t = useT()
  const [before, after] = t('Bağlantıyı Açmak İçin {key} + Tıklayın').split('{key}')
  const width = hint.width
  const above = hint.y > HINT_ROOM_ABOVE
  const left =
    width > HINT_HALF_WIDTH * 2
      ? Math.min(Math.max(hint.x, HINT_HALF_WIDTH), width - HINT_HALF_WIDTH)
      : width / 2
  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-30 max-w-[min(18.75rem,calc(100%-1rem))] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-[11.5px] text-popover-foreground shadow-md',
        above && '-translate-y-full'
      )}
      style={{ left, top: above ? hint.y - 10 : hint.y + 18 }}
    >
      <div className="truncate font-mono text-[11px] text-muted-foreground">{hint.uri}</div>
      <div className="whitespace-nowrap">
        {before}
        <kbd className="rounded border bg-muted px-1 font-mono text-[10.5px]">
          {isMac ? '⌘' : 'Ctrl'}
        </kbd>
        {after}
      </div>
    </div>
  )
}

export function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const { tabId, wsUrl, visible, active } = props
  const belowBar = useStatusBarVisible(tabId) && props.integrate
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<AutocompleteState | null>(null)
  const popupRef = useRef<AutocompleteState | null>(null)
  popupRef.current = popup
  const acceptRef = useRef<(index: number) => void>(() => undefined)
  const termRef = useRef<Terminal | null>(null)
  const connRef = useRef<KokoConnection | null>(null)
  const visibleRef = useRef(visible)
  /** Yazı boyutunu terminale uygular (ana etkide kurulur; görünür olunca da çağrılır). */
  const syncFontRef = useRef<() => void>(() => undefined)
  const sizeChangedRef = useRef<() => void>(() => undefined)
  const decoratorRef = useRef<HighlightDecorator | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  visibleRef.current = visible
  const resolvedTheme = useTheme((s) => s.info.resolved)
  const [search, setSearch] = useState<SearchAddon | null>(null)
  const [searchBar, setSearchBar] = useState<{ seed: string; nonce: number } | null>(null)
  /** Bağlantının üzerindeyken imlecin üstünde gösterilen ipucu (konum terminal kabına göre). */
  const [linkHint, setLinkHint] = useState<LinkHintState | null>(null)
  /** Görünüm kaydırma geçmişinde yukarıda; alttaki "En Alta Kaydır" bandı gösterilir (yükseklik iki satır). */
  const [scrolledUp, setScrolledUp] = useState<{ rowHeight: number } | null>(null)
  /** Autocomplete'in yapay zeka kipi açık; konum imlecin altı (ya da üstü). */
  const [aiAnchor, setAiAnchor] = useState<AiAnchor | null>(null)
  const aiReady = useAi((s) => aiAutocompleteReady(s.config))
  const aiReadyRef = useRef(aiReady)
  aiReadyRef.current = aiReady
  const openAiRef = useRef<() => void>(() => undefined)
  const insertAiRef = useRef<(command: string) => void>(() => undefined)
  /** Yapay zekaya gönderilen tek sunucu bilgisi: türü (ör. linux). */
  const platform = useWorkspace(
    (s) => findTab(s, tabId)?.asset?.platformType?.toLowerCase() || 'linux'
  )
  const t = useT()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    // Ayar açıksa ölçüm kurulumla başlar; şeridin "Durumu Göster" düğmesi bu oturumda çizilmez.
    if (propsRef.current.integrate && usePreferences.getState().serverStatus)
      markStatsRequested(tabId)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    let idleTimer: ReturnType<typeof setInterval> | null = null
    let ro: ReturnType<typeof observeSize> | null = null
    let decorator: HighlightDecorator | null = null
    const info = useSessionInfo.getState()

    const term = new Terminal({
      fontFamily: TERMINAL_FONT,
      fontSize: terminalFontSize(useFontSizes.getState()),
      lineHeight: LINE_HEIGHT,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
      smoothScrollDuration: 0,
      customGlyphs: true,
      drawBoldTextInBrightColors: true,
      macOptionIsMeta: true,
      // Sağ tık seçili metni kopyalar ya da yapıştırır; macOS'ta varsayılan kelime seçimi buna engel olur.
      rightClickSelectsWord: false,
      theme: terminalTheme(useTheme.getState().info.resolved)
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const updateScrolled = (): void => {
      const buf = term.buffer.active
      if (buf.viewportY >= buf.baseY) {
        setScrolledUp(null)
        return
      }
      const screen = term.element?.querySelector('.xterm-screen')
      const rowHeight = screen && term.rows ? screen.getBoundingClientRect().height / term.rows : 18
      setScrolledUp((prev) =>
        prev && Math.abs(prev.rowHeight - rowHeight) < 0.5 ? prev : { rowHeight }
      )
    }
    term.onScroll(updateScrolled)
    term.buffer.onBufferChange(updateScrolled)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    // Bağlantılar yalnız Ctrl+Tık (macOS'ta ⌘+Tık) ile açılır; düz tık terminalde seçim yapmaya devam eder.
    term.loadAddon(
      new WebLinksAddon(
        (e, uri) => {
          if (isMac ? e.metaKey : e.ctrlKey) {
            setLinkHint(null)
            window.open(uri, '_blank')
          }
        },
        {
          hover: (e, uri) => {
            const box = wrapRef.current?.getBoundingClientRect()
            if (box)
              setLinkHint({
                x: e.clientX - box.left,
                y: e.clientY - box.top,
                width: box.width,
                uri
              })
          },
          leave: () => setLinkHint(null)
        }
      )
    )
    const serializer = new SerializeAddon()
    term.loadAddon(serializer)
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    raiseActiveMatch(term)
    setSearch(searchAddon)
    previewRegistry.set(tabId, () => {
      if (!term.element) return null
      const buf = term.buffer.active
      const html = serializer.serializeAsHTML({
        includeGlobalBackground: true,
        range: { startLine: buf.baseY, endLine: buf.baseY + term.rows - 1, startCol: 0 }
      })
      const start = html.indexOf('<!--StartFragment-->')
      const end = html.indexOf('<!--EndFragment-->')
      return {
        kind: 'html',
        html: start >= 0 && end > start ? html.slice(start + 20, end) : html,
        background: term.options.theme?.background ?? '#000'
      }
    })
    termRef.current = term

    const live: TerminalHandle['live'] = { entries: [], commandNames: [], atPrompt: false }
    let commandSet = new Set<string>()
    let entrySet = new Set<string>()
    let dismissedText: string | null = null
    /** Geçmişte ok tuşlarıyla gezinirken öneri listesi kendiliğinden açılmaz; yazmaya başlayınca yeniden açılır. */
    let autoSuggest = true
    /** Ctrl+Space ile elle açıldı; veri olmasa da boş liste gösterilir. */
    let manualOpen = false
    let outstanding = 0
    let refreshQueued = false
    let submittedFrom: { x: number; y: number } | null = null
    let autoRunAfterPrompt = false
    let activityArmed = false
    const armActivity = (): void => {
      setTimeout(() => (activityArmed = true), 1500)
    }
    // Kurulum yanıtı bekleme süresinden sonra gelebilir (yavaş giriş betikleri, yoğun sunucu); entegrasyondan gelen
    // her ileti oturumun entegrasyonunun çalıştığını gösterir. Yanıt gelmezse oturum bir süre daha "hazırlanıyor"
    // sayılır, sonra kurulamadı olarak işaretlenir (durum şeridi yerine neden satırı kısa süreliğine görünüp kaybolmaz).
    let failTimer: ReturnType<typeof setTimeout> | null = null
    const integrationAlive = (): void => {
      if (failTimer) {
        clearTimeout(failTimer)
        failTimer = null
      }
      const state = useSessionInfo.getState().byTab[tabId]?.integration
      if (state === 'pending' || state === 'failed') info.patch(tabId, { integration: 'ready' })
    }
    const integration = attachIntegration(term, {
      onCwd: (cwd) => {
        integrationAlive()
        live.cwd = cwd
        info.patch(tabId, { cwd })
      },
      onListing: (entries) => {
        live.entries = entries
        entrySet = new Set(entries)
      },
      onCommand: (num, command) => info.appendCommand(tabId, num, command),
      onHistory: (history) => info.patch(tabId, { history }),
      onIps: (ips) => {
        integrationAlive()
        info.patch(tabId, { ips })
        propsRef.current.onIps?.(ips)
      },
      onCommandNames: (names) => {
        live.commandNames = names
        commandSet = new Set(names)
        const assetId = findTab(useWorkspace.getState(), tabId)?.asset?.id
        if (assetId) cacheCommandNames(assetId, names)
      },
      onStats: (payload) => {
        if (disposed) return
        integrationAlive()
        recordStats(tabId, payload)
      },
      onPromptEnd: (pos) => {
        submittedFrom = null
        autoSuggest = true
        live.promptEnd = pos
        live.atPrompt = true
        dismissedText = null
        if (autoRunAfterPrompt) {
          autoRunAfterPrompt = false
          setTimeout(runAutoCommands, 0)
        }
      }
    })

    /**
     * Kabuk komut bekliyor mu: tam ekran program yoksa ve kabuk entegrasyonu çalışıyorsa istem sonu görülmüş, Enter'a
     * henüz basılmamış olmalı. Entegrasyon yoksa (ağ cihazı, kurulamadı) istem bilinemez; öneriler yine açılabilir.
     */
    const commandLineOpen = (): boolean => {
      if (term.buffer.active.type !== 'normal') return false
      const integrated = useSessionInfo.getState().byTab[tabId]?.integration === 'ready'
      return !integrated || live.atPrompt
    }

    /** Henüz çizilmemiş bir açılışı da iptal eder (aynı değerde React yeniden çizmez). */
    const closePopup = (): void => {
      manualOpen = false
      popupRef.current = null
      setPopup(null)
    }

    const openSearch = (text?: string): void =>
      setSearchBar((prev) => ({
        seed:
          text ?? (term.hasSelection() ? term.getSelection().split('\n')[0] : (prev?.seed ?? '')),
        nonce: (prev?.nonce ?? 0) + 1
      }))

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (APP_KEYS.some((k) => isAppShortcut(e, k))) return false
      // Ctrl+F (⌘F) kabukta terminal aramasını açar; less/vim gibi tam ekran programlarda (alternatif ekran) tuş
      // programa gider, orada sayfa ilerletme tuşudur.
      const findCombo = isMac
        ? e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f'
        : e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f'
      if (findCombo && term.buffer.active.type === 'normal') {
        e.preventDefault()
        openSearch()
        return false
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === 'Space') {
        // Komut satırı yokken (tail -f, less gibi bir program çalışıyor) tuş programa gider.
        if (!commandLineOpen()) return true
        e.preventDefault()
        // Öneriler elle açıkken ikinci Ctrl+Space yapay zekaya sorma kipine geçer.
        if (aiReadyRef.current && manualOpen && popupRef.current) {
          openAiRef.current()
          return false
        }
        manualOpen = true
        dismissedText = null
        refreshInput()
        return false
      }
      const open = popupRef.current
      if (open && open.items.length === 0 && e.key !== 'Escape') {
        closePopup()
      } else if (open && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const delta = e.key === 'ArrowDown' ? 1 : -1
          setPopup({ ...open, index: (open.index + delta + open.items.length) % open.items.length })
          return false
        }
        if (e.key === 'Tab' || e.key === 'ArrowRight') {
          e.preventDefault()
          acceptRef.current(open.index)
          return false
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          dismissedText = live.promptEnd
            ? (readInputLine(term, live.promptEnd)?.text ?? null)
            : null
          closePopup()
          return false
        }
      }
      const copyCombo = isMac
        ? e.metaKey && e.key === 'c'
        : e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'C'
      const pasteCombo = isMac
        ? e.metaKey && e.key === 'v'
        : e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'V'
      if (copyCombo) {
        if (term.hasSelection()) void navigator.clipboard.writeText(term.getSelection())
        return false
      }
      if (pasteCombo) {
        void navigator.clipboard.readText().then((text) => text && term.paste(text))
        return false
      }
      return true
    })

    /**
     * Sağ tık (Windows Terminal ve PuTTY'deki gibi): seçim varsa kopyalar ve seçimi kaldırır, yoksa panodakini
     * yapıştırır. Fareyi kullanan tam ekran programlar (vim, mc, htop) sağ tıkı kendisi alır; Shift+sağ tık yine
     * yapıştırır.
     */
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      if (term.modes.mouseTrackingMode !== 'none' && !e.shiftKey) return
      if (term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return
      }
      term.focus()
      void navigator.clipboard.readText().then((text) => {
        if (text && !disposed) term.paste(text)
      })
    }
    host.addEventListener('contextmenu', onContextMenu)

    /**
     * Hücre yüksekliği tam cihaz pikseli olduğundan terminal yüksekliği satırlara tam bölünmez; artan alan (bir satıra
     * kadar) terminalin üstünde boşluk olarak kalır. Hücre yüksekliği ±1 piksel içinde artanı en aza indiren değere
     * ayarlanır; aynı yükseklikteki paneller (bir satırdaki paneller) aynı değeri alır.
     */
    const fillHeight = (): void => {
      const charHeight = (term as unknown as { _core?: { _charSizeService?: { height?: number } } })
        ._core?._charSizeService?.height
      if (!charHeight) return
      const dpr = host.ownerDocument.defaultView?.devicePixelRatio ?? 1
      const deviceChar = Math.ceil(charHeight * dpr)
      const available = Math.floor(host.clientHeight * dpr)
      const base = Math.floor(deviceChar * LINE_HEIGHT)
      let best = base
      for (const cell of [base - 1, base + 1])
        if (cell > deviceChar && available % cell < available % best) best = cell
      const lineHeight = best === base ? LINE_HEIGHT : (best + 0.5) / deviceChar
      if (term.options.lineHeight === lineHeight) return
      term.options.lineHeight = lineHeight
      resyncViewport(term)
    }

    const sizeChanged = (): void => {
      if (!visibleRef.current || host.clientWidth === 0) return
      fillHeight()
      const dims = fit.proposeDimensions()
      if (!dims || !Number.isFinite(dims.cols) || dims.cols < 2 || dims.rows < 1) return
      if (dims.cols !== term.cols || dims.rows !== term.rows) {
        term.resize(dims.cols, dims.rows)
        connRef.current?.resize(dims.cols, dims.rows)
      }
    }
    sizeChangedRef.current = sizeChanged

    /**
     * Yazı boyutu değişince terminal yeniden ölçülür ve glifleri yeniden çizilir; çok sayıda oturumda bunu hepsine aynı
     * anda yapmak arayüzü kilitler. Görünen terminaller kaydırıcı durunca bir kez, gizli olanlar ekrana geldiklerinde
     * güncellenir.
     */
    let fontTimer: ReturnType<typeof setTimeout> | null = null
    const syncFont = (): void => {
      const size = terminalFontSize(useFontSizes.getState())
      if (term.options.fontSize === size) return
      term.options.fontSize = size
      requestAnimationFrame(sizeChanged)
    }
    syncFontRef.current = syncFont
    const unsubscribeFont = useFontSizes.subscribe((sizes, prev) => {
      if (sizes.terminal === prev.terminal && sizes.ui === prev.ui) return
      if (fontTimer) clearTimeout(fontTimer)
      fontTimer = setTimeout(() => {
        fontTimer = null
        if (visibleRef.current) syncFont()
      }, FONT_APPLY_DELAY_MS)
    })

    const highlighter = new OutputHighlighter()
    const detector = new AlarmDetector((rule, line) => reportAlarm(tabId, rule, line))
    const alarmDecoder = new TextDecoder('utf-8')
    /** Kabuk entegrasyonu yokken gönderilen komutu bilmek için yazılan satır izlenir (alarm yankısı için). */
    let typedLine = ''
    const decoder = new TextDecoder('utf-8')
    const refreshInput = (): void => {
      refreshQueued = false
      const prefs = usePreferences.getState()
      const buf = term.buffer.active
      const promptReady =
        live.atPrompt && live.promptEnd && buf.type === 'normal' && buf.viewportY === buf.baseY
      if (!promptReady && !manualOpen) {
        closePopup()
        return
      }
      const line = promptReady ? readInputLine(term, live.promptEnd!) : null
      if (promptReady && (!line || line.text.includes('(reverse-i-search)')) && !manualOpen) {
        closePopup()
        return
      }
      if (line && prefs.commandHighlight)
        paintInputLine(term, line, { commandNames: commandSet, entries: entrySet })
      const text = line?.text ?? ''
      const atEnd = !line || line.cursor === line.text.length
      const autoAllowed = prefs.autocomplete && autoSuggest && atEnd && text !== dismissedText
      if (!manualOpen && !autoAllowed) {
        closePopup()
        return
      }
      const items = computeSuggestions(
        text,
        {
          history: useSessionInfo.getState().byTab[tabId]?.history ?? [],
          snippets: useSnippets.getState().snippets,
          commandNames: live.commandNames,
          entries: live.entries
        },
        manualOpen
      )
      const screen = term.element?.querySelector('.xterm-screen')
      const wrap = wrapRef.current
      if ((!items.length && !manualOpen) || !screen || !wrap) {
        closePopup()
        return
      }
      const previous = popupRef.current
      const sameItems =
        previous &&
        previous.items.map((i) => i.label).join('\n') === items.map((i) => i.label).join('\n')
      setPopup({ items, index: sameItems ? previous.index : 0, anchor: cursorAnchor(screen) })
    }

    /** İmlecin bulunduğu hücre (pencereye göre); öneri ve yapay zeka pencereleri buraya hizalanır. */
    const cursorAnchor = (screen: Element): CursorAnchor => {
      const sr = screen.getBoundingClientRect()
      const buf = term.buffer.active
      const cellW = sr.width / term.cols
      const cellH = sr.height / term.rows
      return { x: sr.left + buf.cursorX * cellW, y: sr.top + buf.cursorY * cellH, height: cellH }
    }

    /** Yapay zeka kipini imlecin hizasında açar (yalnız normal ekranda; tam ekran programlarda değil). */
    openAiRef.current = (): void => {
      const screen = term.element?.querySelector('.xterm-screen')
      if (!screen || !commandLineOpen()) return
      closePopup()
      setAiAnchor(cursorAnchor(screen))
    }

    const scheduleRefresh = (): void => {
      if (refreshQueued) return
      refreshQueued = true
      requestAnimationFrame(refreshInput)
    }

    const writeOutput = (bytes: Uint8Array, done: () => void): void => {
      const plain = alarmDecoder.decode(bytes, { stream: true })
      // Ekran temizlenince (clear, reset) gönderilen komutun eski konumu geçersizdir; yeniden boyanırsa boş ekranda
      // eski satır belirir.
      if (submittedFrom && CLEAR_SEQUENCES.some((seq) => plain.includes(seq))) submittedFrom = null
      if (term.buffer.active.type !== 'alternate') detector.feed(plain)
      outstanding++
      const finished = (): void => {
        outstanding--
        done()
        // Boyamanın imleç konumları yazıldığı andaki kaydırmaya göre hesaplanır; sırada çıktı bekliyorken yazılırsa
        // ekran kaydıkça boya başka bir satıra düşer. Bu yüzden yalnız bekleyen yazma kalmadığında boyanır.
        if (submittedFrom && outstanding === 0) {
          const line = readInputLine(term, submittedFrom)
          if (line && usePreferences.getState().commandHighlight) {
            paintInputLine(term, line, { commandNames: commandSet, entries: entrySet })
          }
          const buf = term.buffer.active
          const lastRow = line?.cells[line.cells.length - 1]?.y ?? submittedFrom.y
          if (!line || buf.baseY + buf.cursorY > lastRow) submittedFrom = null
        }
        if (outstanding === 0 && live.atPrompt) scheduleRefresh()
      }
      if (term.buffer.active.type === 'alternate' || !usePreferences.getState().outputHighlight) {
        const pending = decoder.decode()
        if (pending) term.write(pending)
        term.write(bytes, finished)
        return
      }
      term.write(highlighter.process(decoder.decode(bytes, { stream: true })), finished)
    }

    let lastOutputAt = 0
    // Kurulumdan sonra bırakılan çıktı da alarm ve renk süzgeçlerinden geçer; büyük entegrasyon verisinin (OSC)
    // başlangıcını görmeyen süzgeç, devamını düz metin sanır.
    const gate = new SetupEchoGate(
      (data) => (typeof data === 'string' ? term.write(data) : writeOutput(data, () => undefined)),
      (ok) => {
        if (ok) info.patch(tabId, { integration: 'ready' })
        else
          failTimer = setTimeout(() => {
            failTimer = null
            if (!disposed) info.patch(tabId, { integration: 'failed' })
          }, INTEGRATION_GRACE_MS)
        if (ok) autoRunAfterPrompt = true
        else runAutoCommands()
        armActivity()
      }
    )

    /** Bağlanınca çalışan snippetler gönderilir; alarmlar ancak bunlardan belli bir süre sonra bildirilmeye başlar. */
    const runAutoCommands = (): void => {
      const commands = propsRef.current.autoRunCommands()
      commands.forEach((c) => detector.ignoreEcho(c))
      if (commands.length) {
        // Komut çalışmaya başladı; yeni istem gelene kadar komut satırı yok.
        live.atPrompt = false
        closePopup()
        connRef.current?.input(commands.map((c) => `${c}\r`).join(''))
      }
      detector.release(alarmSnippetWaitMs())
    }

    const waitForPrompt = (): void => {
      const startedAt = Date.now()
      idleTimer = setInterval(() => {
        const idle = lastOutputAt > 0 && Date.now() - lastOutputAt > IDLE_BEFORE_SETUP_MS
        if (!idle && Date.now() - startedAt < MAX_WAIT_FOR_PROMPT_MS) return
        if (idleTimer) clearInterval(idleTimer)
        idleTimer = null
        if (propsRef.current.integrate) {
          info.patch(tabId, { integration: 'pending' })
          gate.start()
          const prefs = usePreferences.getState()
          if (prefs.serverStatus) markStatsRequested(tabId)
          // Komut adları önbellekte tazeyse hemen kullanılır ve sunucudan istenmez.
          const assetId = findTab(useWorkspace.getState(), tabId)?.asset?.id
          const cached = assetId ? cachedCommandNames(assetId) : null
          if (cached) {
            live.commandNames = cached
            commandSet = new Set(cached)
          }
          void buildSetupCommand({
            statsIntervalSec: prefs.serverStatus ? prefs.serverStatusInterval : 0,
            commandNames: !cached
          }).then((command) => {
            if (!disposed) connRef.current?.input(command)
          })
        } else {
          runAutoCommands()
          armActivity()
        }
      }, 100)
    }

    void (async () => {
      await document.fonts
        .load(`${term.options.fontSize}px "JetBrains Mono Variable"`)
        .catch(() => undefined)
      if (disposed) return
      term.open(host)
      patchHiddenRendering(term)
      setWebglVisible(term, visibleRef.current)
      if (!visibleRef.current) setRenderingPaused(term, true)
      // Terminale tıklanınca yapay zeka kipi kapanır.
      term.textarea?.addEventListener('focus', () => setAiAnchor(null))
      if (visibleRef.current) acquireWebgl(term)
      sizeChanged()
      decorator = new HighlightDecorator(term)
      decorator.setActive(visibleRef.current)
      decoratorRef.current = decorator

      const conn = new KokoConnection(wsUrl, {
        onOutput: (bytes, done) => {
          lastOutputAt = Date.now()
          if (activityArmed && !visibleRef.current) propsRef.current.onActivity?.()
          if (gate.feed(bytes)) done()
          else writeOutput(bytes, done)
        },
        onState: (state, detail) => {
          if (state === 'connected') {
            sizeChanged()
            waitForPrompt()
            // Bağlantıdan sonraki ilk saniyelerde (karşılama çıktısı, giriş betikleri) alarm bildirilmez; bağlanınca
            // çalışacak snippetler varsa hepsi gönderilene kadar da.
            detector.startAfter(alarmConnectWaitMs())
            if (propsRef.current.autoRunCommands().length) detector.hold()
          }
          propsRef.current.onState(state, detail)
        },
        onMessage: (msg) => propsRef.current.onMessage?.(msg),
        getSize: () => ({ cols: term.cols, rows: term.rows })
      })
      connRef.current = conn
      const HISTORY_KEYS = new Set([
        '\x1b[A',
        '\x1b[B',
        '\x1bOA',
        '\x1bOB',
        '\x1b[5~',
        '\x1b[6~',
        '\x10',
        '\x0e',
        '\x12'
      ])
      const sendTracked = (data: string): void => {
        if (HISTORY_KEYS.has(data)) {
          autoSuggest = false
          closePopup()
        } else if (data === '\x7f' || data === '\b' || isPrintable(data)) {
          autoSuggest = true
        }
        if (isPrintable(data)) typedLine += data
        else if (data === '\x7f' || data === '\b') typedLine = typedLine.slice(0, -1)
        if (data.includes('\r')) {
          // Gönderilen metnin yankısı alarm sayılmaz. Ekrandaki komut satırı yalnız istemdeyken okunur (geçmişten
          // getirilen komut gibi); bir program çalışırken (ör. tail -f) eski istemin satırı önceki komuttur.
          const before = data.slice(0, data.indexOf('\r'))
          detector.ignoreEcho(typedLine + before)
          const shown =
            live.atPrompt && live.promptEnd ? readInputLine(term, live.promptEnd)?.text : undefined
          if (shown && shown !== typedLine + before) detector.ignoreEcho(shown)
          typedLine = ''
        } else if (data === '\x03') typedLine = ''
        if (data.includes('\r') || data === '\x03' || data === '\x04') {
          if (data.includes('\r') && live.atPrompt && live.promptEnd) submittedFrom = live.promptEnd
          live.atPrompt = data === '\x03' ? live.atPrompt : false
          closePopup()
        }
        conn.input(data)
      }
      term.onData((data) => {
        sendTracked(data)
        for (const id of broadcastPeers(tabId)) terminalRegistry.get(id)?.send(data)
      })
      term.onBinary((data) => conn.input(data))
      acceptRef.current = (index) => {
        const item = popupRef.current?.items[index]
        if (!item) return
        closePopup()
        sendTracked(item.insert)
        for (const id of broadcastPeers(tabId)) terminalRegistry.get(id)?.send(item.insert)
        term.focus()
      }
      // Yapay zekanın önerdiği komut satırdaki metnin yerine yazılır (Ctrl+E, Ctrl+U satırı temizler); satır sonu
      // gönderilmez, komut ancak kullanıcı Enter'a basınca çalışır.
      insertAiRef.current = (command) => {
        const data = `\x05\x15${command}`
        dismissedText = command
        sendTracked(data)
        for (const id of broadcastPeers(tabId)) terminalRegistry.get(id)?.send(data)
        setAiAnchor(null)
        term.focus()
      }
      conn.connect()

      terminalRegistry.set({
        tabId,
        term,
        connection: conn,
        send: (text) => sendTracked(text),
        run: (command) => sendTracked(`${command.replace(/\r?\n/g, '\r')}\r`),
        focus: () => term.focus(),
        openSearch,
        live
      })

      ro = observeSize(host, () => {
        if (resizeTimer) return
        resizeTimer = setTimeout(() => {
          resizeTimer = null
          requestAnimationFrame(sizeChanged)
        }, RESIZE_THROTTLE_MS)
      })
    })()

    /**
     * Sekme başka bir pencereye taşındı: xterm yeni pencereyi `open` ile öğrenir (DPI, gözlemciler), WebGL tuvali yeni
     * belgede yeniden kurulur, yazı tipi o belgede yüklenince glif önbelleği temizlenip boyut yeniden hesaplanır.
     */
    const unsubscribeMoved = onTabHostMoved(tabId, () => {
      if (disposed || !term.element) return
      term.open(host)
      patchHiddenRendering(term)
      ro?.restart()
      if (visibleRef.current) {
        releaseWebgl(term)
        acquireWebgl(term)
      }
      void host.ownerDocument.fonts
        .load(`${term.options.fontSize}px "JetBrains Mono Variable"`)
        .catch(() => undefined)
        .then(() => {
          if (disposed) return
          term.clearTextureAtlas()
          sizeChanged()
          term.refresh(0, term.rows - 1)
        })
    })

    return () => {
      disposed = true
      host.removeEventListener('contextmenu', onContextMenu)
      if (failTimer) clearTimeout(failTimer)
      unsubscribeFont()
      if (fontTimer) clearTimeout(fontTimer)
      unsubscribeMoved()
      decorator?.dispose()
      decoratorRef.current = null
      if (resizeTimer) clearTimeout(resizeTimer)
      if (idleTimer) clearInterval(idleTimer)
      ro?.stop()
      gate.dispose()
      detector.dispose()
      integration.dispose()
      connRef.current?.close()
      connRef.current = null
      terminalRegistry.delete(tabId)
      previewRegistry.delete(tabId)
      clearStats(tabId)
      forgetTerminal(term)
      term.dispose()
      termRef.current = null
    }
  }, [tabId, wsUrl])

  // Çizim, sekme gizlendiği anda (aynı işlemdeki odak değişikliğinden önce) duraklatılır, görünür olunca sürdürülür.
  // WebGL bağlamı bekleyen terminal, bağlamı aldıktan sonra sürdürülür (aşağıdaki etki); önce sürdürülse bekleyen tam
  // çizim bir kez de DOM çiziciyle yapılır.
  useLayoutEffect(() => {
    const term = termRef.current
    if (!term?.element) return
    setWebglVisible(term, visible)
    if (!visible) setRenderingPaused(term, true)
    else if (!needsWebgl(term)) setRenderingPaused(term, false)
  }, [visible])

  // Gizlenen terminal WebGL çizicisini korur: bırakılırsa xterm DOM çiziciye geçer ve gizliyken çıktı aktıkça satırları
  // pahalı biçimde yeniden çizer (bkz. webgl-pool, xterm-patches). Görünür olunca bağlam yoksa yeniden alınır.
  useEffect(() => {
    const term = termRef.current
    if (!term || !term.element) return
    decoratorRef.current?.setActive(visible)
    if (!visible) return
    syncFontRef.current()
    acquireWebgl(term)
    setRenderingPaused(term, false)
    requestAnimationFrame(() => sizeChangedRef.current())
  }, [visible])

  useEffect(() => {
    if (active && visible) termRef.current?.focus()
  }, [active, visible])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = terminalTheme(resolvedTheme)
  }, [resolvedTheme])

  return (
    <div
      ref={wrapRef}
      className={cn(
        '@container relative min-h-0 flex-1 bg-terminal px-2',
        belowBar ? 'pt-0.5' : 'pt-1'
      )}
    >
      {/* Terminal tam satırlardan oluşur; satıra tamamlanmayan artık alan üstte kalır, durum şeridi varsa şeritle
          terminal arasında boşluk kalmasın diye altta. */}
      <div
        ref={hostRef}
        className={cn(
          'selectable flex h-full w-full flex-col',
          belowBar ? 'justify-start' : 'justify-end'
        )}
      />
      {scrolledUp && (
        <button
          type="button"
          onClick={() => {
            termRef.current?.scrollToBottom()
            termRef.current?.focus()
          }}
          onWheel={(e) => termRef.current?.scrollLines(Math.sign(e.deltaY) * 3)}
          className="absolute inset-x-0 bottom-0 z-10 flex cursor-pointer items-end justify-center pb-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          style={{
            height: Math.round(scrolledUp.rowHeight * 2),
            background: `linear-gradient(to top, ${terminalTheme(resolvedTheme).background} 35%, transparent)`
          }}
        >
          <span className="inline-flex items-center gap-1">
            <ArrowDown className="size-3.5" /> {t('En Alta Kaydır')}
          </span>
        </button>
      )}
      {popup && active && !aiAnchor && (
        <AutocompletePopup
          state={popup}
          onPick={(i) => acceptRef.current(i)}
          onAi={aiReady ? () => openAiRef.current() : undefined}
        />
      )}
      {aiAnchor && active && (
        <AiAssistPopup
          tabId={tabId}
          platform={platform}
          anchor={aiAnchor}
          onInsert={(command) => insertAiRef.current(command)}
          onClose={() => {
            setAiAnchor(null)
            termRef.current?.focus()
          }}
        />
      )}
      {linkHint && <LinkHint hint={linkHint} />}
      {search && searchBar && (
        <TerminalSearchBar
          key={searchBar.nonce}
          search={search}
          seed={searchBar.seed}
          onClose={() => {
            setSearchBar(null)
            termRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
