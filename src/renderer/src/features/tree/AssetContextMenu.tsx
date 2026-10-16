import { useState } from 'react'
import { Copy, FolderOpen, Plug, Tag } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  connectToAsset,
  openFileManager,
  type ConnectableAsset
} from '@/features/workspace/connect'
import { useT } from '@/lib/i18n'
import { osKind } from '@/lib/os'
import { useServerMeta } from '@/stores/server-meta'
import { ConnectAllSubmenu } from './ConnectAllSubmenu'
import { useTagDialog } from './TagDialog'

export function AssetContextMenu({
  item,
  children,
  resolveTargets
}: {
  item: ConnectableAsset
  children: React.ReactElement
  /** Menü açılırken bağlanılacak sunucuları döndürür (çoklu seçimde seçili olanların hepsi). */
  resolveTargets?: () => ConnectableAsset[]
}): React.JSX.Element {
  const t = useT()
  const localIp = useServerMeta((s) =>
    item.assetId ? s.byAsset[item.assetId]?.localIp : undefined
  )
  const [targets, setTargets] = useState<ConnectableAsset[]>([item])
  const many = targets.length > 1
  const fileTargets = targets.filter((a) => osKind(a.platformType) === 'linux')
  return (
    <ContextMenu onOpenChange={(open) => open && setTargets(resolveTargets?.() ?? [item])}>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onClick={() => targets.forEach((a) => connectToAsset(a, undefined, true))}>
          <Plug /> {many ? t('{n} Sunucuya Bağlan', { n: targets.length }) : t('Bağlan')}
        </ContextMenuItem>
        {many && (
          <ConnectAllSubmenu
            label={t('{n} Sunucuya Farklı Bağlan…', { n: targets.length })}
            assets={targets}
            showCount={false}
          />
        )}
        {fileTargets.length > 0 && (
          <ContextMenuItem onClick={() => fileTargets.forEach((a) => openFileManager(a))}>
            <FolderOpen />{' '}
            {fileTargets.length > 1
              ? t('{n} Sunucuda Dosyaları Aç', { n: fileTargets.length })
              : t('Dosya Yöneticisi')}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => useTagDialog.getState().open(targets)}>
          <Tag />{' '}
          {many ? t('{n} Sunucuyu Etiketle', { n: targets.length }) : t('Etiketleri Düzenle')}
        </ContextMenuItem>
        {!many && <ContextMenuSeparator />}
        {!many && item.address && (
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(item.address!)}>
            <Copy /> {t('Adresi Kopyala')}
          </ContextMenuItem>
        )}
        {!many && localIp && (
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(localIp)}>
            <Copy /> {t("Yerel IP'yi Kopyala")}
          </ContextMenuItem>
        )}
        {!many && (
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(item.name)}>
            <Copy /> {t('Adı Kopyala')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
