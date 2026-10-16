import { create } from 'zustand'
import { isMac } from '@/lib/shortcuts'

interface TabSearchStore {
  open: boolean
  setOpen: (open: boolean) => void
}

/** Sekme arama listesinin açık durumu; kısayol da buradan açar. */
export const useTabSearch = create<TabSearchStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open })
}))

export const TAB_SEARCH_SHORTCUT = isMac ? '⌘⇧A' : 'Ctrl+Shift+A'
