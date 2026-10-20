import { usePreferences } from '@/stores/preferences'
import { useServerStats } from '@/stores/server-stats'
import { useSessionInfo } from '@/stores/session-info'

/**
 * Oturumun üstündeki durum alanı: gizli, ölçümü başlatan düğme (ayar açılmadan önce bağlanan oturum), şerit ya da
 * kabuk entegrasyonu kurulamadığı için durumun alınamadığını söyleyen satır.
 */
export type StatusBarState = 'hidden' | 'start' | 'strip' | 'failed'

export function useStatusBarState(tabId: string): StatusBarState {
  const enabled = usePreferences((s) => s.serverStatus)
  const integration = useSessionInfo((s) => s.byTab[tabId]?.integration)
  const hasStats = useServerStats((s) => tabId in s.byTab)
  const requested = useServerStats((s) => s.requested[tabId] ?? false)
  if (!enabled) return 'hidden'
  if (integration === 'failed') return 'failed'
  if (integration !== 'ready') return 'hidden'
  if (hasStats) return 'strip'
  return requested ? 'hidden' : 'start'
}

/** Oturumun üstünde durum alanı görünüyor mu (terminal şeride bitişik hizalanır). */
export function useStatusBarVisible(tabId: string): boolean {
  return useStatusBarState(tabId) !== 'hidden'
}
