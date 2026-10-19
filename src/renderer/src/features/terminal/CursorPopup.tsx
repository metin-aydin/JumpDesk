import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { usePortalContainer } from '@/lib/portal-container'

/** İmlecin bulunduğu hücre (pencereye göre CSS piksel). */
export interface CursorAnchor {
  x: number
  y: number
  /** Satır yüksekliği. */
  height: number
}

const MARGIN = 8
const GAP = 2

/**
 * İmlecin altında (sığmazsa üstünde) açılan pencere: terminal kabına değil sayfaya çizilir, böylece dar panelde
 * kırpılmaz; uygulama penceresinin kenarlarına göre sığdırılır.
 */
export function CursorPopup({
  anchor,
  className,
  children,
  onMouseDown
}: {
  anchor: CursorAnchor
  className?: string
  children: React.ReactNode
  onMouseDown?: (e: React.MouseEvent) => void
}): React.ReactPortal {
  const container = usePortalContainer()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const view = el.ownerDocument.defaultView ?? window
    const place = (): void => {
      const width = el.offsetWidth
      const height = el.scrollHeight
      const vw = view.innerWidth
      const vh = view.innerHeight
      const left = Math.max(MARGIN, Math.min(anchor.x, vw - width - MARGIN))
      const below = vh - (anchor.y + anchor.height + GAP) - MARGIN
      const above = anchor.y - GAP - MARGIN
      const downward = height <= below || below >= above
      const maxHeight = Math.max(80, downward ? below : above)
      const shown = Math.min(height, maxHeight)
      const top = downward ? anchor.y + anchor.height + GAP : anchor.y - GAP - shown
      setPos((prev) =>
        prev && prev.left === left && prev.top === top && prev.maxHeight === maxHeight
          ? prev
          : { left, top, maxHeight }
      )
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    view.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      view.removeEventListener('resize', place)
    }
  }, [anchor.x, anchor.y, anchor.height])

  return createPortal(
    <div
      ref={ref}
      data-cursor-popup
      onMouseDown={onMouseDown}
      className={cn('fixed z-50 overflow-y-auto', className)}
      style={{
        left: pos?.left ?? anchor.x,
        top: pos?.top ?? anchor.y + anchor.height + GAP,
        maxHeight: pos?.maxHeight,
        // Konum ölçülene kadar saydam: gizli (visibility) öğe odak alamaz, içindeki giriş kutusu otomatik odaklanmalı.
        opacity: pos ? 1 : 0
      }}
    >
      {children}
    </div>,
    container ?? document.body
  )
}
