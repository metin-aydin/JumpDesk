import { create } from 'zustand'
import { jumpdesk } from '@/lib/jumpdesk'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

/** Ayarlar → Bildirimler: alarm bildirimleri ve bağlantıdan sonra alarmların bekletildiği süreler. */
export interface NotificationSettings {
  /** Alarm yakalanınca (oturum ekranda değilse) masaüstü bildirimi gösterilir. */
  alarmDesktop: boolean
  /** Bağlantı kurulduktan sonra alarm yakalanmayan süre (saniye). */
  connectWaitSec: number
  /** Bağlanınca çalışan snippetlerin hepsi gönderildikten sonra alarm yakalanmayan süre (saniye). */
  snippetWaitSec: number
}

export const NOTIFICATION_DEFAULTS: NotificationSettings = {
  alarmDesktop: true,
  connectWaitSec: 20,
  snippetWaitSec: 10
}

export const WAIT_LIMITS = { min: 0, max: 300 }

const KEY = 'notificationSettings'

const clampWait = (v: number): number =>
  Math.min(WAIT_LIMITS.max, Math.max(WAIT_LIMITS.min, Math.round(v)))

export function sanitizeNotificationSettings(raw: unknown): NotificationSettings {
  const out = { ...NOTIFICATION_DEFAULTS }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (typeof r['alarmDesktop'] === 'boolean') out.alarmDesktop = r['alarmDesktop']
  for (const key of ['connectWaitSec', 'snippetWaitSec'] as const) {
    const v = r[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clampWait(v)
  }
  return out
}

interface NotificationSettingsStore extends NotificationSettings {
  set: (patch: Partial<NotificationSettings>) => void
  replace: (settings: NotificationSettings) => void
}

export const useNotificationSettings = create<NotificationSettingsStore>((set) => ({
  ...sanitizeNotificationSettings(readUserJson(KEY)),
  set: (patch) => {
    const next = sanitizeNotificationSettings({ ...currentNotificationSettings(), ...patch })
    writeUserJson(KEY, next)
    set(next)
  },
  replace: (settings) => {
    writeUserJson(KEY, settings)
    set(settings)
  }
}))

onUserScope(() => useNotificationSettings.setState(sanitizeNotificationSettings(readUserJson(KEY))))

export function currentNotificationSettings(): NotificationSettings {
  const { alarmDesktop, connectWaitSec, snippetWaitSec } = useNotificationSettings.getState()
  return { alarmDesktop, connectWaitSec, snippetWaitSec }
}

/** Bağlantıdan sonra alarm bekleme süresi (ms); ortam değişkeni (test) ayarın önüne geçer. */
export function alarmConnectWaitMs(): number {
  return jumpdesk.alarmWarmupMs ?? useNotificationSettings.getState().connectWaitSec * 1000
}

/** Otomatik snippetler gönderildikten sonra alarm bekleme süresi (ms). */
export function alarmSnippetWaitMs(): number {
  return jumpdesk.alarmSnippetWaitMs ?? useNotificationSettings.getState().snippetWaitSec * 1000
}
