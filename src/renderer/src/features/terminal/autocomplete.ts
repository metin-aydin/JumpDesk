import type { Snippet } from '@/stores/snippets'

export type SuggestionKind = 'history' | 'snippet' | 'command' | 'directory' | 'file'

export interface Suggestion {
  kind: SuggestionKind
  /** Listede gösterilen metin. */
  label: string
  /** Kabul edildiğinde imlece yazılacak ek metin. */
  insert: string
  detail?: string
}

export interface CompletionSources {
  history: string[]
  snippets: Snippet[]
  commandNames: string[]
  entries: string[]
}

const MAX = 8

/** Satırdaki son sözcük (tırnak dışındaki son boşluktan sonrası). */
function currentWord(input: string): { word: string; isFirst: boolean } {
  let inQuote: string | null = null
  let lastSep = -1
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuote) {
      if (ch === inQuote) inQuote = null
    } else if (ch === '"' || ch === "'") inQuote = ch
    else if (ch === ' ' || ch === '|' || ch === ';' || ch === '&') lastSep = i
  }
  const word = input.slice(lastSep + 1)
  const before = input.slice(0, lastSep + 1).trimEnd()
  return { word, isFirst: !before || /[|;&]$/.test(before) || /^sudo$/.test(before) }
}

/** `manual` (Ctrl+Space) iken boş satırda son geçmiş komutları önerilir. */
export function computeSuggestions(
  input: string,
  src: CompletionSources,
  manual = false
): Suggestion[] {
  if (!input.trim()) {
    if (!manual) return []
    const recent: Suggestion[] = []
    const seen = new Set<string>()
    for (let i = src.history.length - 1; i >= 0 && recent.length < MAX; i--) {
      const h = src.history[i]
      if (seen.has(h)) continue
      seen.add(h)
      recent.push({ kind: 'history', label: h, insert: input ? h.slice(input.length) : h })
    }
    return recent
  }
  const out: Suggestion[] = []
  const seen = new Set<string>()
  const push = (s: Suggestion): void => {
    const key = `${s.kind}:${s.label}`
    if (seen.has(key) || !s.insert) return
    seen.add(key)
    out.push(s)
  }

  for (let i = src.history.length - 1; i >= 0 && out.length < 4; i--) {
    const h = src.history[i]
    if (h.length > input.length && h.startsWith(input))
      push({ kind: 'history', label: h, insert: h.slice(input.length) })
  }

  for (const s of src.snippets) {
    if (out.length >= 6) break
    if (s.command.length > input.length && s.command.startsWith(input)) {
      push({
        kind: 'snippet',
        label: s.command,
        insert: s.command.slice(input.length),
        detail: s.name
      })
    }
  }

  const { word, isFirst } = currentWord(input)
  if (word) {
    if (isFirst && !word.includes('/')) {
      for (const name of src.commandNames) {
        if (out.length >= MAX) break
        if (name.length > word.length && name.startsWith(word))
          push({ kind: 'command', label: name, insert: `${name.slice(word.length)} ` })
      }
    }
    if (!word.includes('/') || word.startsWith('./')) {
      const prefix = word.startsWith('./') ? word.slice(2) : word
      for (const entry of src.entries) {
        if (out.length >= MAX) break
        if (entry === './' || entry === '../') continue
        if (entry.length > prefix.length && entry.startsWith(prefix)) {
          const isDir = entry.endsWith('/')
          push({
            kind: isDir ? 'directory' : 'file',
            label: entry,
            insert: entry.slice(prefix.length) + (isDir ? '' : ' ')
          })
        }
      }
    }
  }
  return out.slice(0, MAX)
}

/** Dosya kipinde listelenen en çok girdi. */
const MAX_PATH = 300

/** İmleçten önceki sözcüğün klasör kısmı (`logs/a` → `logs/`, `app` → boş) ve adı. */
export function pathAt(input: string): { dir: string; base: string } {
  const { word } = currentWord(input)
  const slash = word.lastIndexOf('/')
  return { dir: word.slice(0, slash + 1), base: word.slice(slash + 1) }
}

/**
 * Dosya kipi önerileri: imleçteki yolun klasöründeki girdiler (önce klasörler), yazılan adla başlayanlar. Gizli
 * girdiler yalnız ad noktayla başlıyorsa gösterilir. Klasör kabul edilince sonuna boşluk eklenmez, içi listelenir.
 * Listede yalnız girdinin adı gösterilir; klasörün yolu pencerenin başlığındadır.
 */
export function computePathSuggestions(input: string, listing: string[]): Suggestion[] {
  const { base } = pathAt(input)
  return listing
    .filter((e) => e !== './' && e !== '../' && e.startsWith(base) && e.length > base.length)
    .filter((e) => base.startsWith('.') || !e.startsWith('.'))
    .sort((a, b) => Number(b.endsWith('/')) - Number(a.endsWith('/')))
    .slice(0, MAX_PATH)
    .map((entry) => {
      const isDir = entry.endsWith('/')
      return {
        kind: isDir ? ('directory' as const) : ('file' as const),
        label: entry,
        insert: entry.slice(base.length) + (isDir ? '' : ' ')
      }
    })
}
