import { create } from 'zustand'
import { t } from '@/lib/i18n'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

export interface Snippet {
  id: string
  name: string
  command: string
  /** Snippet panelinde altında listelendiği başlık (ör. "Web Server"). */
  group: string
}

export type NewSnippet = Omit<Snippet, 'id'>

const KEY = 'snippets'
/** Grubu boş bırakılan snippetin grubu; geçerli dile çevrilerek kaydedilir. */
export const DEFAULT_SNIPPET_GROUP = 'Genel'

/** Kayıttan ya da içe aktarılan dosyadan gelen snippetleri doğrular; bozuk ya da yinelenen kayıtlar atlanır. */
export function sanitizeSnippets(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Snippet[] = []
  for (const s of raw as Partial<Snippet>[]) {
    if (!s || typeof s.id !== 'string' || !s.id || seen.has(s.id)) continue
    if (typeof s.name !== 'string' || !s.name.trim()) continue
    if (typeof s.command !== 'string' || !s.command.trim()) continue
    seen.add(s.id)
    out.push({
      id: s.id,
      name: s.name.trim(),
      command: s.command,
      group:
        typeof s.group === 'string' && s.group.trim() ? s.group.trim() : t(DEFAULT_SNIPPET_GROUP)
    })
  }
  return out
}

function read(): Snippet[] {
  return sanitizeSnippets(readUserJson(KEY))
}

let seq = 0
const newId = (): string => `snippet-${Date.now().toString(36)}-${(seq++).toString(36)}`

interface SnippetStore {
  snippets: Snippet[]
  add: (snippet: NewSnippet) => Snippet
  update: (id: string, patch: Partial<NewSnippet>) => void
  remove: (id: string) => void
  /** Tüm snippetleri verilenlerle değiştirir (içe aktarma). */
  replaceAll: (snippets: Snippet[]) => void
}

export const useSnippets = create<SnippetStore>((set, get) => {
  const commit = (snippets: Snippet[]): void => {
    writeUserJson(KEY, snippets)
    set({ snippets })
  }
  return {
    snippets: read(),
    add: (snippet) => {
      const created = { ...snippet, id: newId() }
      commit([...get().snippets, created])
      return created
    },
    update: (id, patch) =>
      commit(get().snippets.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    remove: (id) => commit(get().snippets.filter((s) => s.id !== id)),
    replaceAll: (snippets) => commit(snippets)
  }
})

onUserScope(() => useSnippets.setState({ snippets: read() }))

export function snippetById(id: string): Snippet | undefined {
  return useSnippets.getState().snippets.find((s) => s.id === id)
}

/** Snippetler gruplarına göre, ilk göründükleri sırayla. */
export function groupSnippets(list: Snippet[]): [string, Snippet[]][] {
  const map = new Map<string, Snippet[]>()
  for (const s of list) map.set(s.group, [...(map.get(s.group) ?? []), s])
  return [...map.entries()]
}
