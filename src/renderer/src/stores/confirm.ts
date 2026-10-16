import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
}

interface ConfirmStore {
  /** Son istek; pencere kapanırken metni korumak için yanıttan sonra da tutulur. */
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  open: boolean
  /** Onay penceresi açar; kullanıcının seçimiyle çözülür (kapatmak "vazgeç" sayılır). */
  ask: (options: ConfirmOptions) => Promise<boolean>
  answer: (ok: boolean) => void
}

export const useConfirm = create<ConfirmStore>((set, get) => ({
  request: null,
  open: false,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      if (get().open) get().request?.resolve(false)
      set({ request: { ...options, resolve }, open: true })
    }),
  answer: (ok) => {
    const { request, open } = get()
    if (!open) return
    set({ open: false })
    request?.resolve(ok)
  }
}))
