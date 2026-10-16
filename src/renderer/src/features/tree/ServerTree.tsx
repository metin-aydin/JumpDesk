import { useEffect, useMemo, useRef, useState } from 'react'
import type { TreeInstance } from '@headless-tree/core'
import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  selectionFeature,
  type ItemInstance
} from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, Folder, FolderOpen, Loader2, Star } from 'lucide-react'
import { jumpdesk } from '@/lib/jumpdesk'
import { toast } from 'sonner'
import { useTreeCommands } from '@/stores/tree-commands'
import { useWorkspace } from '@/stores/workspace'
import { OsBadge } from '@/components/OsBadge'
import { t, useT } from '@/lib/i18n'
import { displayAddress } from '@/lib/os'
import { cn } from '@/lib/utils'
import { useServerMeta } from '@/stores/server-meta'
import { useTreeScale } from '@/stores/font-sizes'
import { AssetContextMenu } from './AssetContextMenu'
import { AssetHoverCard } from './AssetHoverCard'
import { FolderContextMenu } from './FolderContextMenu'
import { ROOT_ID, TreeDataSource, assetItemId, nodeItemId, type TreeItemData } from './tree-data'
import { connectToAsset } from '@/features/workspace/connect'

const ROW_HEIGHT = 28
const INDENT = 14

function NodeIcon({ item }: { item: ItemInstance<TreeItemData> }): React.JSX.Element {
  const data = item.getItemData()
  if (data.key === 'favorite') return <Star className="size-4 text-warning" />
  if (item.isLoading()) return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  const Icon = item.isExpanded() ? FolderOpen : Folder
  return <Icon className="size-4 text-muted-foreground" />
}

/** Seçili sunucular; sağ tıklanan öğe seçimde değilse seçim yalnız o öğe olur. */
function assetTargets(item: ItemInstance<TreeItemData>): TreeItemData[] {
  const tree = item.getTree()
  if (!item.isSelected()) tree.setSelectedItems([item.getId()])
  const selected = item.isSelected() ? tree.getSelectedItems() : [item]
  const seen = new Set<string>()
  return selected
    .map((i) => i.getItemData())
    .filter((d) => d.kind === 'asset' && d.assetId && !seen.has(d.assetId) && seen.add(d.assetId))
}

/** Ağaçta konumu bulunamayan sunucu için bildirim. */
function toastNotInTree(): void {
  toast(t('Sunucu ağaçta bulunamadı'), {
    description: t('Bu sunucu bir klasöre bağlı değil ya da artık yetkiniz yok.')
  })
}

interface RowHover {
  onEnter: (data: TreeItemData, el: HTMLElement) => void
  onLeave: () => void
  refresh: (item: ItemInstance<TreeItemData>) => void
}

function TreeRow({
  item,
  hover
}: {
  item: ItemInstance<TreeItemData>
  hover: RowHover
}): React.JSX.Element {
  const data = item.getItemData()
  const level = item.getItemMeta().level
  const localIp = useServerMeta((s) =>
    data.assetId ? s.byAsset[data.assetId]?.localIp : undefined
  )
  const isNode = data.kind === 'node'
  const shown = isNode ? null : displayAddress(localIp, data.address)

  const row = (
    <div
      {...item.getProps()}
      onDoubleClick={() => {
        if (data.kind === 'asset') connectToAsset(data)
      }}
      onPointerEnter={(e) => data.kind === 'asset' && hover.onEnter(data, e.currentTarget)}
      onPointerLeave={hover.onLeave}
      onPointerDownCapture={hover.onLeave}
      className={cn(
        'group/row flex h-7 items-center gap-1.5 overflow-hidden rounded-md pr-2 text-[13px] text-sidebar-foreground outline-none',
        'hover:bg-sidebar-accent/60',
        item.isSelected() && 'bg-sidebar-accent text-sidebar-accent-foreground',
        item.isFocused() && 'focus-visible:ring-1 focus-visible:ring-sidebar-ring',
        data.disabled && 'opacity-50'
      )}
      style={{ paddingLeft: 6 + level * INDENT }}
    >
      {isNode ? (
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-100',
            item.isExpanded() && 'rotate-90'
          )}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      {isNode ? <NodeIcon item={item} /> : <OsBadge platformType={data.platformType} size="xs" />}
      <span className="min-w-0 flex-1 truncate">{data.name}</span>
      {isNode && data.count !== undefined && (
        <span className="shrink-0 pl-2 text-[11px] text-muted-foreground tabular-nums">
          {data.count}
        </span>
      )}
      {shown && (
        <span
          className={cn(
            'shrink-0 pl-2 text-[11px] whitespace-nowrap tabular-nums',
            shown.local ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}
        >
          {shown.text}
        </span>
      )}
    </div>
  )

  if (data.kind === 'asset') {
    return (
      <AssetContextMenu item={data} resolveTargets={() => assetTargets(item)}>
        {row}
      </AssetContextMenu>
    )
  }
  return (
    <FolderContextMenu folderKey={data.key} onRefresh={() => hover.refresh(item)}>
      {row}
    </FolderContextMenu>
  )
}

export function ServerTree(): React.JSX.Element {
  const t = useT()
  const source = useMemo(() => new TreeDataSource(), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<{ data: TreeItemData; rect: DOMRect } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hover = useMemo<RowHover>(
    () => ({
      onEnter: (data, el) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(
          () => setHovered({ data, rect: el.getBoundingClientRect() }),
          450
        )
      },
      onLeave: () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = null
        setHovered(null)
      },
      refresh: (item) => {
        const tree = treeRef.current
        const key = item.getItemData().key
        if (!tree || key === undefined) return
        source.forget(key)
        const expandedBelow = tree
          .getItems()
          .filter(
            (i) =>
              i.isExpanded() &&
              i.getItemData().key !== undefined &&
              (i.getItemData().key === key || i.getItemData().key!.startsWith(`${key}:`))
          )
        void item.invalidateChildrenIds()
        expandedBelow
          .filter((i) => i.getId() !== item.getId())
          .forEach((i) => void i.invalidateChildrenIds())
      }
    }),
    [source]
  )
  const treeRef = useRef<TreeInstance<TreeItemData> | null>(null)

  const tree = useTree<TreeItemData>({
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind !== 'asset',
    createLoadingItemData: () => ({ id: 'loading', kind: 'loading', name: t('Yükleniyor…') }),
    dataLoader: {
      getItem: (id) => source.getItem(id),
      getChildrenWithData: (id) => source.getChildren(id)
    },
    onLoadedChildren: (_itemId, childIds) => {
      const toExpand = childIds.filter((id) => source.hasPrefetched(id))
      if (toExpand.length) {
        queueMicrotask(() =>
          toExpand.forEach((id) => treeRef.current?.getItemInstance(id)?.expand())
        )
      }
    },
    initialState: { expandedItems: [] },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature]
  })

  treeRef.current = tree
  const items = tree.getItems()
  const scale = useTreeScale()
  const rowHeight = ROW_HEIGHT * scale
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12
  })
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer
  useEffect(() => virtualizerRef.current.measure(), [rowHeight])

  useEffect(() => {
    /** Varlığın klasör anahtarını bulur: detaydaki klasör UUID'lerinden birinin çocuk listesinde varlığın `pId`'si. */
    const findNodeKey = async (assetId: string): Promise<string | null> => {
      const detail = await jumpdesk.jms.assetDetail(assetId)
      if (!detail.ok) return null
      for (const n of detail.data.nodes ?? []) {
        const nodeId = typeof n === 'string' ? n : n.id
        const children = await jumpdesk.jms.treeChildrenById(nodeId)
        const hit = children.ok
          ? children.data.find((c) => c.meta.type === 'asset' && c.id === assetId)
          : undefined
        if (hit?.pId) return hit.pId
      }
      return null
    }

    /** Varlığın klasör yolunu sırayla açar, varlığı seçer, odaklar ve görünür alana kaydırır. */
    const reveal = async (assetId: string): Promise<void> => {
      const key = await findNodeKey(assetId)
      const t = treeRef.current
      if (!key || !t) {
        toastNotInTree()
        return
      }
      useTreeCommands.setState((st) => ({ revealNonce: st.revealNonce + 1 }))
      useWorkspace.getState().setLeftPanelOpen(true)
      const node = { id: assetId, pId: key }
      const parts = node.pId.split(':')
      let parent = ROOT_ID
      for (let i = 1; i <= parts.length; i++) {
        const id = nodeItemId(parts.slice(0, i).join(':'))
        await t.loadChildrenIds(parent)
        const folder = t.getItemInstance(id)
        if (folder && !folder.isExpanded()) folder.expand()
        parent = id
      }
      await t.loadChildrenIds(parent)
      const targetId = assetItemId(node.pId, node.id)
      t.setSelectedItems([targetId])
      setTimeout(() => {
        const current = treeRef.current
        if (!current) return
        const index = current.getItems().findIndex((i) => i.getId() === targetId)
        if (index < 0) return
        current.getItemInstance(targetId)?.setFocused()
        virtualizerRef.current.scrollToIndex(index, { align: 'center' })
        current.updateDomFocus()
      }, 60)
    }
    useTreeCommands.setState({ reveal })
  }, [])

  return (
    <div
      ref={scrollRef}
      onScroll={hover.onLeave}
      className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
    >
      {hovered && <AssetHoverCard item={hovered.data} anchor={hovered.rect} />}
      <div
        {...tree.getContainerProps(t('Sunucular'))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const focused = tree.getFocusedItem()
          if (!focused) return
          const targets = focused.isSelected()
            ? assetTargets(focused)
            : [focused.getItemData()].filter((d) => d.kind === 'asset')
          targets.forEach((d) => connectToAsset(d))
        }}
        className="relative outline-none"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((v) => {
          const item = items[v.index]
          return (
            <div
              key={item.getKey()}
              className="absolute inset-x-0"
              style={{ top: v.start, height: rowHeight }}
            >
              <div style={scale === 1 ? undefined : { zoom: scale }}>
                <TreeRow item={item} hover={hover} />
              </div>
            </div>
          )
        })}
      </div>
      {items.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {t('Sunucular yükleniyor…')}
        </div>
      )}
    </div>
  )
}
