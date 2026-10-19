import { currentLocale } from '@/lib/i18n'

/** Kullanım eşiğinin yazı rengi (`usageLevel`). */
export const LEVEL_CLASS = {
  ok: 'text-success',
  warn: 'text-warning',
  critical: 'text-destructive'
} as const

export function formatPercent(value: number | null): string {
  return value === null ? '…' : `${Math.round(value)}%`
}

/** İşlem belleği: 1 GB ve üstü GB (bir ondalık), altı MB. */
export function formatMemory(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${formatGb(bytes)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

/** Bayt değerini GB olarak (bir ondalık, geçerli dilin biçimiyle). */
export function formatGb(bytes: number): string {
  return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 1 }).format(
    bytes / 1024 ** 3
  )
}
