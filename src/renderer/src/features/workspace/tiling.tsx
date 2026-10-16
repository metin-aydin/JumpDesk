import { useEffect, useRef, useState } from 'react'
import {
  AppWindow,
  FolderSearch,
  Maximize2,
  Minimize2,
  PanelTopOpen,
  Radio,
  SquareArrowOutUpRight,
  X
} from 'lucide-react'
import { OsBadge } from '@/components/OsBadge'
import { HtmlPreview } from '@/components/titlebar/TabPreviewCard'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { AssetHoverCard } from '@/features/tree/AssetHoverCard'
import { closeTabSafely, detachSafely } from '@/features/layouts/guard'
import { terminalRegistry } from '@/features/terminal/registry'
import { dockTab, openInNewWindow } from '@/features/windows/detached-windows'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { shortcutLabel } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useServerMeta } from '@/stores/server-meta'
import { useTreeCommands } from '@/stores/tree-commands'
import { tabTitle, useWorkspace, type TabGroup, type WorkspaceTab } from '@/stores/workspace'
import { previewRegistry } from './preview-registry'
import type { Handle, TileLayout } from './tile-layout'
import type { PaneDrag } from './use-tiling'

const HANDLE_HIT = 6
const INFO_DELAY_MS = 450

const statusDot: Record<WorkspaceTab['status'], string> = {
  idle: 'bg-muted-foreground/40',
  connecting: 'bg-warning',
  connected: 'bg-success',
  closed: 'bg-muted-foreground/60',
  error: 'bg-destructive'
}

function HeaderButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-foreground/10 hover:text-foreground"
    >
      {children}
    </button>
  )
}

/**
 * Panel başlığının üzerinde beklenince sunucu bilgi kartı açılır. Fare başlıkta gezinirken süre yeniden başlamaz; kart
 * açıkken başlığın içinde kalındıkça açık kalır.
 */
function useInfoHover(): {
  info: DOMRect | null
  showInfo: (el: HTMLElement) => void
  hideInfo: () => void
} {
  const [info, setInfo] = useState<DOMRect | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return {
    info,
    showInfo: (el) => {
      if (timer.current || info) return
      timer.current = setTimeout(() => {
        timer.current = null
        setInfo(el.getBoundingClientRect())
      }, INFO_DELAY_MS)
    },
    hideInfo: () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setInfo(null)
    }
  }
}

/**
 * Gruptaki her panelin üstündeki ince başlık: sunucu kimliği, durum, iç IP, yayın ve panel eylemleri. Ayrı penceredeki
 * grupta panel, ayrı sekmeye alınmak yerine ana pencereye geri alınır ya da kendi penceresine ayrılır.
 */
export function PaneHeader({
  tab,
  group,
  focused,
  detached = false,
  onDragStart
}: {
  tab: WorkspaceTab
  group: TabGroup
  focused: boolean
  detached?: boolean
  onDragStart: (e: React.PointerEvent, tabId: string) => void
}): React.JSX.Element {
  const t = useT()
  const { toggleZoom, toggleExcluded, splitToWindow } = useWorkspace.getState()
  const localIp = useServerMeta((s) => (tab.asset ? s.byAsset[tab.asset.id]?.localIp : undefined))
  const zoomed = group.zoomedId === tab.id
  const excluded = group.excluded.includes(tab.id)
  const detach = (): void => (detached ? dockTab(tab.id) : void detachSafely(tab.id))
  const detachLabel = t(detached ? 'Ana Pencereye Al' : 'Ayrı Sekmeye Al')
  const DetachIcon = detached ? PanelTopOpen : SquareArrowOutUpRight
  const toWindow = (): void => (detached ? splitToWindow(tab.id) : void openInNewWindow(tab.id))
  const close = (id: string): void => void closeTabSafely(id)
  const { info, showInfo, hideInfo } = useInfoHover()
  /** Sağ tıktan sonra fare başlıktan çıkana kadar kart açılmaz. */
  const infoBlocked = useRef(false)
  const header = (
    <div
      data-pane-header={tab.id}
      onPointerDownCapture={hideInfo}
      // Kart başlığın tüm satırında açılır; düğmelerin üzerinde ve sağ tık menüsü açıkken açılmaz.
      onPointerMove={(e) => {
        if (infoBlocked.current || (e.target as HTMLElement).closest('button')) hideInfo()
        else showInfo(e.currentTarget)
      }}
      onPointerLeave={() => {
        infoBlocked.current = false
        hideInfo()
      }}
      onContextMenu={() => {
        infoBlocked.current = true
        hideInfo()
      }}
      onDoubleClick={() => toggleZoom(tab.id)}
      onMouseDown={(e) => {
        // Başlığa tıklamak odağı terminalden almaz; panel etkinleşince klavye girdisi doğrudan oturuma gider.
        if ((e.target as HTMLElement).closest('button')) return
        e.preventDefault()
        requestAnimationFrame(() => terminalRegistry.get(tab.id)?.focus())
      }}
      onPointerDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest('button')) onDragStart(e, tab.id)
      }}
      className={cn(
        'group/pane-header flex h-7 shrink-0 items-center gap-2 border-b px-2 text-[12px] transition-colors',
        focused
          ? 'border-primary/40 bg-primary/12 text-foreground'
          : 'bg-muted/70 text-muted-foreground'
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', statusDot[tab.status])} />
      <span className="relative shrink-0">
        <OsBadge platformType={tab.asset?.platformType} files={tab.view === 'files'} size="xs" />
        {tab.alarm && (
          <span
            aria-label={t('Alarm')}
            title={t('Alarm: Bu Panelde Kurala Takılan Bir Satır Var')}
            className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-background"
          />
        )}
      </span>
      <span className={cn('min-w-0 truncate', focused && 'font-medium')}>{tabTitle(tab, t)}</span>
      {info && tab.asset && (
        <AssetHoverCard
          placement="below"
          anchor={info}
          item={{
            id: tab.asset.id,
            kind: 'asset',
            assetId: tab.asset.id,
            name: tab.asset.name,
            address: tab.asset.address,
            platformType: tab.asset.platformType
          }}
        />
      )}
      {localIp && (
        <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          {localIp}
        </span>
      )}
      {group.broadcast && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleExcluded(tab.id)
          }}
          title={t(excluded ? 'Yayına Kat' : 'Yayından Çıkar')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium',
            excluded ? 'bg-muted text-muted-foreground line-through' : 'bg-warning/20 text-warning'
          )}
        >
          <Radio className="size-3" /> {t('Yayın')}
        </button>
      )}
      <span className="flex-1" />
      <div
        className={cn(
          'flex items-center gap-0.5',
          focused ? '' : 'opacity-0 group-hover/pane-header:opacity-100'
        )}
      >
        <HeaderButton
          title={`${t(zoomed ? 'Küçült' : 'Büyüt')} (${shortcutLabel('Enter')})`}
          onClick={() => toggleZoom(tab.id)}
        >
          {zoomed ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
        </HeaderButton>
        <HeaderButton title={detachLabel} onClick={detach}>
          <DetachIcon className="size-3" />
        </HeaderButton>
        <HeaderButton title={t('Oturumu Kapat')} onClick={() => close(tab.id)}>
          <X className="size-3.5" />
        </HeaderButton>
      </div>
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger render={header} />
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onClick={() => toggleZoom(tab.id)}>
          {zoomed ? <Minimize2 /> : <Maximize2 />} {t(zoomed ? 'Küçült' : 'Büyüt')}
          <ContextMenuShortcut>{shortcutLabel('Enter')}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={detach}>
          <DetachIcon /> {detachLabel}
        </ContextMenuItem>
        <ContextMenuItem onClick={toWindow}>
          <AppWindow /> {t('Yeni Pencerede Aç')}
        </ContextMenuItem>
        {tab.asset && (
          <ContextMenuItem
            onClick={() => {
              if (detached) jumpdesk.win.focus()
              void useTreeCommands.getState().reveal(tab.asset!.id)
            }}
          >
            <FolderSearch /> {t('Klasörde Göster')}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => close(tab.id)}>
          <X /> {t('Kapat')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Sürüklenen panelin imleçle hareket eden küçük kopyası: başlık ve oturumun anlık görüntüsü. */
export function DragGhost({
  drag,
  tab
}: {
  drag: PaneDrag
  tab?: WorkspaceTab
}): React.JSX.Element {
  const t = useT()
  const [preview] = useState(() => previewRegistry.capture(drag.sourceId))
  return (
    <div
      className="pointer-events-none absolute z-40 overflow-hidden rounded-lg border border-primary/50 bg-popover shadow-2xl"
      style={{ left: drag.x, top: drag.y, width: drag.width, maxHeight: drag.height }}
    >
      <div className="flex h-7 items-center gap-2 border-b bg-primary/12 px-2 text-[12px] font-medium">
        <OsBadge platformType={tab?.asset?.platformType} files={tab?.view === 'files'} size="xs" />
        <span className="truncate">{tab && tabTitle(tab, t)}</span>
      </div>
      {preview?.kind === 'html' && (
        <HtmlPreview
          html={preview.html}
          background={preview.background}
          width={drag.width}
          maxHeight={drag.height - 28}
          className="border-t-0"
        />
      )}
      {preview?.kind === 'image' && (
        <img src={preview.src} alt="" className="block w-full object-contain" />
      )}
    </div>
  )
}

/** Paneller arasındaki boyutlandırma tutamaçları. */
export function TileHandles({
  layout,
  onResize
}: {
  layout: TileLayout | null
  onResize: (e: React.PointerEvent, handle: Handle) => void
}): React.JSX.Element {
  const t = useT()
  return (
    <>
      {layout?.handles.map((h) => (
        <div
          key={h.kind === 'row' ? `row-${h.row}` : `col-${h.before}-${h.after}`}
          role="separator"
          aria-orientation={h.kind === 'row' ? 'horizontal' : 'vertical'}
          title={t('Sürükleyerek Boyutlandır, Çift Tıklayarak Eşitle')}
          onPointerDown={(e) => onResize(e, h)}
          className={cn(
            'group/handle absolute z-20',
            h.kind === 'row' ? 'cursor-row-resize' : 'cursor-col-resize'
          )}
          style={
            h.kind === 'row'
              ? {
                  left: `${h.rect.left}%`,
                  width: `${h.rect.width}%`,
                  top: `calc(${h.rect.top}% - ${HANDLE_HIT / 2}px)`,
                  height: HANDLE_HIT
                }
              : {
                  top: `${h.rect.top}%`,
                  height: `${h.rect.height}%`,
                  left: `calc(${h.rect.left}% - ${HANDLE_HIT / 2}px)`,
                  width: HANDLE_HIT
                }
          }
        >
          <div
            className={cn(
              'absolute bg-border transition-colors group-hover/handle:bg-primary/70',
              h.kind === 'row' ? 'inset-x-0 top-1/2 h-px' : 'inset-y-0 left-1/2 w-px'
            )}
          />
        </div>
      ))}
    </>
  )
}
