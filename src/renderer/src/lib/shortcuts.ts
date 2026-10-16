import { jumpdesk } from './jumpdesk'

export const isMac = jumpdesk.platform === 'darwin'

/** Terminalde Ctrl+W/T/K gibi kabuk kısayollarıyla çakışmamak için Windows/Linux'ta Ctrl+Shift kullanılır. */
export function shortcutLabel(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+Shift+${key}`
}

export function isAppShortcut(e: KeyboardEvent, key: string): boolean {
  const k = e.key.toUpperCase()
  const want = key.toUpperCase()
  if (isMac) return e.metaKey && !e.ctrlKey && !e.altKey && k === want
  return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && k === want
}

/** Ayarlar: Ctrl+, (macOS ⌘,), yaygın masaüstü uygulamalarındaki gibi. */
export const SETTINGS_SHORTCUT = isMac ? '⌘,' : 'Ctrl+,'

export function isSettingsShortcut(e: KeyboardEvent): boolean {
  return (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ','
}
