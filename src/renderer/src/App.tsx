import { useEffect } from 'react'
import { revealAlarm } from '@/features/alarms/reveal'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { startNotificationSync } from '@/features/alarms/notification-sync'
import { Toaster } from '@/components/Toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { SlidePanel } from '@/components/SlidePanel'
import { RightPanel } from '@/features/panel/RightPanel'
import { Sidebar } from '@/features/tree/Sidebar'
import { TagDialog } from '@/features/tree/TagDialog'
import { LayoutDialog } from '@/features/layouts/LayoutDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { ShortcutsDialog } from '@/components/ShortcutsDialog'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SnippetEditorDialog } from '@/features/snippets/SnippetEditorDialog'
import { ExportDialog } from '@/features/transfer/ExportDialog'
import { ImportDialog } from '@/features/transfer/ImportDialog'
import { Workspace } from '@/features/workspace/Workspace'
import { DetachedWindows } from '@/features/windows/DetachedWindows'
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts'
import { usePanelWidth } from '@/hooks/use-panel-width'
import { useAuth } from '@/stores/auth'
import { useWorkspace } from '@/stores/workspace'

function Main(): React.JSX.Element {
  const t = useT()
  const rightPanelOpen = useWorkspace((s) => s.rightPanelOpen)
  useEffect(() => startNotificationSync(), [])
  useEffect(() => jumpdesk.notify.onClick(({ tabId, line }) => revealAlarm(tabId, line)), [])
  const right = usePanelWidth('rightPanelWidth', 320, 260, 640, 'left')
  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar />
      <Workspace />
      <DetachedWindows />
      <SlidePanel
        open={rightPanelOpen}
        side="right"
        width={right.width}
        animate={!right.resizing}
        label={t('Sağ Panel')}
      >
        <RightPanel onResizeStart={right.startResize} />
      </SlidePanel>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const state = useAuth((s) => s.state)
  const loggedIn = state?.status === 'logged-in'
  useGlobalShortcuts(loggedIn)

  return (
    <TooltipProvider delay={500}>
      <div className="flex h-full flex-col">
        <TitleBar showTabs={loggedIn} />
        {loggedIn ? <Main /> : state ? <LoginScreen state={state} /> : <div className="flex-1" />}
      </div>
      <Toaster />
      {loggedIn && <TagDialog />}
      {loggedIn && <LayoutDialog />}
      {loggedIn && <CommandPalette />}
      {loggedIn && <SnippetEditorDialog />}
      {loggedIn && <ExportDialog />}
      {loggedIn && <ImportDialog />}
      <ShortcutsDialog />
      <SettingsDialog />
      <ConfirmDialog />
    </TooltipProvider>
  )
}
