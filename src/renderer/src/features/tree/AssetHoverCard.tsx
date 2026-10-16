import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AssetDetail } from '@shared/types'
import { OsBadge } from '@/components/OsBadge'
import { TagChip } from '@/components/TagChip'
import { currentLocale, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { usePortalContainer } from '@/lib/portal-container'
import { useServerMeta } from '@/stores/server-meta'
import type { TreeItemData } from './tree-data'

const CARD_WIDTH = 300
const detailCache = new Map<string, Promise<AssetDetail | null>>()

function loadDetail(assetId: string): Promise<AssetDetail | null> {
  let p = detailCache.get(assetId)
  if (!p) {
    p = jumpdesk.jms.assetDetail(assetId).then((res) => (res.ok ? res.data : null))
    detailCache.set(assetId, p)
    void p.then((d) => d === null && detailCache.delete(assetId))
  }
  return p
}

const formatDate = (time: number): string =>
  new Intl.DateTimeFormat(currentLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(time)

function Row({
  label,
  value
}: {
  label: string
  value?: React.ReactNode
}): React.JSX.Element | null {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all text-popover-foreground">{value}</span>
    </div>
  )
}

/**
 * Sunucunun üzerine gelince açılan bilgi kartı: ağaçta satırın sağında, panel başlığında başlığın altında. Kart,
 * öğenin bulunduğu pencereye (ayrı pencere dahil) çizilir.
 */
export function AssetHoverCard({
  item,
  anchor,
  placement = 'right'
}: {
  item: TreeItemData
  anchor: DOMRect
  placement?: 'right' | 'below'
}): React.JSX.Element {
  const t = useT()
  const container = usePortalContainer() ?? document.body
  const view = container.ownerDocument.defaultView ?? window
  const meta = useServerMeta((s) => (item.assetId ? s.byAsset[item.assetId] : undefined))
  const [detail, setDetail] = useState<AssetDetail | null | undefined>(undefined)

  useEffect(() => {
    if (!item.assetId) return
    let cancelled = false
    void loadDetail(item.assetId).then((d) => !cancelled && setDetail(d))
    return () => {
      cancelled = true
    }
  }, [item.assetId])

  const left =
    placement === 'right'
      ? Math.min(anchor.right + 8, view.innerWidth - CARD_WIDTH - 8)
      : Math.max(8, Math.min(anchor.left, view.innerWidth - CARD_WIDTH - 8))
  const top =
    placement === 'right'
      ? Math.max(8, Math.min(anchor.top - 6, view.innerHeight - 260))
      : Math.max(8, Math.min(anchor.bottom + 6, view.innerHeight - 260))
  const accounts = detail?.permed_accounts.map((a) => a.name).join(', ')
  const protocols = detail?.permed_protocols.map((p) => p.name.toUpperCase()).join(' · ')

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] rounded-lg border bg-popover p-3 shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left, top, width: CARD_WIDTH }}
    >
      <div className="mb-2.5 flex items-start gap-2.5">
        <OsBadge platformType={item.platformType} size="md" />
        <div className="min-w-0">
          <div className="text-[13px] leading-snug font-medium break-all text-popover-foreground">
            {item.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {detail?.platform.name ?? item.platformType}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Row
          label={t('Etiketler')}
          value={
            meta?.tags?.length ? (
              <span className="flex flex-wrap gap-1">
                {meta.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </span>
            ) : undefined
          }
        />
        <Row label={t('İç IP')} value={meta?.localIp} />
        <Row label={t('Adres')} value={item.address} />
        <Row label={t('Protokoller')} value={detail === undefined ? '…' : protocols} />
        <Row label={t('Hesaplar')} value={detail === undefined ? '…' : accounts} />
        <Row
          label={t('Son bağlantı')}
          value={meta?.lastConnectedAt ? formatDate(meta.lastConnectedAt) : undefined}
        />
        <Row label={t('Açıklama')} value={item.comment ?? detail?.comment} />
      </div>
    </div>,
    container
  )
}
