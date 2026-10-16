import { create } from 'zustand'

/**
 * Giriş sayfası ayrı bir yerel görünümde (WebContentsView) arayüzün üstünde çizilir; açılır menüler onun arkasında
 * kalmasın diye açık menü sayısı izlenir ve menü açıkken giriş görünümü gizlenir.
 */
interface OverlayStore {
  open: number
  setOpen: (open: boolean) => void
}

export const useOverlay = create<OverlayStore>((set) => ({
  open: 0,
  setOpen: (open) => set((s) => ({ open: Math.max(0, s.open + (open ? 1 : -1)) }))
}))
