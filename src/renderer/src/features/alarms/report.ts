import { t } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { useAlarms, type AlarmRule } from '@/stores/alarms'
import { useNotificationSettings } from '@/stores/notification-settings'
import { detachedHasFocus } from '@/features/windows/detached-windows'
import { flashAlarm } from '@/stores/spotlight'
import { findTab, groupOf, useWorkspace } from '@/stores/workspace'

const NOTIFY_THROTTLE_MS = 30_000
const lastNotified = new Map<string, number>()

/** Sekme şu an ekranda mı (etkin sekme ya da etkin grubun bir paneli). */
function isOnScreen(tabId: string): boolean {
  const { activeId, groups } = useWorkspace.getState()
  if (activeId === tabId) return true
  const group = groupOf(groups, activeId)
  return Boolean(
    group && group.ids.includes(tabId) && (!group.zoomedId || group.zoomedId === tabId)
  )
}

/**
 * Alarm eşleşmesini kaydeder; yeni olayda oturum ekrandaysa üzerinde yarı saydam kırmızı katman gelip gider. Oturum odakta değilse (pencere odakta değil ya da başka sekme/panel odakta) sekmeye ve
 * grup içindeyse panel başlığına kırmızı rozet konur; rozet yalnız o oturuma odaklanınca kalkar. Oturum ekranda da
 * değilse yeni olay için masaüstü bildirimi gösterilir (Ayarlar → Bildirimler'de kapatılabilir); aynı sekme + kural
 * için bildirimler seyreltilir.
 */
export function reportAlarm(tabId: string, rule: AlarmRule, line: string): void {
  const ws = useWorkspace.getState()
  const tab = findTab(ws, tabId)
  const source = tab?.title ?? t('Oturum')
  const isNew = useAlarms.getState().record(tabId, source, rule, line)
  if (isNew) flashAlarm(tabId)
  const windowFocused = document.hasFocus()
  if ((windowFocused && ws.activeId === tabId) || detachedHasFocus(tabId)) {
    useAlarms.getState().markTabRead(tabId)
    return
  }
  if (tab && !tab.alarm) ws.updateTab(tabId, { alarm: true })
  if (!isNew || (windowFocused && isOnScreen(tabId))) return
  if (!useNotificationSettings.getState().alarmDesktop) return
  const key = `${tabId}|${rule.id}`
  const now = Date.now()
  if (now - (lastNotified.get(key) ?? 0) < NOTIFY_THROTTLE_MS) return
  lastNotified.set(key, now)
  jumpdesk.notify.show({
    title: `${source}: ${rule.pattern}`,
    body: line.slice(0, 200),
    tabId,
    line
  })
}
