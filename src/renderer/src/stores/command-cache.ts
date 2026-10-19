import { readUserJson, writeUserJson } from '@/lib/user-storage'

/**
 * Sunucudaki komut adları (autocomplete ve komut renklendirme için) sunucu başına önbellekte tutulur: kurulumda en
 * büyük veri budur ve sık değişmez; önbellek tazeyken bağlanınca istenmez.
 */
const KEY = 'commandNameCache'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_SERVERS = 20

interface Entry {
  at: number
  names: string[]
}

function read(): Record<string, Entry> {
  const raw = readUserJson(KEY)
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, Entry> = {}
  for (const [id, e] of Object.entries(raw as Record<string, Partial<Entry>>)) {
    if (e && typeof e.at === 'number' && Array.isArray(e.names))
      out[id] = { at: e.at, names: e.names.filter((n) => typeof n === 'string') }
  }
  return out
}

/** Önbellekteki taze komut adları; yoksa ya da süresi geçtiyse null. */
export function cachedCommandNames(assetId: string, now = Date.now()): string[] | null {
  const entry = read()[assetId]
  return entry && now - entry.at < MAX_AGE_MS && entry.names.length ? entry.names : null
}

export function cacheCommandNames(assetId: string, names: string[], now = Date.now()): void {
  if (!names.length) return
  const all = read()
  all[assetId] = { at: now, names }
  const kept = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_SERVERS)
  writeUserJson(KEY, Object.fromEntries(kept))
}
