import type { Terminal } from '@xterm/xterm'

type SelectionPoint = [number, number] | undefined

/** xterm'in duraklatılmışken boyut değişikliğini beklettiği görev (`DebouncedIdleTask`). */
interface PausedResizeTask {
  set(task: () => void): void
  flush(): void
  _queue?: { clear?(): void }
}

/** xterm'in iç çizim hizmetinin bu yamada kullanılan alanları (xterm 6). */
interface RenderServiceInternals {
  _isPaused: boolean
  _needsFullRefresh: boolean
  _needsSelectionRefresh: boolean
  _selectionState: { start: SelectionPoint; end: SelectionPoint; columnSelectMode: boolean }
  _handleIntersectionChange(entry: { isIntersecting: boolean; intersectionRatio: number }): void
  handleSelectionChanged(
    start: SelectionPoint,
    end: SelectionPoint,
    columnSelectMode: boolean
  ): void
  handleBlur(): void
  handleFocus(): void
  _pausedResizeTask?: PausedResizeTask
  setRenderer?(renderer: unknown): void
  handleCharSizeChanged?(): void
  handleDevicePixelRatioChange?(): void
}

/** xterm'in kaydırma alanı (`Viewport`): kaydırma konumunu piksel olarak, satır yüksekliğiyle çarpıp tutar. */
interface ViewportInternals {
  _latestYDisp?: number
  _sync(ydisp?: number): void
}

interface PatchState {
  /** Duraklatılmışken gelen son odak olayı; çizim sürünce uygulanır. */
  pendingFocus: 'focus' | 'blur' | null
  focus(): void
  blur(): void
}

const STATE = Symbol('jumpdesk.renderPatch')
type PatchedService = RenderServiceInternals & { [STATE]?: PatchState }

function viewport(term: Terminal): ViewportInternals | null {
  const vp = (term as unknown as { _core?: { _viewport?: Partial<ViewportInternals> } })._core
    ?._viewport
  return vp && typeof vp._sync === 'function' ? (vp as ViewportInternals) : null
}

/** Kaydırma alanının konumunu görünen satırdan, geçerli satır yüksekliğiyle yeniden hesaplatır. */
export function resyncViewport(term: Terminal): void {
  const vp = viewport(term)
  if (!vp) return
  vp._latestYDisp = undefined
  vp._sync()
}

function renderService(term: Terminal): PatchedService | null {
  const core = (term as unknown as { _core?: { _renderService?: unknown } })._core
  const service = core?._renderService as PatchedService | undefined
  if (
    !service ||
    typeof service.handleSelectionChanged !== 'function' ||
    typeof service.handleBlur !== 'function' ||
    typeof service.handleFocus !== 'function' ||
    typeof service._handleIntersectionChange !== 'function' ||
    typeof service._isPaused !== 'boolean' ||
    typeof service._selectionState !== 'object' ||
    service._selectionState === null
  )
    return null
  return service
}

/**
 * xterm görünmeyen terminalin çizimini duraklatır, ama seçim değişikliği (çıktı her kaydığında gelir), odak kaybı ve
 * odak kazanma bildirimleri duraklatmayı atlayıp doğrudan çiziciye gider; DOM çizici bunlarda satırları yeniden
 * çizer. Gizli (display:none) terminalde karakter genişlikleri 0 ölçüldüğünden önbelleğe girmez, her karakter zorunlu
 * yerleşimle yeniden ölçülür ve arayüz saniyelerce kilitlenir. Duraklatılmışken bu bildirimler saklanır; çizim
 * sürünce xterm tam çizimle birlikte uygular. Seçim hiç yokken gelen seçim bildirimi (görünür terminalde de her
 * kaydırmada tüm satırları yeniden çizdirir) atlanır.
 *
 * Duraklatılmışken gelen boyut değişikliğini xterm boşta çalışan bir göreve bırakır; görev terminal gizliyken de
 * çalışır ve DOM çizicide aynı pahalı tam çizimi yapar (WebGL bağlamı bırakılan gizli terminal DOM çiziciye geçerken
 * de boyut bildirimi alır). Görev yalnız saklanır; terminal görünür olunca xterm onu tam çizimden hemen önce çalıştırır.
 *
 * Kaydırma alanı konumu piksel olarak tutar ve yalnız görünen satır değişince yeniden hesaplar; WebGL ve DOM
 * çizicilerin satır yüksekliği (kesirli yakınlaştırmada) birkaç binde bir piksel farklıdır. Çizici değişince eski
 * piksel konumu yeni yükseklikle birkaç satır yukarıyı gösterir; sonraki kaydırma olayında xterm bunu kullanıcı yukarı
 * kaydırmış gibi uygular (terminal yeni çıktıyı izlemeyi bırakır). Çizici, yazı boyutu ya da piksel oranı değişince
 * konum görünen satırdan yeniden hesaplanır.
 *
 * `term.open` sonrasında çağrılır (çizim hizmeti açılışta kurulur); xterm'in iç yapısı beklenenden farklıysa hiçbir
 * şey değiştirilmez.
 */
export function patchHiddenRendering(term: Terminal): void {
  const service = renderService(term)
  if (!service || service[STATE]) return
  const select = service.handleSelectionChanged.bind(service)
  const state: PatchState = {
    pendingFocus: null,
    focus: service.handleFocus.bind(service),
    blur: service.handleBlur.bind(service)
  }
  service.handleSelectionChanged = (start, end, columnSelectMode) => {
    // Seçim yokken ve önceden de yokken satırlarda değişecek bir şey yoktur (bildirim her kaydırmada gelir).
    const had =
      service._selectionState.start !== undefined && service._selectionState.end !== undefined
    if (!had && (start === undefined || end === undefined)) return
    if (!service._isPaused) {
      select(start, end, columnSelectMode)
      return
    }
    service._selectionState.start = start
    service._selectionState.end = end
    service._selectionState.columnSelectMode = columnSelectMode
    service._needsSelectionRefresh = true
    service._needsFullRefresh = true
  }
  service.handleFocus = () => {
    if (service._isPaused) state.pendingFocus = 'focus'
    else state.focus()
  }
  service.handleBlur = () => {
    if (service._isPaused) state.pendingFocus = 'blur'
    else state.blur()
  }
  const resync = (): void => resyncViewport(term)
  for (const name of [
    'setRenderer',
    'handleCharSizeChanged',
    'handleDevicePixelRatioChange'
  ] as const) {
    const original = service[name]
    if (typeof original !== 'function') continue
    service[name] = ((...args: unknown[]) => {
      ;(original as (...a: unknown[]) => void).apply(service, args)
      resync()
    }) as never
  }
  const resize = service._pausedResizeTask
  if (resize && typeof resize.set === 'function' && typeof resize.flush === 'function') {
    resize._queue?.clear?.()
    let pending: (() => void) | null = null
    service._pausedResizeTask = {
      set: (task) => {
        pending = task
      },
      flush: () => {
        const task = pending
        pending = null
        task?.()
      }
    }
  }
  service[STATE] = state
}

/**
 * Terminal gizlenince çizim hemen duraklatılır (xterm'in görünürlük gözlemcisi bir sonraki karede bildirir; o arada
 * gelen odak değişikliği gizli terminali çizdirir). Görünür olunca bekleyen odak olayı ve tam çizim uygulanır.
 */
export function setRenderingPaused(term: Terminal, paused: boolean): void {
  const service = renderService(term)
  const state = service?.[STATE]
  if (!service || !state) return
  if (paused) {
    service._handleIntersectionChange({ isIntersecting: false, intersectionRatio: 0 })
    return
  }
  const pending = state.pendingFocus
  state.pendingFocus = null
  service._handleIntersectionChange({ isIntersecting: true, intersectionRatio: 1 })
  if (pending === 'focus') state.focus()
  else if (pending === 'blur') state.blur()
}
