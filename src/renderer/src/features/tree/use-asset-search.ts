import { useEffect, useState } from 'react'
import { jumpdesk } from '@/lib/jumpdesk'
import { tagsMatch } from '@/lib/tags'
import { useServerMeta } from '@/stores/server-meta'
import { toItem, type TreeItemData } from './tree-data'

interface SearchState {
  results: TreeItemData[]
  loading: boolean
  error?: string
}

const MAX_RESULTS = 200

/** Sunucu adı/adresi JumpServer'da, yerelde saklanan iç IP'ler ise yerel önbellekte aranır. */
export function useAssetSearch(query: string, delay = 180): SearchState {
  const [state, setState] = useState<SearchState>({ results: [], loading: false })

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setState({ results: [], loading: false })
      return
    }
    setState((s) => ({ ...s, loading: true }))
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
      setState({
        results: list.slice(0, MAX_RESULTS),
        loading: false,
        error: res.ok ? undefined : res.error
      })
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, delay])

  return state
}
