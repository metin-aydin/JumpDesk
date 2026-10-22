import { create } from 'zustand'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

export interface AlarmRule {
  id: string
  /** Aranan kelime ya da düzenli ifade. */
  pattern: string
  regex: boolean
  caseSensitive: boolean
  enabled: boolean
}

export interface AlarmEvent {
  id: string
  tabId: string
  /** Olay anındaki sekme başlığı (sunucu adı). */
  source: string
  ruleId: string
  pattern: string
  /** İlk eşleşen satır. */
  line: string
  /** İlk eşleşmeden hemen önce gelen satırlar (yapay zekaya açıklatmak için bağlam). */
  context?: string[]
  /** Aynı sekmede aynı kurala kısa aralıklarla gelen eşleşmeler tek olayda sayılır. */
  count: number
  firstAt: number
  lastAt: number
  /** Kullanıcı olayın geldiği oturuma odaklandı ya da Alarmlar sekmesini açtı. */
  read: boolean
}

const unreadOf = (events: AlarmEvent[]): number => events.filter((e) => !e.read).length

const RULES_KEY = 'alarmRules'
const MAX_EVENTS = 500
/** Bu süre içinde aynı sekme + kural için gelen eşleşmeler (ör. bir yığın izinin satırları) birleştirilir. */
export const MERGE_WINDOW_MS = 3000

const DEFAULT_RULES: AlarmRule[] = [
  {
    id: 'default-exception',
    pattern: 'Exception',
    regex: false,
    caseSensitive: true,
    enabled: true
  },
  {
    id: 'default-oom',
    pattern: 'OutOfMemoryError',
    regex: false,
    caseSensitive: true,
    enabled: true
  }
]

function readRules(): AlarmRule[] {
  const parsed = readUserJson<AlarmRule[]>(RULES_KEY)
  return Array.isArray(parsed) ? parsed : DEFAULT_RULES
}

function saveRules(rules: AlarmRule[]): void {
  writeUserJson(RULES_KEY, rules)
}

interface AlarmStore {
  rules: AlarmRule[]
  events: AlarmEvent[]
  /** Okunmamış olay sayısı; Alarmlar sekmesi açılınca sıfırlanır, bir oturuma odaklanınca o oturumunkiler düşer. */
  unread: number
  addRule: (rule: Omit<AlarmRule, 'id' | 'enabled'>) => void
  updateRule: (id: string, patch: Partial<AlarmRule>) => void
  removeRule: (id: string) => void
  /** Tüm kuralları verilenlerle değiştirir (içe aktarma). */
  replaceRules: (rules: AlarmRule[]) => void
  /** Eşleşmeyi kaydeder; yeni olaysa true döner (bildirim için), birleştirildiyse false. */
  record: (
    tabId: string,
    source: string,
    rule: AlarmRule,
    line: string,
    context?: string[]
  ) => boolean
  clearEvents: () => void
  markRead: () => void
  /** Bir oturumun olaylarını okundu sayar (kullanıcı o oturuma odaklandı). */
  markTabRead: (tabId: string) => void
}

let seq = 0
const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

export const useAlarms = create<AlarmStore>((set, get) => ({
  rules: readRules(),
  events: [],
  unread: 0,

  addRule: (rule) => {
    const rules = [...get().rules, { ...rule, id: newId('rule'), enabled: true }]
    saveRules(rules)
    set({ rules })
  },

  updateRule: (id, patch) => {
    const rules = get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
    saveRules(rules)
    set({ rules })
  },

  removeRule: (id) => {
    const rules = get().rules.filter((r) => r.id !== id)
    saveRules(rules)
    set({ rules })
  },

  replaceRules: (rules) => {
    saveRules(rules)
    set({ rules })
  },

  record: (tabId, source, rule, line, context) => {
    const now = Date.now()
    const events = get().events
    const recent = events.find(
      (e) => e.tabId === tabId && e.ruleId === rule.id && now - e.lastAt < MERGE_WINDOW_MS
    )
    if (recent) {
      const next = events.map((e) =>
        e === recent ? { ...e, count: e.count + 1, lastAt: now, read: false } : e
      )
      set({ events: next, unread: unreadOf(next) })
      return false
    }
    const event: AlarmEvent = {
      id: newId('alarm'),
      tabId,
      source,
      ruleId: rule.id,
      pattern: rule.pattern,
      line: line.length > 400 ? `${line.slice(0, 400)}…` : line,
      context: context?.map((l) => l.slice(0, 400)),
      count: 1,
      firstAt: now,
      lastAt: now,
      read: false
    }
    const next = [event, ...events].slice(0, MAX_EVENTS)
    set({ events: next, unread: unreadOf(next) })
    return true
  },

  clearEvents: () => set({ events: [], unread: 0 }),
  markRead: () => {
    if (get().unread === 0) return
    set({ events: get().events.map((e) => (e.read ? e : { ...e, read: true })), unread: 0 })
  },
  markTabRead: (tabId) => {
    const events = get().events
    if (!events.some((e) => e.tabId === tabId && !e.read)) return
    const next = events.map((e) => (e.tabId === tabId && !e.read ? { ...e, read: true } : e))
    set({ events: next, unread: unreadOf(next) })
  }
}))

/** Kullanıcı değişince kuralları yeniden yüklenir; önceki kullanıcının olayları gösterilmez. */
onUserScope(() => useAlarms.setState({ rules: readRules(), events: [], unread: 0 }))

/** Kural düzenli ifadeye çevrilir; geçersiz ifade null döner. */
export function compileRule(rule: AlarmRule): RegExp | null {
  try {
    const source = rule.regex ? rule.pattern : rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return source ? new RegExp(source, rule.caseSensitive ? '' : 'i') : null
  } catch {
    return null
  }
}
