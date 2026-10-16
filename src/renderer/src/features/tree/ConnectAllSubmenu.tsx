import { Columns2, Grid2x2, LayoutGrid, Loader2, Rows2 } from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import type { ConnectableAsset } from '@/features/workspace/connect'
import { useT } from '@/lib/i18n'
import { useWorkspace, type TileMode } from '@/stores/workspace'

const OPEN_MODES: { mode: TileMode; label: string; Icon: typeof Columns2 }[] = [
  { mode: 'vertical', label: 'Tümünü Yan Yana Açarak Bağlan', Icon: Columns2 },
  { mode: 'horizontal', label: 'Tümünü Alt Alta Açarak Bağlan', Icon: Rows2 },
  { mode: 'grid', label: 'Tümünü Izgara Şeklinde Açarak Bağlan', Icon: Grid2x2 }
]

/**
 * Sağ tık menüsünde alt menü: verilen sunucuların hepsine bağlanıp tek bir döşenmiş grupta (yan yana, alt alta ya
 * da ızgara) açar. `assets` null iken liste yükleniyor demektir.
 */
export function ConnectAllSubmenu({
  label,
  assets,
  failed,
  showCount = true
}: {
  label: string
  assets: ConnectableAsset[] | null
  failed?: boolean
  /** Başlığın sağında sunucu sayısı gösterilir (sayı başlıkta yazmıyorsa). */
  showCount?: boolean
}): React.JSX.Element {
  const t = useT()
  const connect = (mode: TileMode): void => {
    const refs = (assets ?? [])
      .filter((a) => a.assetId)
      .map((a) => ({
        id: a.assetId!,
        name: a.name,
        address: a.address,
        platformType: a.platformType
      }))
    if (refs.length) useWorkspace.getState().openGroup(refs, mode)
  }
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={assets !== null && assets.length === 0}>
        <LayoutGrid /> {label}
        {showCount && (
          <span className="ml-auto pl-3 text-[11px] text-muted-foreground tabular-nums">
            {failed ? (
              '!'
            ) : assets === null ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              assets.length
            )}
          </span>
        )}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-64">
        {assets === null ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t('Sunucular okunuyor…')}
          </div>
        ) : (
          OPEN_MODES.map(({ mode, label: text, Icon }) => (
            <ContextMenuItem
              key={mode}
              disabled={assets.length === 0}
              onClick={() => connect(mode)}
            >
              <Icon /> {t(text)}
            </ContextMenuItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
