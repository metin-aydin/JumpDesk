import { Keyboard, Monitor, Moon, PanelLeft, PanelRight, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { shortcutLabel } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAlarms } from '@/stores/alarms'
import { useDialogs } from '@/stores/dialogs'
import { useOverlay } from '@/stores/overlay'
import { useTheme } from '@/stores/theme'
import { useWindowState } from '@/stores/window'
import { useWorkspace } from '@/stores/workspace'
import { TabSearch } from './TabSearch'
import { TabStrip } from './TabStrip'
import { WindowControls } from './WindowControls'

export const TITLEBAR_HEIGHT = 40

const iconButton =
  'app-no-drag inline-flex size-7 items-center justify-center rounded-md text-titlebar-foreground transition-colors duration-100 hover:bg-foreground/8 hover:text-foreground'

function ThemeMenu(): React.JSX.Element {
  const t = useT()
  const { info, setPreference } = useTheme()
  const Icon = info.preference === 'system' ? Monitor : info.resolved === 'dark' ? Moon : Sun
  return (
    <DropdownMenu onOpenChange={(open) => useOverlay.getState().setOpen(open)}>
      <DropdownMenuTrigger
        render={<button type="button" aria-label={t('Tema')} className={iconButton} />}
      >
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => void setPreference('system')}>
          <Monitor /> {t('Sistem')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void setPreference('light')}>
          <Sun /> {t('Açık')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void setPreference('dark')}>
          <Moon /> {t('Koyu')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TitleBar({ showTabs = true }: { showTabs?: boolean }): React.JSX.Element {
  const t = useT()
  const isMac = jumpdesk.platform === 'darwin'
  const fullscreen = useWindowState((s) => s.fullscreen)
  const rightPanelOpen = useWorkspace((s) => s.rightPanelOpen)
  const toggleRightPanel = useWorkspace((s) => s.toggleRightPanel)
  const leftPanelOpen = useWorkspace((s) => s.leftPanelOpen)
  const alarmUnread = useAlarms((s) => s.unread)
  const toggleLeftPanel = useWorkspace((s) => s.toggleLeftPanel)

  return (
    <header
      data-titlebar
      className="app-drag flex shrink-0 items-center border-b border-border/70 bg-titlebar"
      style={{ height: TITLEBAR_HEIGHT }}
    >
      <div
        className={cn(
          'flex h-full shrink-0 items-center',
          isMac && !fullscreen ? 'w-[78px]' : 'w-2.5'
        )}
      />
      {showTabs && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t('Sunucu Ağacını Aç/Kapat')}
                aria-pressed={leftPanelOpen}
                onClick={toggleLeftPanel}
                className={cn(
                  iconButton,
                  'mr-1.5 shrink-0',
                  leftPanelOpen && 'bg-foreground/8 text-foreground'
                )}
              />
            }
          >
            <PanelLeft className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            {t('Sunucu Ağacını Aç/Kapat')} ({shortcutLabel('E')})
          </TooltipContent>
        </Tooltip>
      )}
      <div className="flex h-full min-w-0 flex-1 items-center">{showTabs && <TabStrip />}</div>
      <div className="flex h-full items-center gap-1 pr-1.5 pl-2">
        {showTabs && <TabSearch className={iconButton} />}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t('Klavye Kısayolları')}
                onClick={() => useDialogs.getState().setShortcuts(true)}
                className={iconButton}
              />
            }
          >
            <Keyboard className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            {t('Klavye Kısayolları')} ({shortcutLabel('K')})
          </TooltipContent>
        </Tooltip>
        <ThemeMenu />
        {showTabs && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t('Sağ paneli aç/kapat')}
                  aria-pressed={rightPanelOpen}
                  onClick={toggleRightPanel}
                  className={cn(iconButton, rightPanelOpen && 'bg-foreground/8 text-foreground')}
                />
              }
            >
              <span className="relative">
                <PanelRight className="size-4" />
                {alarmUnread > 0 && !rightPanelOpen && (
                  <span
                    aria-label={t('Okunmamış Alarm')}
                    className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-titlebar"
                  />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t('Sağ Paneli Aç/Kapat')} ({shortcutLabel('B')})
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <WindowControls />
    </header>
  )
}
