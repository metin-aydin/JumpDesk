import { create } from 'zustand'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

/** Terminalde eşleşen metni renklendiren kural; renk `null` ise o renk değiştirilmez (şeffaf). */
export interface HighlightRule {
  id: string
  pattern: string
  regex: boolean
  caseSensitive: boolean
  enabled: boolean
  /** Yazı rengi, `#rrggbb`. */
  fg: string | null
  /** Arka plan rengi, `#rrggbb`. */
  bg: string | null
}

export type NewHighlightRule = Omit<HighlightRule, 'id' | 'enabled'>

const KEY = 'highlightRules'

export const HEX_COLOR = /^#[0-9a-f]{6}$/i

const validColor = (c: unknown): string | null =>
  typeof c === 'string' && HEX_COLOR.test(c) ? c.toLowerCase() : null

/** Kayıttan ya da içe aktarılan dosyadan gelen kuralları doğrular; bozuk kayıtlar atlanır. */
export function sanitizeHighlights(raw: unknown): HighlightRule[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (r): r is HighlightRule =>
        Boolean(r) && typeof r.id === 'string' && typeof r.pattern === 'string' && r.pattern !== ''
    )
    .map((r) => ({
      id: r.id,
      pattern: r.pattern,
      regex: r.regex === true,
      caseSensitive: r.caseSensitive === true,
      enabled: r.enabled !== false,
      fg: validColor(r.fg),
      bg: validColor(r.bg)
    }))
}

function read(): HighlightRule[] {
  return sanitizeHighlights(readUserJson(KEY))
}

function save(rules: HighlightRule[]): void {
  writeUserJson(KEY, rules)
}

interface HighlightStore {
  rules: HighlightRule[]
  add: (rule: NewHighlightRule) => void
  update: (id: string, patch: Partial<Omit<HighlightRule, 'id'>>) => void
  remove: (id: string) => void
  /** Tüm kuralları verilenlerle değiştirir (içe aktarma). */
  replaceAll: (rules: HighlightRule[]) => void
}

let seq = 0
const newId = (): string => `hl-${Date.now().toString(36)}-${(seq++).toString(36)}`

export const useHighlights = create<HighlightStore>((set, get) => ({
  rules: read(),
  add: (rule) => {
    const rules = [...get().rules, { ...rule, id: newId(), enabled: true }]
    save(rules)
    set({ rules })
  },
  update: (id, patch) => {
    const rules = get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
    save(rules)
    set({ rules })
  },
  remove: (id) => {
    const rules = get().rules.filter((r) => r.id !== id)
    save(rules)
    set({ rules })
  },
  replaceAll: (rules) => {
    save(rules)
    set({ rules })
  }
}))

onUserScope(() => useHighlights.setState({ rules: read() }))

/** Tüm eşleşmeleri bulan düzenli ifade; geçersiz ifade ya da boş desen null döner. */
export function compileHighlight(
  rule: Pick<HighlightRule, 'pattern' | 'regex' | 'caseSensitive'>
): RegExp | null {
  if (!rule.pattern) return null
  try {
    const source = rule.regex ? rule.pattern : rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(source, rule.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}
