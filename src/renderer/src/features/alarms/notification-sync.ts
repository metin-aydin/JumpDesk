import { jumpdesk } from '@/lib/jumpdesk'
import { useAlarms } from '@/stores/alarms'
import { useWorkspace } from '@/stores/workspace'

/**
 * Görülen alarmları okundu sayar ve masaüstü bildirimlerini kapatır; Alarmlar sekmesindeki sayı ve GNOME dock'taki
 * okunmamış bildirim sayısı böylece düşer. Bir oturuma odaklanınca (sekme ya da grup paneli etkinleşince, pencereye
 * dönülünce) yalnız o oturumunkiler, Alarmlar sekmesi açılınca tümü.
 */
export function startNotificationSync(): () => void {
  const offAlarms = useAlarms.subscribe((s, prev) => {
    if (prev.unread > 0 && s.unread === 0) jumpdesk.notify.clear()
    // Alarmlar temizlenince sekme ve panel rozetleri de kalkar.
    if (prev.events.length > 0 && s.events.length === 0) {
      useWorkspace.getState().clearAlarmBadges()
      jumpdesk.notify.clear()
    }
  })
  const offTabs = useWorkspace.subscribe((s, prev) => {
    if (s.activeId !== prev.activeId) {
      useAlarms.getState().markTabRead(s.activeId)
      jumpdesk.notify.clear(s.activeId)
    }
    if (s.tabs === prev.tabs) return
    for (const tab of prev.tabs) {
      if (!tab.alarm) continue
      const now = s.tabs.find((t) => t.id === tab.id)
      if (!now || !now.alarm) jumpdesk.notify.clear(tab.id)
    }
  })
  /** Pencereye dönüldüğünde odaktaki oturumun rozeti, kullanıcı ona baktığı için kaldırılır. */
  const onFocus = (): void => {
    const ws = useWorkspace.getState()
    useAlarms.getState().markTabRead(ws.activeId)
    jumpdesk.notify.clear(ws.activeId)
    if (ws.tabs.some((t) => t.id === ws.activeId && t.alarm))
      ws.updateTab(ws.activeId, { alarm: false })
  }
  window.addEventListener('focus', onFocus)
  return () => {
    offAlarms()
    offTabs()
    window.removeEventListener('focus', onFocus)
  }
}
