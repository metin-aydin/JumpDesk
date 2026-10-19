import { usePreferences } from '@/stores/preferences'
import { useServerStats } from '@/stores/server-stats'
import { useSessionInfo } from '@/stores/session-info'

/** Oturumun üstünde şerit (ya da ölçümü başlatan düğme) görünüyor mu. */
export function useStatusBarVisible(tabId: string): boolean {
  const enabled = usePreferences((s) => s.serverStatus)
  const integration = useSessionInfo((s) => s.byTab[tabId]?.integration)
  const hasStats = useServerStats((s) => tabId in s.byTab)
  const requested = useServerStats((s) => s.requested[tabId] ?? false)
  return enabled && integration === 'ready' && (hasStats || !requested)
}
