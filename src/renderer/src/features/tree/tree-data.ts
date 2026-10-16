import type { JmsTreeNode } from '@shared/types'
import { t } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'

export const ROOT_ID = 'root'

export interface TreeItemData {
  id: string
  kind: 'root' | 'node' | 'asset' | 'loading'
  name: string
  /** Düğüm anahtarı (ör. `1:2`) — yalnızca düğümlerde. */
  key?: string
  count?: number
  assetId?: string
  address?: string
  platformType?: string
  comment?: string
  disabled?: boolean
}

const COUNT_SUFFIX = /^(.*) \((\d+)\)$/
const SPECIAL_NAMES: Record<string, string> = { favorite: 'Favoriler', ungrouped: 'Gruplanmamış' }

export const nodeItemId = (key: string): string => `n:${key}`
export const assetItemId = (parentKey: string, assetId: string): string =>
  `a:${parentKey}:${assetId}`

export function toItem(node: JmsTreeNode): TreeItemData {
  if (node.meta.type === 'node') {
    const m = COUNT_SUFFIX.exec(node.name)
    const item: TreeItemData = {
      id: nodeItemId(node.id),
      kind: 'node',
      key: node.id,
      name: m ? m[1] : node.name,
      count: m ? Number(m[2]) : undefined
    }
    const special = SPECIAL_NAMES[node.id]
    /** Favoriler ve Gruplanmamış klasörlerinin adı her okunuşta geçerli dilde döner. */
    if (special) Object.defineProperty(item, 'name', { get: () => t(special), enumerable: true })
    return item
  }
  const [address, ...comment] = (node.title ?? '').split('\n')
  return {
    id: assetItemId(node.pId, node.id),
    kind: 'asset',
    assetId: node.id,
    name: node.name,
    address: node.meta.data.address ?? address,
    comment: comment.join(' ').trim() || undefined,
    platformType: node.meta.data.platform_type ?? node.iconSkin,
    disabled: node.chkDisabled
  }
}

const SPECIAL_ORDER: Record<string, number> = { favorite: 0, ungrouped: 1 }

function sortChildren(items: TreeItemData[]): TreeItemData[] {
  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'node' ? -1 : 1
    const sa = SPECIAL_ORDER[a.key ?? ''] ?? 9
    const sb = SPECIAL_ORDER[b.key ?? ''] ?? 9
    if (sa !== sb) return sa - sb
    return a.name.localeCompare(b.name, 'tr', { numeric: true })
  })
}

/** Klasörün yalnız doğrudan altındaki sunucular (alt klasörlerdekiler hariç); önbellek kullanılmaz. */
export async function fetchDirectAssets(key: string): Promise<TreeItemData[]> {
  const res = await jumpdesk.jms.treeChildren(key)
  if (!res.ok) throw new Error(res.error)
  const assets = res.data.filter((n) => n.meta.type === 'asset' && n.pId === key).map(toItem)
  return sortChildren(assets).filter((a) => !a.disabled)
}

/**
 * JumpServer'ın tembel ağaç uç noktası bir çağrıda birden çok seviye döndürebilir (tek kök varsa kökün
 * çocukları da gelir). Gelen düğümler `pId` ile gruplanır ve sonradan açılan düğümler için önbellekte tutulur.
 */
export class TreeDataSource {
  private items = new Map<string, TreeItemData>([
    [ROOT_ID, { id: ROOT_ID, kind: 'root', name: 'root' }]
  ])
  private prefetched = new Map<string, string[]>()

  /** Çocukları önceden gelmiş (sunucunun açık getirdiği) düğüm mü? */
  hasPrefetched(itemId: string): boolean {
    const key = this.items.get(itemId)?.key
    return key !== undefined && this.prefetched.has(key)
  }

  /** Bir klasörün ve altındaki klasörlerin önbelleğe alınmış çocuklarını unutur (yenileme için). */
  forget(key: string): void {
    for (const k of [...this.prefetched.keys()]) {
      if (k === key || k.startsWith(`${key}:`)) this.prefetched.delete(k)
    }
  }

  /** Klasörün yalnız doğrudan altındaki sunucular (alt klasörlerdekiler hariç); önbellek kullanılmaz. */
  directAssets(key: string): Promise<TreeItemData[]> {
    return fetchDirectAssets(key)
  }

  getItem(id: string): TreeItemData {
    return this.items.get(id) ?? { id, kind: 'loading', name: '…' }
  }

  async getChildren(id: string): Promise<{ id: string; data: TreeItemData }[]> {
    const parentKey = id === ROOT_ID ? '' : this.items.get(id)?.key
    if (parentKey === undefined) return []

    const cached = this.prefetched.get(parentKey)
    if (cached) {
      this.prefetched.delete(parentKey)
      return cached.map((cid) => ({ id: cid, data: this.items.get(cid)! }))
    }

    const res = await jumpdesk.jms.treeChildren(parentKey || undefined)
    if (!res.ok) throw new Error(res.error)

    const groups = new Map<string, TreeItemData[]>()
    for (const raw of res.data) {
      const item = toItem(raw)
      this.items.set(item.id, item)
      const list = groups.get(raw.pId) ?? []
      list.push(item)
      groups.set(raw.pId, list)
    }
    for (const [pid, list] of groups) {
      if (pid !== parentKey)
        this.prefetched.set(
          pid,
          sortChildren(list).map((i) => i.id)
        )
    }
    return sortChildren(groups.get(parentKey) ?? []).map((item) => ({ id: item.id, data: item }))
  }
}
