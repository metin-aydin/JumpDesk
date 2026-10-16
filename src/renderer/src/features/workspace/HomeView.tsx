import { useEffect, useMemo, useState } from 'react'
import { Clock, Star } from 'lucide-react'
import { toItem, type TreeItemData } from '@/features/tree/tree-data'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { useServerMeta } from '@/stores/server-meta'
import { connectToAsset } from './connect'
import { AssetCard } from './AssetCard'
import { FolderBrowser } from './FolderBrowser'
import { QuickConnect } from './QuickConnect'
import { SavedLayouts } from '@/features/layouts/SavedLayouts'

function Section({
  icon: Icon,
  title,
  children
}: {
  icon: typeof Clock
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">{children}</div>
    </section>
  )
}

/**
 * Sunucular ana ekranı ve "Yeni Bağlantı" sekmesi aynı görünümü kullanır; `tabId` verilirse seçilen sunucu o sekmede
 * açılır (sekme oturuma dönüşür), verilmezse yeni sekmede açılır.
 */
export function HomeView({
  tabId,
  active = false
}: {
  tabId?: string
  active?: boolean
}): React.JSX.Element {
  const t = useT()
  const byAsset = useServerMeta((s) => s.byAsset)
  const pick = (item: TreeItemData): void => connectToAsset(item, tabId)
  /** İlk sunucu bu sekmede, diğerleri yeni sekmelerde açılır. */
  const pickMany = (items: TreeItemData[]): void =>
    items.forEach((item, i) => connectToAsset(item, i === 0 ? tabId : undefined))
  const [favorites, setFavorites] = useState<TreeItemData[]>([])

  useEffect(() => {
    void jumpdesk.jms.treeChildren('favorite').then((res) => {
      if (res.ok) setFavorites(res.data.filter((n) => n.meta.type === 'asset').map(toItem))
    })
  }, [])

  const recent = useMemo(
    () =>
      Object.entries(byAsset)
        .filter(([, m]) => m.lastConnectedAt && m.name)
        .sort((a, b) => (b[1].lastConnectedAt ?? 0) - (a[1].lastConnectedAt ?? 0))
        .slice(0, 12)
        .map(([assetId, m]) => ({
          item: {
            id: `recent:${assetId}`,
            kind: 'asset' as const,
            assetId,
            name: m.name!,
            address: m.address,
            platformType: m.platformType
          },
          localIp: m.localIp
        })),
    [byAsset]
  )

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-8 py-8">
        <QuickConnect autoFocus={active} onPick={pick} onPickMany={pickMany} />
        <SavedLayouts />
        {recent.length > 0 && (
          <Section icon={Clock} title={t('Son bağlantılar')}>
            {recent.map(({ item, localIp }) => (
              <AssetCard
                key={item.id}
                item={item}
                onPick={pick}
                subtitle={localIp ? `${localIp} · ${item.address ?? ''}` : undefined}
              />
            ))}
          </Section>
        )}
        <FolderBrowser
          onPick={(items) =>
            items.forEach((item, i) => connectToAsset(item, i === 0 ? tabId : undefined))
          }
        />
        {favorites.length > 0 && (
          <Section icon={Star} title={t('Favoriler')}>
            {favorites.map((item) => (
              <AssetCard key={item.id} item={item} onPick={pick} />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}
