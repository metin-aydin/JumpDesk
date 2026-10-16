import { OsBadge } from '@/components/OsBadge'
import { AssetContextMenu } from '@/features/tree/AssetContextMenu'
import type { TreeItemData } from '@/features/tree/tree-data'
import { cn } from '@/lib/utils'
import { CARD_CLASS, SELECTED_CARD_CLASS } from './card-styles'

export interface SelectModifiers {
  ctrl: boolean
  shift: boolean
}

/**
 * Sunucu kartı: çift tık ya da Enter bağlanır. `onSelect` verilirse tıklama seçer (Ctrl/Shift ile çoklu); sağ tık
 * menüsü seçimdeki tüm sunucular için açılır (`resolveTargets`).
 */
export function AssetCard({
  item,
  subtitle,
  onPick,
  selected = false,
  onSelect,
  resolveTargets
}: {
  item: TreeItemData
  subtitle?: string
  onPick: (item: TreeItemData) => void
  selected?: boolean
  onSelect?: (mods: SelectModifiers) => void
  resolveTargets?: () => TreeItemData[]
}): React.JSX.Element {
  return (
    <AssetContextMenu item={item} resolveTargets={resolveTargets}>
      <button
        type="button"
        aria-pressed={onSelect ? selected : undefined}
        onClick={(e) => onSelect?.({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
        data-nav-card
        onDoubleClick={() => onPick(item)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          onPick(item)
        }}
        onContextMenu={() => !selected && onSelect?.({ ctrl: false, shift: false })}
        className={cn(CARD_CLASS, selected && SELECTED_CARD_CLASS)}
      >
        <OsBadge platformType={item.platformType} size="md" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle ?? item.address}
          </span>
        </span>
      </button>
    </AssetContextMenu>
  )
}
