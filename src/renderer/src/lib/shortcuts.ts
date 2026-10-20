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

/** Numara kısayolu: şeritteki n. sekmeye (`tab`) ya da etkin gruptaki n. panele (`pane`) geçiş; 9 = sonuncusu. */
export interface NumberShortcut {
  scope: 'tab' | 'pane'
  n: number
}

/**
 * Ctrl+1…9 (macOS ⌘) şeritteki sekmeye, Alt+1…9 (macOS'ta Option+rakam karakter yazdığı için ⌃) gruptaki panele
 * geçer. Shift'li ve AltGr'li (Windows'ta Ctrl+Alt olarak gelir; rakamla `{ [ ] }` gibi karakterler yazar) basışlar
 * kısayol sayılmaz.
 */
export function numberShortcut(e: KeyboardEvent): NumberShortcut | null {
  const m = /^Digit([1-9])$/.exec(e.code)
  if (!m || e.shiftKey || e.getModifierState('AltGraph')) return null
  const n = Number(m[1])
  const { ctrlKey: ctrl, altKey: alt, metaKey: meta } = e
  if (isMac) {
    if (meta && !ctrl && !alt) return { scope: 'tab', n }
    if (ctrl && !meta && !alt) return { scope: 'pane', n }
    return null
  }
  if (ctrl && !alt && !meta) return { scope: 'tab', n }
  if (alt && !ctrl && !meta) return { scope: 'pane', n }
  return null
}

/** Ayarlar: Ctrl+, (macOS ⌘,), yaygın masaüstü uygulamalarındaki gibi. */
export const SETTINGS_SHORTCUT = isMac ? '⌘,' : 'Ctrl+,'

export function isSettingsShortcut(e: KeyboardEvent): boolean {
  return (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ','
}
