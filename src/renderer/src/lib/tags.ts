import type { ServerMeta } from '@shared/types'

const PALETTE = [
  'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300'
]

export const normalizeTag = (tag: string): string =>
  tag.trim().replace(/^#+/, '').replace(/\s+/g, '-')

export const tagKey = (tag: string): string => normalizeTag(tag).toLocaleLowerCase('tr')

/** Aynı etiket her yerde aynı renkte görünür. */
export function tagColor(tag: string): string {
  let h = 0
  for (const ch of tagKey(tag)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function allTags(byAsset: Record<string, ServerMeta>): string[] {
  const seen = new Map<string, string>()
  for (const meta of Object.values(byAsset))
    for (const t of meta.tags ?? []) if (!seen.has(tagKey(t))) seen.set(tagKey(t), t)
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'))
}

/** `#etiket` yalnız etiketlerde tam eşleşme, düz metin etiketlerde kısmi eşleşme arar. */
export function tagsMatch(tags: string[] | undefined, query: string): boolean {
  if (!tags?.length) return false
  const q = query.trim()
  if (!q) return false
  if (q.startsWith('#')) return tags.some((t) => tagKey(t) === tagKey(q))
  const needle = q.toLocaleLowerCase('tr')
  return tags.some((t) => tagKey(t).includes(needle))
}
