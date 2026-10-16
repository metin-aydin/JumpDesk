import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { OsBadge } from '@/components/OsBadge'
import { previewRegistry } from '@/features/workspace/preview-registry'
import { useT } from '@/lib/i18n'
import { displayAddress } from '@/lib/os'
import { cn } from '@/lib/utils'
import { useServerMeta } from '@/stores/server-meta'
import { tabTitle, type WorkspaceTab } from '@/stores/workspace'
import { usePortalContainer } from '@/lib/portal-container'

const STATUS_TEXT: Record<WorkspaceTab['status'], string> = {
  idle: 'Bekliyor',
  connecting: 'Bağlanıyor',
  connected: 'Bağlı',
  closed: 'Oturum kapandı',
  error: 'Bağlantı hatası'
}

const CARD_WIDTH = 340
const MAX_PREVIEW_HEIGHT = 260

/** Terminal görüntüsünü doğal boyutunda çizip karta sığacak şekilde ölçekler; hiçbir satır kırpılmaz. */
export function HtmlPreview({
  html,
  background,
  width = CARD_WIDTH,
  maxHeight = MAX_PREVIEW_HEIGHT,
  className
}: {
  html: string
  background: string
  width?: number
  maxHeight?: number
  className?: string
}): React.JSX.Element {
  const innerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ scale: 1, height: 0 })

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const w = el.scrollWidth
    const h = el.scrollHeight
    if (!w || !h) return
    const scale = Math.min((width - 12) / w, maxHeight / h, 1)
    setBox({ scale, height: Math.ceil(h * scale) + 8 })
  }, [html, width, maxHeight])

  return (
    <div
      className={cn('overflow-hidden border-t px-1.5 pt-1', className)}
      style={{ background, height: box.height || undefined }}
    >
      <div
        ref={innerRef}
        className="pointer-events-none w-max origin-top-left [&_*]:!font-mono [&_*]:!text-[11px] [&_*]:!leading-[1.25] [&_pre]:!m-0"
        style={{ transform: `scale(${box.scale})` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function Identity({ tab }: { tab: WorkspaceTab }): React.JSX.Element {
  const t = useT()
  const localIp = useServerMeta((s) => (tab.asset ? s.byAsset[tab.asset.id]?.localIp : undefined))
  const ip = displayAddress(localIp, tab.asset?.address)
  return (
    <div className="flex items-start gap-2">
      {tab.asset && (
        <OsBadge
          platformType={tab.asset.platformType}
          files={tab.view === 'files'}
          size="sm"
          className="mt-0.5"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug font-medium break-all text-popover-foreground">
          {tabTitle(tab, t)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {[
            ip?.text,
            tab.asset?.address !== ip?.text ? tab.asset?.address : undefined,
            tab.kind === 'session' ? t(STATUS_TEXT[tab.status]) : undefined
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </div>
  )
}

/**
 * Chrome'daki gibi sekme üzerine gelince açılan kart: tam ad, adres, durum ve oturumun anlık görüntüsü.
 * `below`: sekmenin altında; `left`: listedeki satırın solunda (sekme arama), pencereden taşmayacak şekilde kaydırılır.
 */
export function TabPreviewCard({
  tabs,
  anchor,
  placement = 'below'
}: {
  tabs: WorkspaceTab[]
  anchor: DOMRect
  placement?: 'below' | 'left'
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shiftUp, setShiftUp] = useState(0)
  // Kart, sekmenin bulunduğu pencereye (ayrı pencere dahil) çizilir.
  const container = usePortalContainer() ?? document.body
  const view = container.ownerDocument.defaultView ?? window
  const left =
    placement === 'left'
      ? Math.max(8, anchor.left - CARD_WIDTH - 8)
      : Math.max(8, Math.min(anchor.left, view.innerWidth - CARD_WIDTH - 8))
  const top = placement === 'left' ? anchor.top : anchor.bottom + 6
  const single = tabs.length === 1 ? tabs[0] : null
  const preview = single?.kind === 'session' ? previewRegistry.capture(single.id) : null

  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el || placement !== 'left') return
    const overflow = top + el.offsetHeight + 8 - view.innerHeight
    setShiftUp(overflow > 0 ? overflow : 0)
  }, [top, placement, tabs, view])

  return createPortal(
    <div
      ref={cardRef}
      className="pointer-events-none fixed z-[60] overflow-hidden rounded-lg border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ top: Math.max(8, top - shiftUp), left, width: CARD_WIDTH }}
    >
      <div className="space-y-2 p-2.5">
        {tabs.map((tab) => (
          <Identity key={tab.id} tab={tab} />
        ))}
      </div>
      {preview?.kind === 'html' && (
        <HtmlPreview html={preview.html} background={preview.background} />
      )}
      {preview?.kind === 'image' && (
        <div className="border-t bg-black">
          <img src={preview.src} alt="" className="block max-h-[260px] w-full object-contain" />
        </div>
      )}
    </div>,
    container
  )
}
