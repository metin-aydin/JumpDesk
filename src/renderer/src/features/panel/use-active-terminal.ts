import { useSyncExternalStore } from 'react'
import { terminalRegistry, type TerminalHandle } from '@/features/terminal/registry'
import { useWorkspace, type WorkspaceTab } from '@/stores/workspace'

/** Etkin sekme bağlı bir terminal ise onun tutamağı ve sekmesi. */
export function useActiveTerminal(): { tab?: WorkspaceTab; handle?: TerminalHandle } {
  const activeId = useWorkspace((s) => s.activeId)
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId))
  const handle = useSyncExternalStore(terminalRegistry.subscribe, () =>
    terminalRegistry.get(activeId)
  )
  return { tab: tab?.kind === 'session' ? tab : undefined, handle }
}
