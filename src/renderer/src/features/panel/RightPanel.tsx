import { Bell, FolderOpen, Highlighter, History, Rocket } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAlarms } from '@/stores/alarms'
import { useRightPanel } from '@/stores/right-panel'
import { AlarmsPanel } from './AlarmsPanel'
import { FilesPanel } from './FilesPanel'
import { HighlightsPanel } from './HighlightsPanel'
import { HistoryPanel } from './HistoryPanel'
import { SnippetsPanel } from './SnippetsPanel'

const TABS = [
  { id: 'snippets', label: 'Snippetler', Icon: Rocket },
  { id: 'history', label: 'Geçmiş', Icon: History },
  { id: 'files', label: 'Dosyalar', Icon: FolderOpen },
  { id: 'alarms', label: 'Alarmlar', Icon: Bell },
  { id: 'highlights', label: 'Vurgular', Icon: Highlighter }
] as const

export function RightPanel({
  onResizeStart
}: {
  /** Sol kenardaki tutamaçtan sürükleyerek genişlik ayarlanır. */
  onResizeStart: (e: React.PointerEvent) => void
}): React.JSX.Element {
  const t = useT()
  const tab = useRightPanel((s) => s.tab)
  const setTab = useRightPanel((s) => s.setTab)
  const unread = useAlarms((s) => s.unread)
  return (
    <aside className="relative flex w-full shrink-0 flex-col border-l border-sidebar-border bg-sidebar">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('Sağ Panelin Genişliğini Ayarla')}
        onPointerDown={onResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize"
      />
      <div className="flex items-center gap-1 border-b border-sidebar-border p-2">
        {TABS.map(({ id, label, Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t(label)}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors',
                    tab === id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                  )}
                />
              }
            >
              <span className="relative">
                <Icon className="size-4" />
                {id === 'alarms' && unread > 0 && tab !== 'alarms' && (
                  <span className="absolute -top-1.5 -right-2 min-w-3.5 rounded-full bg-destructive px-1 text-center text-[9px] leading-3.5 font-semibold text-white tabular-nums">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              {tab === id && t(label)}
            </TooltipTrigger>
            <TooltipContent>{t(label)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {tab === 'snippets' ? (
        <SnippetsPanel />
      ) : tab === 'history' ? (
        <HistoryPanel />
      ) : tab === 'files' ? (
        <FilesPanel />
      ) : tab === 'alarms' ? (
        <AlarmsPanel />
      ) : (
        <HighlightsPanel />
      )}
    </aside>
  )
}
