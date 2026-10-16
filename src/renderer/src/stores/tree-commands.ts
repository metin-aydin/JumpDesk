import { create } from 'zustand'

/** Ağacın dışından (sekme menüsü gibi) ağaca verilen komutlar; ServerTree işleyicileri kaydeder. */
interface TreeCommands {
  reveal: (assetId: string) => Promise<void>
  /** Kenar çubuğundaki aramayı temizleyip ağacı göstermek için artan sayaç. */
  revealNonce: number
  /** Ağacı (kapalıysa) açıp sunucu aramasına odaklanır; Sidebar kaydeder. */
  focusSearch: () => void
}

export const useTreeCommands = create<TreeCommands>(() => ({
  reveal: async () => undefined,
  revealNonce: 0,
  focusSearch: () => undefined
}))
