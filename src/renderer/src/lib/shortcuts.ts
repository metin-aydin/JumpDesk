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

/**
 * Sekme şeridindeki n. öğeye geçiş (9 = son öğe): Ctrl+1…9 (macOS ⌘+1…9); Windows ve Linux'ta Alt+1…9 da (GNOME
 * Terminal, Konsole ve Firefox'taki gibi). macOS'ta Option+rakam karakter yazdığı için Alt kullanılmaz. AltGr
 * (Windows'ta Ctrl+Alt olarak gelir) rakamla `{ [ ] }` gibi karakterler yazar; ona dokunulmaz. Kısayol değilse null.
 */
export function tabNumberShortcut(e: KeyboardEvent): number | null {
  const m = /^Digit([1-9])$/.exec(e.code)
  if (!m || e.shiftKey || e.getModifierState('AltGraph')) return null
  const primary = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  const alt = !isMac && e.altKey && !e.ctrlKey && !e.metaKey
  if ((primary && !e.altKey) || alt) return Number(m[1])
  return null
}

/** Ayarlar: Ctrl+, (macOS ⌘,), yaygın masaüstü uygulamalarındaki gibi. */
export const SETTINGS_SHORTCUT = isMac ? '⌘,' : 'Ctrl+,'

export function isSettingsShortcut(e: KeyboardEvent): boolean {
  return (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ','
}
