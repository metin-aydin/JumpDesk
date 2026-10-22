import { createPortal } from 'react-dom'
import { PanelTopOpen } from 'lucide-react'
import { TabStrip } from '@/components/titlebar/TabStrip'
import { WindowControls } from '@/components/titlebar/WindowControls'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AiExplainDialog } from '@/features/ai/AiExplainDialog'
import { closeWindowSafely } from '@/features/layouts/guard'
import { WindowWorkspace } from '@/features/workspace/Workspace'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { PortalContainerContext } from '@/lib/portal-container'
import { cn } from '@/lib/utils'
import { useWorkspace, windowIdOf } from '@/stores/workspace'
import { dockWindow, useDetachedWindows, type DetachedEntry } from './detached-windows'

const TITLEBAR_HEIGHT = 40

/**
 * Ayrı pencere: ana pencere gibi kendi sekme şeridi ve çalışma alanı vardır. Sekmeler pencereler arasında sürüklenip
 * bırakılarak taşınır; pencerenin tüm sekmeleri ana pencereye tek düğmeyle geri alınabilir.
 */
function DetachedChrome({
  windowId,
  entry
}: {
  windowId: string
  entry: DetachedEntry
}): React.JSX.Element {
  const t = useT()
  const isMac = jumpdesk.platform === 'darwin'
  return (
    <>
      <header
        data-titlebar
        className="app-drag flex shrink-0 items-center border-b border-border/70 bg-titlebar"
        style={{ height: TITLEBAR_HEIGHT }}
      >
        <div className={cn('shrink-0', isMac ? 'w-[78px]' : 'w-2.5')} />
        <div className="flex h-full min-w-0 flex-1 items-center">
          <TabStrip windowId={windowId} />
        </div>
        <div className="flex h-full items-center gap-1 pr-1.5 pl-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t('Ana Pencereye Geri Al')}
                  onClick={() => dockWindow(windowId)}
                  className="app-no-drag inline-flex size-7 items-center justify-center rounded-md text-titlebar-foreground hover:bg-foreground/8 hover:text-foreground"
                />
              }
            >
              <PanelTopOpen className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{t('Tüm Sekmeleri Ana Pencereye Geri Al')}</TooltipContent>
          </Tooltip>
        </div>
        <WindowControls
          detached={{ name: entry.name, onClose: () => void closeWindowSafely(windowId) }}
        />
      </header>
      <WindowWorkspace windowId={windowId} />
      <AiExplainDialog windowId={windowId} />
    </>
  )
}

/** Her ayrı pencerenin başlık çubuğu ve çalışma alanı o pencerenin belgesine çizilir. */
export function DetachedWindows(): React.JSX.Element {
  const windowIds = useWorkspace((s) => [...new Set(s.detached.map(windowIdOf))].join('|'))
  const windows = useDetachedWindows((s) => s.windows)
  return (
    <>
      {windowIds
        .split('|')
        .filter(Boolean)
        .map((windowId) => {
          const entry = windows[windowId]
          if (!entry) return null
          return createPortal(
            <PortalContainerContext.Provider value={entry.win.document.body}>
              <DetachedChrome windowId={windowId} entry={entry} />
            </PortalContainerContext.Provider>,
            entry.root,
            windowId
          )
        })}
    </>
  )
}
