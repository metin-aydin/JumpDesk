import { useEffect, useRef, useState } from 'react'
import { jumpdesk } from '@/lib/jumpdesk'
import { tagsMatch } from '@/lib/tags'
import { useServerMeta } from '@/stores/server-meta'
import { toItem, type TreeItemData } from './tree-data'

export interface SearchState {
  results: TreeItemData[]
  /** Gösterilen sonuçlar yazılan metne ait değil: arama bekliyor ya da sürüyor. */
  loading: boolean
  error?: string
}

/** Tamamlanmış son arama; `query` sonuçların ait olduğu kırpılmış metindir. */
interface Completed {
  query: string
  results: TreeItemData[]
  error?: string
}

const IDLE: Completed = { query: '', results: [] }
const MAX_RESULTS = 200

/** Sunucu adı/adresi JumpServer'da, yerelde saklanan iç IP'ler ise yerel önbellekte aranır. */
export function useAssetSearch(query: string, delay = 180): SearchState {
  const q = query.trim()
  const [done, setDone] = useState<Completed>(IDLE)
  if (!q && done !== IDLE) setDone(IDLE)

  useEffect(() => {
    if (!q) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const res = q.startsWith('#')
        ? { ok: true as const, data: [] }
        : await jumpdesk.jms.treeSearch(q)
      if (cancelled) return
      const seen = new Set<string>()
      const list: TreeItemData[] = []
      const byLocal = Object.entries(useServerMeta.getState().byAsset).filter(
        ([, m]) => m.name && (m.localIp?.includes(q) || tagsMatch(m.tags, q))
      )
      for (const [assetId, m] of byLocal) {
        seen.add(assetId)
        list.push({
          id: `local:${assetId}`,
          kind: 'asset',
          assetId,
          name: m.name!,
          address: m.address,
          platformType: m.platformType
        })
      }
      if (res.ok) {
        for (const node of res.data) {
          if (node.meta.type !== 'asset' || seen.has(node.id)) continue
          seen.add(node.id)
          list.push(toItem(node))
        }
      }
      setDone({
        query: q,
        results: list.slice(0, MAX_RESULTS),
        error: res.ok ? undefined : res.error
      })
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, delay])

  return { results: done.results, loading: done.query !== q, error: done.error }
}

/**
 * Arama kutusunun klavye seçimi: oklar etkin sonucu değiştirir, Enter onu seçer. Yeni sonuçlar gelince ilk sonuç
 * etkin olur. Sonuçlar yazılan metne yetişmemişken basılan Enter, o metnin araması bitince ilk sonucu seçer; metin
 * bu arada değişirse (yazmaya devam, Esc) seçim yapılmaz.
 */
export function useResultKeys(
  query: string,
  search: SearchState,
  onPick: (item: TreeItemData) => void
): {
  active: number
  setActive: (index: number) => void
  move: (delta: number) => void
  enter: () => void
} {
  const { results, loading } = search
  const [selection, setSelection] = useState({ index: 0, results })
  const active = selection.results === results ? selection.index : 0
  const setActive = (index: number): void => setSelection({ index, results })

  const q = query.trim()
  const pendingFor = useRef<string | null>(null)
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  })
  useEffect(() => {
    const want = pendingFor.current
    if (want === null || loading) return
    pendingFor.current = null
    if (want === q && results[0]) pick.current(results[0])
  }, [q, loading, results])

  return {
    active,
    setActive,
    move: (delta) => setActive(Math.max(0, Math.min(active + delta, results.length - 1))),
    enter: () => {
      if (loading) pendingFor.current = q
      else if (results[active]) onPick(results[active])
    }
  }
}
