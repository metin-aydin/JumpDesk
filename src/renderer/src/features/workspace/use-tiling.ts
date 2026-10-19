import { useMemo, useState } from 'react'
import { groupGrow, useWorkspace, type TabGroup } from '@/stores/workspace'
import { computeTileLayout, type Handle, type TileLayout } from './tile-layout'

const MIN_PANE_PX = 160

export interface PaneDrag {
  sourceId: string
  /** Sürükleme sırasında önizlenen panel sırası. */
  order: string[]
  x: number
  y: number
  width: number
  height: number
}

/** Sürükleme dinleyicileri öğenin bulunduğu pencereye (ana ya da ayrı pencere) bağlanır. */
function drag(view: Window, onMove: (ev: PointerEvent) => void, cursor: string): void {
  const body = view.document.body
  const onUp = (): void => {
    view.removeEventListener('pointermove', onMove)
    view.removeEventListener('pointerup', onUp)
    body.style.cursor = ''
  }
  body.style.cursor = cursor
  view.addEventListener('pointermove', onMove)
  view.addEventListener('pointerup', onUp)
}

/**
 * Döşenmiş grubun yerleşimi: panel boyutları (grup ve düzen sürümüne göre), panel sürükleyerek sıralama ve tutamaçla
 * boyutlandırma. Ana pencerede etkin grup, ayrı pencerede o pencerenin grubu için kullanılır.
 */
export function useTiling(
  group: TabGroup | undefined,
  containerRef: React.RefObject<HTMLDivElement | null>
): {
  layout: TileLayout | null
  paneDrag: PaneDrag | null
  startPaneDrag: (e: React.PointerEvent, sourceId: string) => void
  startResize: (e: React.PointerEvent, handle: Handle) => void
} {
  const [paneDrag, setPaneDrag] = useState<PaneDrag | null>(null)
  // Oranlar grupla birlikte depoda tutulur: ana ve ayrı pencere aynı boyutları görür, düzen kaydında saklanır.
  const grow = group ? groupGrow(group) : null
  const rowGrow = useMemo(() => grow?.row ?? {}, [grow])
  const colGrow = useMemo(() => grow?.col ?? {}, [grow])
  const setGroupGrow = useWorkspace((s) => s.setGroupGrow)
  const setRowGrow = (fn: (g: Record<number, number>) => Record<number, number>): void => {
    if (group) setGroupGrow(group.id, (current) => ({ row: fn(current.row) }))
  }
  const setColGrow = (fn: (g: Record<string, number>) => Record<string, number>): void => {
    if (group) setGroupGrow(group.id, (current) => ({ col: fn(current.col) }))
  }

  const zoomedId = group ? group.zoomedId : null
  const tiledIds = group && !zoomedId ? (paneDrag?.order ?? group.ids).join('|') : ''
  const layout = useMemo(
    () =>
      tiledIds && group
        ? computeTileLayout(tiledIds.split('|'), group.mode, rowGrow, colGrow)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiledIds, group?.mode, rowGrow, colGrow]
  )

  /**
   * Panel başlığından tutulan panel imleçle birlikte taşınır; bıraktığı yerde boş bir yuva kalır ve imleç başka bir
   * yuvanın üstüne geldikçe diğer paneller kayarak yer açar. Bırakınca sıra kalıcı olur, Esc iptal eder.
   */
  const startPaneDrag = (e: React.PointerEvent, sourceId: string): void => {
    const el = containerRef.current
    if (!el || !layout || !group) return
    const view = el.ownerDocument.defaultView ?? window
    const mode = group.mode
    const box = el.getBoundingClientRect()
    const sourceRect = layout.rects.get(sourceId)
    if (!sourceRect) return
    const startX = e.clientX
    const startY = e.clientY
    const width = Math.min((sourceRect.width / 100) * box.width, 380)
    const height = Math.min((sourceRect.height / 100) * box.height, 260)
    const grabX = Math.min(startX - box.left - (sourceRect.left / 100) * box.width, width - 16)
    const grabY = Math.min(startY - box.top - (sourceRect.top / 100) * box.height, 24)
    let order = [...group.ids]
    let started = false

    const slotAt = (x: number, y: number): string | null => {
      const current = computeTileLayout(order, mode, rowGrow, colGrow)
      const px = ((x - box.left) / box.width) * 100
      const py = ((y - box.top) / box.height) * 100
      for (const [id, r] of current.rects) {
        if (px >= r.left && px <= r.left + r.width && py >= r.top && py <= r.top + r.height)
          return id
      }
      return null
    }
    const onMove = (ev: PointerEvent): void => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
        started = true
        view.document.body.style.userSelect = 'none'
      }
      const over = slotAt(ev.clientX, ev.clientY)
      if (over && over !== sourceId) {
        const target = order.indexOf(over)
        order = order.filter((id) => id !== sourceId)
        order.splice(target, 0, sourceId)
      }
      setPaneDrag({
        sourceId,
        order: [...order],
        x: ev.clientX - box.left - grabX,
        y: ev.clientY - box.top - grabY,
        width,
        height
      })
    }
    const finish = (commit: boolean): void => {
      view.removeEventListener('pointermove', onMove)
      view.removeEventListener('pointerup', onUp)
      view.removeEventListener('keydown', onKey, true)
      view.document.body.style.userSelect = ''
      setPaneDrag(null)
      if (commit && started) useWorkspace.getState().reorderGroup(group.id, order)
    }
    const onUp = (): void => finish(true)
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') finish(false)
    }
    view.addEventListener('pointermove', onMove)
    view.addEventListener('pointerup', onUp)
    view.addEventListener('keydown', onKey, true)
  }

  const startResize = (e: React.PointerEvent, handle: Handle): void => {
    const el = containerRef.current
    if (!el || !layout) return
    const view = el.ownerDocument.defaultView ?? window
    e.preventDefault()
    if (e.detail === 2) {
      if (group) useWorkspace.getState().equalize(group.id)
      return
    }
    const start = handle.kind === 'row' ? e.clientY : e.clientX

    if (handle.kind === 'row') {
      const total = layout.rows.reduce((sum, _r, i) => sum + (rowGrow[i] ?? 1), 0)
      const length = el.clientHeight
      const a0 = rowGrow[handle.row - 1] ?? 1
      const b0 = rowGrow[handle.row] ?? 1
      const minGrow = (MIN_PANE_PX * total) / length
      drag(
        view,
        (ev) => {
          const delta = ((ev.clientY - start) * total) / length
          const a = Math.max(minGrow, Math.min(a0 + b0 - minGrow, a0 + delta))
          setRowGrow((g) => ({ ...g, [handle.row - 1]: a, [handle.row]: a0 + b0 - a }))
        },
        'row-resize'
      )
    } else {
      const row = layout.rows[handle.row]
      const total = row.reduce((sum, id) => sum + (colGrow[id] ?? 1), 0)
      const length = el.clientWidth
      const a0 = colGrow[handle.before] ?? 1
      const b0 = colGrow[handle.after] ?? 1
      const minGrow = (MIN_PANE_PX * total) / length
      drag(
        view,
        (ev) => {
          const delta = ((ev.clientX - start) * total) / length
          const a = Math.max(minGrow, Math.min(a0 + b0 - minGrow, a0 + delta))
          setColGrow((g) => ({ ...g, [handle.before]: a, [handle.after]: a0 + b0 - a }))
        },
        'col-resize'
      )
    }
  }

  return { layout, paneDrag, startPaneDrag, startResize }
}
