import { useWorkspace, type AssetRef, type SessionExtras } from '@/stores/workspace'

export interface ConnectableAsset {
  assetId?: string
  name: string
  address?: string
  platformType?: string
}

function toRef(asset: ConnectableAsset): AssetRef | null {
  if (!asset.assetId) return null
  return {
    id: asset.assetId,
    name: asset.name,
    address: asset.address,
    platformType: asset.platformType
  }
}

/**
 * Varlık için oturum sekmesi açar. `tabId` verilirse ya da etkin sekme boş bir "Yeni Bağlantı" sekmesiyse o sekme
 * oturuma dönüşür; aksi halde yeni sekme açılır.
 * `chooseAccount` ile hatırlanan hesap yok sayılır ve hesap yeniden seçtirilir.
 */
export function connectToAsset(
  asset: ConnectableAsset,
  tabId?: string,
  chooseAccount = false
): void {
  const ref = toRef(asset)
  if (!ref) return
  const ws = useWorkspace.getState()
  const active = ws.tabs.find((t) => t.id === ws.activeId)
  const target = tabId ?? (active?.kind === 'connect' ? active.id : undefined)
  if (target) ws.replaceWithSession(target, ref, undefined, chooseAccount)
  else ws.openSession(ref, undefined, chooseAccount)
}

/** Varlığın dosya yöneticisini açar; boş "Yeni Bağlantı" sekmesi varsa o kullanılır. */
export function openFileManager(
  asset: ConnectableAsset,
  extras: Omit<SessionExtras, 'view'> = {}
): void {
  const ref = toRef(asset)
  if (!ref) return
  const ws = useWorkspace.getState()
  const active = ws.tabs.find((t) => t.id === ws.activeId)
  const all: SessionExtras = { view: 'files', ...extras }
  if (active?.kind === 'connect') ws.replaceWithSession(active.id, ref, undefined, false, all)
  else ws.openSession(ref, undefined, false, all)
}
