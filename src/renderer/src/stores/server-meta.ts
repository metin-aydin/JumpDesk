import { create } from 'zustand'
import type { ServerMeta } from '@shared/types'
import { jumpdesk } from '@/lib/jumpdesk'
import { onUserScope } from '@/lib/user-storage'

interface ServerMetaStore {
  byAsset: Record<string, ServerMeta>
  update: (assetId: string, patch: Partial<ServerMeta>) => Promise<void>
}

export const useServerMeta = create<ServerMetaStore>((set) => ({
  byAsset: {},
  update: async (assetId, patch) => {
    const meta = await jumpdesk.serverMeta.set(assetId, patch)
    set((s) => ({ byAsset: { ...s.byAsset, [assetId]: meta } }))
  }
}))

/** Sunucu bilgileri (etiketler, otomatik komutlar, iç IP) kullanıcıya özeldir; kullanıcı değişince yeniden yüklenir. */
onUserScope(() => {
  useServerMeta.setState({ byAsset: {} })
  void jumpdesk.serverMeta.getAll().then((byAsset) => useServerMeta.setState({ byAsset }))
})
