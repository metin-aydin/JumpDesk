import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AppWindow,
  Columns2,
  File,
  FolderSearch,
  Grid2x2,
  LayoutDashboard,
  PanelTopOpen,
  Pencil,
  Plus,
  Save,
  Radio,
  Rows2,
  Scaling,
  Ungroup,
  Trash2,
  X,
  XSquare
} from 'lucide-react'
import { toast } from 'sonner'
import { useTreeCommands } from '@/stores/tree-commands'
import { isGroupDirty, useLayoutDialog, useLayouts } from '@/stores/layouts'
import {
  closeAllSafely,
  closeGroup,
  closeOthersSafely,
  closeTabSafely,
  ungroupSafely
} from '@/features/layouts/guard'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { t as translate, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  MAIN_WINDOW,
  NEW_WINDOW,
  activeOfWindow,
  findTab,
  groupOf,
  tabTitle,
  tabsOfWindow,
  useWorkspace,
  type TabGroup,
  type TileMode,
  type WorkspaceTab
} from '@/stores/workspace'
import { OsBadge } from '@/components/OsBadge'
import { displayAddress } from '@/lib/os'
import { shortcutLabel } from '@/lib/shortcuts'
import { useServerMeta } from '@/stores/server-meta'
import { TabPreviewCard } from './TabPreviewCard'
import {
  detachedWindowName,
  lastFocusedAt,
  openDetachedWindows,
  openGroupInNewWindow,
  openInNewWindow
} from '@/features/windows/detached-windows'
import { buildDragPreview } from '@/features/windows/drag-preview'
import { jumpdesk } from '@/lib/jumpdesk'

const statusColor: Record<WorkspaceTab['status'], string> = {
  idle: 'bg-muted-foreground/40',
  connecting: 'bg-warning',
  connected: 'bg-success',
  closed: 'bg-muted-foreground/50',
  error: 'bg-destructive'
}

/** Başlık çubuğunun bu kadar altına kadar sekme hâlâ şeritte sayılır. */
const STRIP_TOLERANCE_PX = 16

/** Sürükleme sırasında imlecin üzerinde olduğu pencere ve o penceredeki konumu (CSS piksel). */
interface WindowHit {
  windowId: string
  win: Window
  x: number
  y: number
}

type DragPhase =
  | { kind: 'strip'; hit: WindowHit }
  | { kind: 'group'; hit: WindowHit; group: TabGroup }
  | { kind: 'window' }

type WindowRects = Record<string, { x: number; y: number; width: number; height: number }>

/**
 * İmlecin üzerinde olduğu uygulama penceresi. Ekran konumları biliniyorsa (X11, Windows, macOS) imlecin ekrandaki yeri
 * kaynak pencerenin içerik alanından hesaplanır ve tüm pencereler denenir, önce sürüklemenin başladığı pencere.
 * Wayland'da (ya da pencere yerleri henüz alınmadıysa) yalnız kaynak pencere, kendi koordinatlarıyla bilinir.
 */
function windowAt(
  ev: PointerEvent,
  source: Window,
  sourceId: string,
  rects: WindowRects | null
): WindowHit | null {
  const inside = (win: Window, x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < win.innerWidth && y < win.innerHeight
  const origin = rects?.[sourceId]
  if (!jumpdesk.windowPositions || !rects || !origin)
    return inside(source, ev.clientX, ev.clientY)
      ? { windowId: sourceId, win: source, x: ev.clientX, y: ev.clientY }
      : null
  const zoom = jumpdesk.ui.getZoom()
  const sx = origin.x + ev.clientX * zoom
  const sy = origin.y + ev.clientY * zoom
  // Kaynak pencere (basınca öne gelir) önce, sonra en son odaklanan; üst üste binen pencerelerde üstteki seçilir.
  const all = [{ windowId: MAIN_WINDOW, win: window }, ...openDetachedWindows()]
  all.sort((a, b) =>
    a.windowId === sourceId
      ? -1
      : b.windowId === sourceId
        ? 1
        : lastFocusedAt(b.windowId) - lastFocusedAt(a.windowId)
  )
  for (const { windowId, win } of all) {
    const r = rects[windowId]
    if (!r) continue
    const x = (sx - r.x) / zoom
    const y = (sy - r.y) / zoom
    if (inside(win, x, y)) return { windowId, win, x, y }
  }
  return null
}

/** Pencerenin şeridinde bırakılma sırası: ortası noktanın solunda kalan sekmelerin sayısı ve gösterge konumu. */
function stripSlot(
  doc: Document,
  x: number,
  skip: string[]
): { index: number; left: number; top: number; height: number } | null {
  const strip = doc.querySelector<HTMLElement>('[data-tab-strip]')
  if (!strip) return null
  const box = strip.getBoundingClientRect()
  let index = 0
  let left = box.left + 2
  for (const el of strip.querySelectorAll<HTMLElement>('[data-tab-ids]')) {
    const ids = (el.dataset.tabIds ?? '').split(' ')
    if (ids.some((id) => skip.includes(id))) continue
    const r = el.getBoundingClientRect()
    if (r.left + r.width / 2 < x) {
      index += ids.length
      left = r.right + 2
    }
  }
  return { index, left, top: box.top + 4, height: box.height - 8 }
}

/** Uygulama penceresinin sekme şeridi dışındaki, açık grubun gösterildiği alana bırakılabilir mi. */
function groupUnder(hit: WindowHit, tabId: string): TabGroup | undefined {
  const ws = useWorkspace.getState()
  const tab = findTab(ws, tabId)
  if (tab?.kind !== 'session' || groupOf(ws.groups, tabId)) return undefined
  const target = groupOf(ws.groups, activeOfWindow(ws, hit.windowId))
  const area = hit.win.document
    .querySelector<HTMLElement>('[data-workspace]')
    ?.getBoundingClientRect()
  if (!target || !area) return undefined
  const inside =
    hit.x >= area.left && hit.x <= area.right && hit.y >= area.top && hit.y <= area.bottom
  return inside ? target : undefined
}

/** Bırakılan oturumların penceresini öne getirir. */
function focusWindow(windowId: string): void {
  if (windowId === MAIN_WINDOW) jumpdesk.win.focus()
  else jumpdesk.detached.control(detachedWindowName(windowId), 'focus')
}

/**
 * Chrome tarzı sekme sürükleme. Tutulan sekmenin kopyası imleci serbestçe izler. Kopya şerit üzerindeyken merkezi
 * komşu sekmenin ortasını geçince sıra değişir, yer değiştiren sekmeler kayarak yeni yerlerine gider. Başka bir
 * pencerenin şeridine gelince bırakılacağı yer gösterilir; orada bırakılan sekme o pencereye geçer. Şeridin dışına
 * çıkınca kopyanın yerine imleçte yarı saydam bir pencere önizlemesi belirir; orada bırakılan sekme (ya da grup)
 * o konumda yeni pencereye dönüşür. Açık grubun alanında tek bir oturum "Gruba Ekle" ile gruba bırakılabilir.
 */
function useTabReorder(windowId: string): {
  draggingId: string | null
  onPointerDown: (e: React.PointerEvent, tabId: string, onRelease?: () => void) => void
  register: (tabId: string, el: HTMLElement | null) => void
} {
  const moveBlock = useWorkspace((s) => s.moveBlock)
  const tabs = useWorkspace(useShallow((s) => tabsOfWindow(s, windowId)))
  const refs = useRef(new Map<string, HTMLElement>())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const prevLefts = useRef(new Map<string, number>())
  /** Sürüklenen sekme ya da grubun üyeleri; kayma animasyonu bunlara uygulanmaz. */
  const dragIds = useRef<Set<string>>(new Set())

  useLayoutEffect(() => {
    if (!prevLefts.current.size) return
    const animated = new Set<HTMLElement>()
    for (const [id, prev] of prevLefts.current) {
      const el = refs.current.get(id)
      if (!el || dragIds.current.has(id) || animated.has(el)) continue
      animated.add(el)
      const delta = prev - el.getBoundingClientRect().left
      if (Math.abs(delta) > 0.5)
        el.animate([{ transform: `translateX(${delta}px)` }, { transform: 'translateX(0)' }], {
          duration: 160,
          easing: 'ease-out'
        })
    }
    prevLefts.current.clear()
  }, [tabs])

  /**
   * `onRelease` bırakınca çağrılır (tıklama ya da şeritte sürükleme sonu); sekme basılınca değil bırakınca
   * etkinleşir, böylece sürükleme sırasında açık olan grup görünür kalır ve sekme gruba bırakılabilir.
   */
  const onPointerDown = (e: React.PointerEvent, tabId: string, onRelease?: () => void): void => {
    if (e.button !== 0) return
    const el = refs.current.get(tabId)
    if (!el) {
      onRelease?.()
      return
    }
    const view = (el.ownerDocument.defaultView ?? window) as Window
    const startX = e.clientX
    const startRect = el.getBoundingClientRect()
    const grabX = e.clientX - startRect.left
    const grabY = e.clientY - startRect.top
    const strip = el.closest<HTMLElement>('[data-tab-strip]')
    let ghost: HTMLElement | null = null
    let pointerX = startX
    let scrollTimer: ReturnType<typeof setInterval> | null = null
    let phase: DragPhase | null = null
    let dropZone: HTMLElement | null = null
    let marker: HTMLElement | null = null
    let previewShown = false
    let moveQueued = false
    /** Pencerelerin ekrandaki yerleri sürükleme başında bir kez alınır. */
    let rects: WindowRects | null = null
    if (jumpdesk.windowPositions)
      void jumpdesk.detached.bounds().then((r) => {
        rects = r
      })

    const ws0 = useWorkspace.getState()
    const dragGroup = groupOf(ws0.groups, tabId)
    const block = dragGroup?.ids ?? [tabId]
    const draggedTab = findTab(ws0, tabId)
    /** Oturum sekmesi ya da grup sekmesi pencereye dönüşebilir; "Yeni Bağlantı" sekmesi yalnız sıralanır. */
    const detachable = Boolean(dragGroup) || draggedTab?.kind === 'session'

    const setPreview = (show: boolean): void => {
      if (show === previewShown) {
        if (show && !moveQueued) {
          moveQueued = true
          view.requestAnimationFrame(() => {
            moveQueued = false
            if (previewShown) jumpdesk.dragPreview.move()
          })
        }
        return
      }
      previewShown = show
      if (!show) {
        jumpdesk.dragPreview.hide()
        return
      }
      const payload = buildDragPreview(tabId)
      if (payload) jumpdesk.dragPreview.show(payload)
    }

    /** "Gruba Ekle" bırakma alanı; verilen pencerenin çalışma alanının üstünde. */
    const showDropZone = (doc: Document | null): void => {
      if (dropZone && dropZone.ownerDocument !== doc) {
        dropZone.remove()
        dropZone = null
      }
      if (!doc || dropZone) return
      const area = doc.querySelector<HTMLElement>('[data-workspace]')?.getBoundingClientRect()
      if (!area) return
      dropZone = doc.createElement('div')
      dropZone.className =
        'pointer-events-none fixed z-[999] flex items-start justify-center rounded-lg border-2 border-dashed border-primary/70 bg-primary/10 pt-6'
      Object.assign(dropZone.style, {
        left: `${area.left + 4}px`,
        top: `${area.top + 4}px`,
        width: `${area.width - 8}px`,
        height: `${area.height - 8}px`
      })
      const label = doc.createElement('span')
      label.className =
        'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow'
      label.textContent = translate('Gruba Ekle')
      dropZone.appendChild(label)
      doc.body.appendChild(dropZone)
    }

    /** Başka bir pencerenin şeridinde sekmenin gireceği yeri gösteren ince çizgi. */
    const showMarker = (hit: WindowHit | null): number | undefined => {
      if (!hit) {
        marker?.remove()
        marker = null
        return undefined
      }
      const slot = stripSlot(hit.win.document, hit.x, block)
      if (!slot) return undefined
      if (marker && marker.ownerDocument !== hit.win.document) {
        marker.remove()
        marker = null
      }
      if (!marker) {
        marker = hit.win.document.createElement('div')
        marker.className =
          'pointer-events-none fixed z-[1001] w-0.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_25%,transparent)]'
        hit.win.document.body.appendChild(marker)
      }
      Object.assign(marker.style, {
        left: `${slot.left - 1}px`,
        top: `${slot.top}px`,
        height: `${slot.height}px`
      })
      return slot.index
    }

    const reorder = (): void => {
      if (!ghost) return
      const all = tabsOfWindow(useWorkspace.getState(), windowId)
      const width = ghost.getBoundingClientRect().width
      const center = pointerX - grabX + width / 2
      let index = 0
      let current = -1
      let before = 0
      for (const t of all) {
        if (block.includes(t.id)) {
          if (current < 0) current = before
          continue
        }
        before++
        const other = refs.current.get(t.id)
        if (!other) continue
        const r = other.getBoundingClientRect()
        if (center > r.left + r.width / 2) index++
      }
      if (index !== current) {
        for (const [id, node] of refs.current)
          prevLefts.current.set(id, node.getBoundingClientRect().left)
        moveBlock(block, index)
      }
    }

    const autoScroll = (): void => {
      if (phase?.kind !== 'strip' || phase.hit.windowId !== windowId) return
      if (!strip || strip.scrollWidth <= strip.clientWidth) return
      const r = strip.getBoundingClientRect()
      const step = pointerX > r.right - 32 ? 14 : pointerX < r.left + 32 ? -14 : 0
      if (step) {
        strip.scrollLeft += step
        reorder()
      }
    }

    /** Kopyayı verilen penceredeki imlecin yerine taşır (gerekirse o pencerenin belgesine geçirir). */
    const placeGhost = (hit: WindowHit): void => {
      if (!ghost) return
      const doc = hit.win.document
      if (ghost.ownerDocument !== doc) doc.body.appendChild(ghost)
      const r = ghost.getBoundingClientRect()
      ghost.style.display = ''
      ghost.style.left = `${Math.max(0, Math.min(hit.win.innerWidth - r.width, hit.x - grabX))}px`
      ghost.style.top = `${Math.max(0, Math.min(hit.win.innerHeight - r.height, hit.y - grabY))}px`
    }

    const onMove = (ev: PointerEvent): void => {
      // "Yeni Bağlantı" sekmesi pencereden çıkamaz: imleç dışarıdayken gelen olaylar yok sayılır, kopya imlecin
      // pencereden çıktığı kenarda kalır (dışarıdaki koordinatlara güvenilmez).
      const outsideView =
        ev.clientX < 0 ||
        ev.clientY < 0 ||
        ev.clientX >= view.innerWidth ||
        ev.clientY >= view.innerHeight
      if (!detachable && outsideView) return
      pointerX = ev.clientX
      if (!ghost) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startRect.top - grabY) < 5) return
        const rect = el.getBoundingClientRect()
        ghost = el.cloneNode(true) as HTMLElement
        ghost.removeAttribute('role')
        ghost.removeAttribute('data-tab-ids')
        ghost.setAttribute('aria-hidden', 'true')
        Object.assign(ghost.style, {
          position: 'fixed',
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          margin: '0',
          zIndex: '1000',
          pointerEvents: 'none',
          boxShadow: '0 6px 20px rgb(0 0 0 / 0.25)'
        })
        el.ownerDocument.body.appendChild(ghost)
        el.style.visibility = 'hidden'
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* işaretçi bırakılmışsa yakalama gerekmez */
        }
        dragIds.current = new Set(block)
        setDraggingId(tabId)
        scrollTimer = setInterval(autoScroll, 30)
      }

      if (!detachable) {
        // "Yeni Bağlantı" sekmesi yalnız kendi şeridinde sıralanır.
        phase = { kind: 'strip', hit: { windowId, win: view, x: ev.clientX, y: ev.clientY } }
      } else {
        const hit = windowAt(ev, view, windowId, rects)
        const header = hit?.win.document.querySelector('[data-titlebar]')?.getBoundingClientRect()
        const onStrip = Boolean(hit && header && hit.y <= header.bottom + STRIP_TOLERANCE_PX)
        const group = hit && !onStrip ? groupUnder(hit, tabId) : undefined
        phase =
          hit && onStrip
            ? { kind: 'strip', hit }
            : hit && group
              ? { kind: 'group', hit, group }
              : { kind: 'window' }
      }

      setPreview(phase?.kind === 'window')
      showDropZone(phase?.kind === 'group' ? phase.hit.win.document : null)
      showMarker(phase?.kind === 'strip' && phase.hit.windowId !== windowId ? phase.hit : null)
      if (!phase || phase.kind === 'window') {
        ghost.style.display = 'none'
        return
      }
      placeGhost(phase.hit)
      if (phase.kind === 'strip' && phase.hit.windowId === windowId) reorder()
    }

    const cleanup = (): void => {
      view.removeEventListener('pointermove', onMove)
      view.removeEventListener('pointerup', onUp)
      view.removeEventListener('keydown', onKey, true)
      if (scrollTimer) clearInterval(scrollTimer)
      dragIds.current = new Set()
      setDraggingId(null)
      showDropZone(null)
      showMarker(null)
      if (previewShown) jumpdesk.dragPreview.hide()
    }

    const onUp = (): void => {
      const g = ghost
      const final = phase
      const slot =
        final?.kind === 'strip' && final.hit.windowId !== windowId
          ? stripSlot(final.hit.win.document, final.hit.x, block)
          : null
      // Önizleme gizlenmeden önce yeri saklanır; yeni pencere ya da taşınan pencere o konumda açılır.
      if (g && final?.kind === 'window' && previewShown) {
        jumpdesk.dragPreview.commit()
        previewShown = false
      }
      cleanup()
      if (!g || !final) {
        g?.remove()
        el.style.visibility = ''
        onRelease?.()
        return
      }
      const done = (): void => {
        g.remove()
        el.style.visibility = ''
      }
      const ws = useWorkspace.getState()
      if (final.kind === 'window') {
        done()
        const sourceTabs = tabsOfWindow(ws, windowId).map((t) => t.id)
        if (windowId !== MAIN_WINDOW && sourceTabs.every((id) => block.includes(id))) {
          // Pencerenin tüm sekmeleri dışarı bırakıldı: pencerenin kendisi oraya taşınır.
          jumpdesk.detached.control(detachedWindowName(windowId), 'place')
        } else if (windowId === MAIN_WINDOW && !dragGroup) void openInNewWindow(tabId)
        else if (windowId === MAIN_WINDOW && dragGroup) openGroupInNewWindow(dragGroup.id)
        else ws.moveTabs(block, NEW_WINDOW)
        return
      }
      if (final.kind === 'group') {
        done()
        if (final.hit.windowId !== windowId) ws.moveTabs([tabId], final.hit.windowId)
        useWorkspace.getState().addToGroup(final.group.id, tabId)
        focusWindow(final.hit.windowId)
        return
      }
      if (final.hit.windowId !== windowId) {
        done()
        ws.moveTabs(block, final.hit.windowId, slot?.index)
        focusWindow(final.hit.windowId)
        return
      }
      onRelease?.()
      const node = refs.current.get(tabId)
      const target = node?.getBoundingClientRect()
      if (!target || g.ownerDocument !== node?.ownerDocument) return done()
      const from = g.getBoundingClientRect()
      g.animate(
        [
          { transform: 'translate(0, 0)' },
          { transform: `translate(${target.left - from.left}px, ${target.top - from.top}px)` }
        ],
        { duration: 140, easing: 'ease-out' }
      ).onfinish = done
    }

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      cleanup()
      ghost?.remove()
      el.style.visibility = ''
    }

    view.addEventListener('pointermove', onMove)
    view.addEventListener('pointerup', onUp)
    view.addEventListener('keydown', onKey, true)
  }

  /** Grup sekmesi, sıralamada tüm üyelerinin yerini tutar. */
  const register = (tabId: string, el: HTMLElement | null): void => {
    if (el) refs.current.set(tabId, el)
    else refs.current.delete(tabId)
  }

  return { draggingId, onPointerDown, register }
}

const MODE_ICON: Record<TileMode, typeof Columns2> = {
  vertical: Columns2,
  horizontal: Rows2,
  grid: Grid2x2
}

/**
 * Gruptaki bir sekmede grubun düzenini değiştirir; gruba ait olmayan sekmede pencerenin gruplanmamış tüm
 * oturumlarını yeni bir grupta döşer.
 */
function ArrangeItems({
  tabId,
  sessionCount
}: {
  tabId: string
  sessionCount: number
}): React.JSX.Element {
  const t = useT()
  const apply = (mode: TileMode): void => useWorkspace.getState().arrange(mode, tabId)
  return (
    <>
      <ContextMenuItem onClick={() => apply('vertical')} disabled={sessionCount < 2}>
        <Columns2 /> {t('Yan Yana Yerleştir')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => apply('horizontal')} disabled={sessionCount < 2}>
        <Rows2 /> {t('Alt Alta Yerleştir')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => apply('grid')} disabled={sessionCount < 3}>
        <Grid2x2 /> {t('Izgara Olarak Yerleştir')}
      </ContextMenuItem>
    </>
  )
}

/** Sekmeyi (ya da grubu) başka pencereye taşıma öğeleri; pencerede tek kalan öğe yeni pencereye taşınamaz. */
function MoveItems({
  windowId,
  ids,
  label,
  alone
}: {
  windowId: string
  ids: string[]
  label: string
  alone: boolean
}): React.JSX.Element {
  const t = useT()
  const { moveTabs } = useWorkspace.getState()
  const main = windowId === MAIN_WINDOW
  return (
    <>
      {!main && (
        <ContextMenuItem
          onClick={() => {
            moveTabs(ids, MAIN_WINDOW)
            jumpdesk.win.focus()
          }}
        >
          <PanelTopOpen /> {t('Ana Pencereye Taşı')}
        </ContextMenuItem>
      )}
      <ContextMenuItem
        disabled={!main && alone}
        onClick={() =>
          main
            ? ids.length > 1
              ? openGroupInNewWindow(groupOf(useWorkspace.getState().groups, ids[0])!.id)
              : void openInNewWindow(ids[0])
            : moveTabs(ids, NEW_WINDOW)
        }
      >
        <AppWindow /> {label}
      </ContextMenuItem>
    </>
  )
}

/** Sekme başlığı ve (varsa) altında soluk IP adresi. */
export function TabLabel({ tab, title }: { tab: WorkspaceTab; title?: string }): React.JSX.Element {
  const t = useT()
  const localIp = useServerMeta((s) => (tab.asset ? s.byAsset[tab.asset.id]?.localIp : undefined))
  const ip = tab.asset ? displayAddress(localIp, tab.asset.address) : null
  return (
    <span className="flex min-w-0 flex-col justify-center leading-[1.15]">
      <span className="truncate">{title ?? tabTitle(tab, t)}</span>
      {ip && (
        <span className="truncate text-[10px] text-muted-foreground/80 tabular-nums">
          {ip.text}
        </span>
      )}
    </span>
  )
}

interface HoverState {
  ids: string[]
  rect: DOMRect
}

const PREVIEW_DELAY_MS = 500

/** Fare bir sekmede beklerse önizleme açılır; kart açıkken sekmeler arasında gezinmek anında güncellenir. */
function useTabHover(): {
  hover: HoverState | null
  enter: (ids: string[], el: HTMLElement) => void
  hide: () => void
} {
  const [hover, setHover] = useState<HoverState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openRef = useRef(false)
  openRef.current = hover !== null
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!hover) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [hover])

  const enter = (ids: string[], el: HTMLElement): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(
      () => setHover({ ids, rect: el.getBoundingClientRect() }),
      openRef.current ? 0 : PREVIEW_DELAY_MS
    )
  }
  const hide = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHover(null)
  }
  return { hover, enter, hide }
}

/** Döşenmiş gruptaki oturumları temsil eden tek sekme; etiketi odaklı oturumla başlar. */
function GroupTab({
  windowId,
  group,
  members,
  active,
  activeId,
  alone,
  onHoverEnter,
  onHoverEnd,
  register,
  onDragStart,
  width
}: {
  windowId: string
  group: TabGroup
  members: WorkspaceTab[]
  active: boolean
  activeId: string
  /** Pencerede bu gruptan başka sekme yok. */
  alone: boolean
  onHoverEnter: (el: HTMLElement) => void
  onHoverEnd: () => void
  register: (tabId: string, el: HTMLElement | null) => void
  onDragStart: (e: React.PointerEvent, tabId: string) => void
  width: number
}): React.JSX.Element {
  const t = useT()
  const main = windowId === MAIN_WINDOW
  const compact = width < COMPACT_WIDTH
  const { activate, toggleBroadcast, equalize } = useWorkspace.getState()
  const Icon = MODE_ICON[group.mode]
  const focusedId = group.ids.includes(activeId) ? activeId : group.focusedId
  const focused = members.find((t) => t.id === focusedId) ?? members[0]
  /** Grup kayıtlı bir düzene bağlıysa menüde kaydet yerine yeniden adlandır / sil gösterilir. */
  const layout = useLayouts((s) =>
    group.layoutId ? s.layouts.find((l) => l.id === group.layoutId) : undefined
  )
  const dirty = useLayouts((s) => isGroupDirty(group, members, s.layouts))
  const activity = members.some((t) => t.activity)
  const alarm = members.some((t) => t.alarm)
  const names = members.map((m) => tabTitle(m, t)).join(', ')
  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={(el: HTMLElement | null) => group.ids.forEach((id) => register(id, el))}
        data-tab-ids={group.ids.join(' ')}
        role="tab"
        aria-selected={active}
        aria-label={t('Bölünmüş görünüm: {names}', { names })}
        style={{ width }}
        onPointerEnter={(e) => onHoverEnter(e.currentTarget as HTMLElement)}
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
        onAuxClick={(e) => {
          // Orta tık, tekli sekmede olduğu gibi grup sekmesini (gruptaki tüm oturumları) kapatır.
          if (e.button !== 1) return
          onHoverEnd()
          void closeGroup(group.id)
        }}
        onPointerDown={(e) => {
          onHoverEnd()
          onDragStart(e, group.ids[0])
          if (e.button === 0 && focused) activate(focused.id)
        }}
        className={cn(
          'app-no-drag group/tab relative flex h-8 shrink-0 items-center gap-2 rounded-md text-[12.5px] transition-colors duration-100',
          compact ? 'justify-center px-1' : 'px-2.5',
          active
            ? 'bg-tab-active text-foreground shadow-[0_0_0_1px_var(--border)]'
            : 'text-titlebar-foreground hover:bg-foreground/5 hover:text-foreground'
        )}
      >
        <span className="relative">
          <Icon className={cn('size-4', active && 'text-primary')} />
          {alarm ? (
            <span
              aria-label={t('Alarm')}
              className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-titlebar"
            />
          ) : (
            activity &&
            !active && (
              <span
                aria-label={t('Yeni çıktı')}
                className="absolute -top-1 -right-1 size-2 rounded-full bg-primary ring-2 ring-titlebar"
              />
            )
          )}
        </span>
        {group.broadcast && (
          <Radio
            className={cn('size-3.5 shrink-0 text-warning', width < 112 && 'hidden')}
            aria-label={t('Yayın açık')}
          />
        )}
        {group.name ? (
          <span className={cn('min-w-0 truncate', compact && 'hidden')}>{group.name}</span>
        ) : (
          focused && (
            <span className={cn('flex min-w-0', compact && 'hidden')}>
              <TabLabel tab={focused} />
            </span>
          )
        )}
        {members.length > 1 && (
          <span
            title={t('{n} Sunucu', { n: members.length })}
            className={cn(
              'shrink-0 rounded-sm bg-foreground/8 px-1 text-[11px] text-muted-foreground tabular-nums',
              width < 112 && 'hidden'
            )}
          >
            {members.length}
          </span>
        )}
        {dirty && (
          <span
            aria-label={t('Kaydedilmemiş Düzen Değişikliği')}
            title={t('Kaydedilmemiş Düzen Değişiklikleri')}
            className="ml-auto size-2 shrink-0 rounded-full bg-primary/45"
          />
        )}
        <button
          type="button"
          aria-label={t('Grubu ayır')}
          title={t('Grubu Ayır (Sekmelere Dön)')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            void ungroupSafely(group.id)
          }}
          className={cn(
            'inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover/tab:opacity-100',
            !dirty && 'ml-auto',
            active && 'opacity-100',
            compact && 'hidden'
          )}
        >
          <Ungroup className="size-3" />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-60">
        <ArrangeItems tabId={focusedId} sessionCount={members.length} />
        <ContextMenuItem onClick={() => equalize(group.id)}>
          <Scaling /> {t('Boyutları Eşitle')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => toggleBroadcast(group.id)}>
          <Radio /> {t(group.broadcast ? 'Yayını Kapat' : 'Girdiyi Tüm Panellere Gönder (Yayın)')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void ungroupSafely(group.id)}>
          <Ungroup /> {t('Grubu Ayır')}
        </ContextMenuItem>
        <MoveItems
          windowId={windowId}
          ids={group.ids}
          label={t('Grubu Yeni Pencerede Aç')}
          alone={alone}
        />
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => void closeGroup(group.id)}>
          <X /> {t('Gruptaki {n} Oturumu Kapat', { n: members.length })}
        </ContextMenuItem>
        {main && (
          <ContextMenuItem variant="destructive" onClick={() => void closeAllSafely()}>
            <XSquare /> {t('Tümünü Kapat')}
          </ContextMenuItem>
        )}
        {main && <ContextMenuSeparator />}
        {main &&
          (layout ? (
            <>
              <ContextMenuItem
                disabled={!dirty}
                onClick={() => {
                  useLayouts.getState().updateFromGroup(group.id)
                  toast.success(t('"{name}" düzeni güncellendi', { name: layout.name }))
                }}
              >
                <Save /> {t('Düzendeki Değişiklikleri Kaydet')}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => useLayoutDialog.getState().openRename(layout)}>
                <Pencil /> {t('Düzeni Yeniden Adlandır…')}
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onClick={() => useLayouts.getState().remove(layout.id)}
              >
                <Trash2 /> {t('Düzeni Sil')}
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuItem onClick={() => useLayoutDialog.getState().openSave(group.id)}>
              <LayoutDashboard /> {t('Düzeni Kaydet…')}
            </ContextMenuItem>
          ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Etkin sekme görünür alana kaydırılır; dikey tekerlek şeridi yatayda kaydırır. */
function useStripScroll(activeId: string): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])
  return ref
}

const MAX_TAB_WIDTH = 224
/** En dar sekme: yalnız simge sığar. */
const MIN_TAB_WIDTH = 44
/** Bu genişliğin altında başlık ve kapatma düğmesi gizlenir. */
const COMPACT_WIDTH = 88
const TAB_GAP = 4
const PLUS_WIDTH = 32

/** Sekmeler eşit genişlikte; sığmadıkça küçülür, en dar boyutta da sığmazsa şerit kaydırılır. */
function tabWidth(avail: number, count: number): number {
  if (!avail || count === 0) return MAX_TAB_WIDTH
  const room = avail - PLUS_WIDTH - TAB_GAP * (count - 1)
  return Math.max(MIN_TAB_WIDTH, Math.min(MAX_TAB_WIDTH, Math.floor(room / count)))
}

/** Orta tıkla sekme kapatıldıktan sonra yapıştırma olaylarının yok sayılacağı süre. */
const MIDDLE_PASTE_GUARD_MS = 500

/**
 * Linux'ta orta tık "birincil seçimi yapıştır" işlevi de görür. Sekmeye orta tıklayıp kapatınca odak yeni bir alana
 * (ör. sunucu arama kutusu ya da terminal) geçtiği için seçili metin oraya yapıştırılıyordu. Sekme şeridindeki orta
 * tıkın bırakılması varsayılan davranışı engellenir ve hemen ardından gelen yapıştırma olayları yok sayılır. Dinleyiciler
 * şeridin bulunduğu pencereye bağlanır.
 */
function useMiddleClickPasteGuard(rootRef: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView
    if (!view) return
    let suppressUntil = 0
    const onMouseUp = (e: MouseEvent): void => {
      if (
        e.button !== 1 ||
        !(e.target as Element | null)?.closest?.('[data-tab-strip], [role=tab]')
      )
        return
      e.preventDefault()
      suppressUntil = performance.now() + MIDDLE_PASTE_GUARD_MS
    }
    const block = (e: Event): void => {
      if (performance.now() > suppressUntil) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    const onBeforeInput = (e: InputEvent): void => {
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromPasteAsQuotation')
        block(e)
    }
    view.addEventListener('mouseup', onMouseUp, true)
    view.addEventListener('paste', block, true)
    view.addEventListener('beforeinput', onBeforeInput, true)
    return () => {
      view.removeEventListener('mouseup', onMouseUp, true)
      view.removeEventListener('paste', block, true)
      view.removeEventListener('beforeinput', onBeforeInput, true)
    }
  }, [rootRef])
}

/**
 * Chrome tarzı sekme şeridi: sekmeler sığmadıkça eşit küçülür; dar sekmede yalnız simge kalır. En küçük boyuta inen
 * sekmeler de sığmazsa şerit yatayda kaydırılır. Her pencerenin (ana ya da ayrı) kendi şeridi vardır.
 */
export function TabStrip({ windowId = MAIN_WINDOW }: { windowId?: string }): React.JSX.Element {
  const t = useT()
  const main = windowId === MAIN_WINDOW
  const rootRef = useRef<HTMLDivElement>(null)
  useMiddleClickPasteGuard(rootRef)
  const tabs = useWorkspace(useShallow((s) => tabsOfWindow(s, windowId)))
  const activeId = useWorkspace((s) => activeOfWindow(s, windowId))
  const groups = useWorkspace((s) => s.groups)
  const { activate, openConnectTab } = useWorkspace.getState()
  const { draggingId, onPointerDown, register } = useTabReorder(windowId)
  const grouped = new Set(groups.flatMap((g) => g.ids))
  const ungroupedSessions = tabs.filter((t) => t.kind === 'session' && !grouped.has(t.id)).length
  const { hover, enter, hide } = useTabHover()
  const hoveredTabs = hover ? tabs.filter((t) => hover.ids.includes(t.id)) : []
  const scrollRef = useStripScroll(activeId)
  const rendered = new Set<string>()
  const [avail, setAvail] = useState(0)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const View = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis
    const ro = new View.ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const windowGroups = groups.filter((g) => g.ids.some((id) => tabs.some((t) => t.id === id)))
  const itemCount = tabs.filter((t) => !grouped.has(t.id)).length + windowGroups.length
  const width = tabWidth(avail, itemCount)
  const compact = width < COMPACT_WIDTH
  const alone = itemCount === 1

  return (
    <div ref={rootRef} className="flex h-full min-w-0 flex-1 items-center" onPointerLeave={hide}>
      {hover && hoveredTabs.length > 0 && !draggingId && (
        <TabPreviewCard tabs={hoveredTabs} anchor={hover.rect} />
      )}
      <div
        ref={scrollRef}
        data-tab-strip
        onScroll={hide}
        className="app-no-drag flex h-full min-w-0 flex-[0_1_auto] items-center gap-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:border-0 [&::-webkit-scrollbar-button]:hidden"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId
          const group = groupOf(groups, tab.id)
          if (group) {
            if (rendered.has(group.id)) return null
            rendered.add(group.id)
            return (
              <GroupTab
                key={group.id}
                windowId={windowId}
                group={group}
                members={tabs.filter((t) => group.ids.includes(t.id))}
                active={group.ids.includes(activeId)}
                activeId={activeId}
                alone={alone}
                onHoverEnter={(el) => enter(group.ids, el)}
                onHoverEnd={hide}
                register={register}
                onDragStart={onPointerDown}
                width={width}
              />
            )
          }
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger
                ref={(el: HTMLElement | null) => register(tab.id, el)}
                data-tab-ids={tab.id}
                role="tab"
                aria-selected={active}
                aria-label={tabTitle(tab, t)}
                style={{ width }}
                onPointerEnter={(e) => enter([tab.id], e.currentTarget as HTMLElement)}
                onPointerDown={(e) => {
                  hide()
                  onPointerDown(e, tab.id, () => activate(tab.id))
                }}
                onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                onAuxClick={(e) => e.button === 1 && void closeTabSafely(tab.id)}
                className={cn(
                  'app-no-drag group/tab relative flex h-8 shrink-0 items-center gap-2 rounded-md text-[12.5px] transition-colors duration-100',
                  compact ? 'justify-center px-1' : 'px-2.5',
                  active
                    ? 'bg-tab-active text-foreground shadow-[0_0_0_1px_var(--border)]'
                    : 'text-titlebar-foreground hover:bg-foreground/5 hover:text-foreground',
                  draggingId === tab.id && 'ring-1 ring-primary/40'
                )}
              >
                {tab.asset ? (
                  <span className="relative shrink-0">
                    <OsBadge
                      platformType={tab.asset.platformType}
                      files={tab.view === 'files'}
                      size="xs"
                    />
                    {tab.alarm ? (
                      <span
                        aria-label={t('Alarm')}
                        className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-titlebar"
                      />
                    ) : (
                      tab.activity &&
                      !active && (
                        <span
                          aria-label={t('Yeni çıktı')}
                          className="absolute -top-1 -right-1 size-2 rounded-full bg-primary ring-2 ring-titlebar"
                        />
                      )
                    )}
                    <span
                      className={cn(
                        'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-titlebar',
                        active && 'ring-tab-active',
                        statusColor[tab.status]
                      )}
                    />
                  </span>
                ) : (
                  <File className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn('flex min-w-0', compact && 'hidden')}>
                  <TabLabel tab={tab} />
                </span>
                <button
                  type="button"
                  aria-label={t('Sekmeyi kapat')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTabSafely(tab.id)
                  }}
                  className={cn(
                    'ml-auto inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover/tab:opacity-100',
                    active && 'opacity-100',
                    compact && 'hidden'
                  )}
                >
                  <X className="size-3" />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-56">
                {tab.asset && (
                  <>
                    <ContextMenuItem
                      onClick={() => {
                        if (!main) jumpdesk.win.focus()
                        void useTreeCommands.getState().reveal(tab.asset!.id)
                      }}
                    >
                      <FolderSearch /> {t('Klasörde Göster')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                  </>
                )}
                <ArrangeItems
                  tabId={tab.id}
                  sessionCount={tab.kind === 'session' ? ungroupedSessions : 0}
                />
                {tab.kind === 'session' && (
                  <MoveItems
                    windowId={windowId}
                    ids={[tab.id]}
                    label={t('Yeni Pencerede Aç')}
                    alone={alone}
                  />
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => void closeTabSafely(tab.id)}>
                  <X /> {t('Kapat')} <ContextMenuShortcut>{shortcutLabel('W')}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => void closeOthersSafely(tab.id)}>
                  {t('Diğerlerini Kapat')}
                </ContextMenuItem>
                {main && (
                  <>
                    <ContextMenuItem variant="destructive" onClick={() => void closeAllSafely()}>
                      <XSquare /> {t('Tümünü Kapat')}
                    </ContextMenuItem>
                    {/* Boş "Yeni Bağlantı" sekmesinde kaydedilecek oturum yoktur. */}
                    {tab.asset && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => useLayoutDialog.getState().openSave(null)}>
                          <LayoutDashboard /> {t('Düzeni Kaydet…')}
                        </ContextMenuItem>
                      </>
                    )}
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
      {main && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t('Yeni Bağlantı')}
                onClick={() => openConnectTab()}
                className="app-no-drag ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-titlebar-foreground hover:bg-foreground/5 hover:text-foreground"
              />
            }
          >
            <Plus className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            {t('Yeni Bağlantı')} ({shortcutLabel('T')})
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
