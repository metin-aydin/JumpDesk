import { useState } from 'react'
import { FolderOpen, Loader2, Plug, RefreshCw } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { connectToAsset } from '@/features/workspace/connect'
import { useT } from '@/lib/i18n'
import { ConnectAllSubmenu } from './ConnectAllSubmenu'
import { fetchDirectAssets, type TreeItemData } from './tree-data'

/**
 * Klasör sağ tık menüsü (ağaç ve "Yeni Bağlantı" ekranı): klasörün doğrudan altındaki sunuculara tek grupta bağlanma,
 * isteğe bağlı olarak klasörü açma ve yenileme.
 */
export function FolderContextMenu({
  folderKey,
  onOpen,
  onRefresh,
  children
}: {
  folderKey?: string
  onOpen?: () => void
  onRefresh?: () => void
  children: React.ReactElement
}): React.JSX.Element {
  const t = useT()
  const [assets, setAssets] = useState<TreeItemData[] | null>(null)
  const [failed, setFailed] = useState(false)
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open || folderKey === undefined) return
        setAssets(null)
        setFailed(false)
        fetchDirectAssets(folderKey).then(setAssets, () => setFailed(true))
      }}
    >
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="min-w-56">
        {onOpen && (
          <ContextMenuItem onClick={onOpen}>
            <FolderOpen /> {t('Klasörü Aç')}
          </ContextMenuItem>
        )}
        {failed ? (
          <ContextMenuItem disabled>
            <Plug /> {t('Sunucular Okunamadı')}
          </ContextMenuItem>
        ) : assets === null ? (
          <ContextMenuItem disabled>
            <Loader2 className="animate-spin" /> {t('Klasördeki Sunucular Okunuyor…')}
          </ContextMenuItem>
        ) : assets.length === 0 ? (
          <ContextMenuItem disabled>
            <Plug /> {t('Klasörde Doğrudan Sunucu Yok')}
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              onClick={() => assets.forEach((a) => connectToAsset(a, undefined, true))}
            >
              <Plug /> {t('Klasördeki {n} Sunucuya Bağlan', { n: assets.length })}
            </ContextMenuItem>
            <ConnectAllSubmenu
              label={t('Klasördeki {n} Sunucuya Farklı Bağlan…', { n: assets.length })}
              assets={assets}
              showCount={false}
            />
          </>
        )}
        {onRefresh && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onRefresh}>
              <RefreshCw /> {t('Yenile')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
