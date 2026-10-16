import { create } from 'zustand'

/** Uygulama genelindeki pencereler: komut paleti, klavye kısayolları, ayarlar ve snippet düzenleyici. */
interface DialogStore {
  palette: boolean
  shortcuts: boolean
  settings: boolean
  snippetEditor: boolean
  /** Snippet düzenleyici açılınca seçili gelen snippet. */
  snippetEditorTarget: string | null
  /** Ayarlarda seçili bölüm; pencere kapanıp açılınca korunur. */
  settingsSection: string
  setPalette: (open: boolean) => void
  setShortcuts: (open: boolean) => void
  setSettings: (open: boolean) => void
  /** Ayarları açar; bölüm verilirse o bölüm seçilir. */
  openSettings: (section?: string) => void
  setSettingsSection: (section: string) => void
  setSnippetEditor: (open: boolean) => void
  openSnippetEditor: (snippetId?: string) => void
}

export const useDialogs = create<DialogStore>((set) => ({
  palette: false,
  shortcuts: false,
  settings: false,
  snippetEditor: false,
  snippetEditorTarget: null,
  settingsSection: 'fonts',
  setPalette: (palette) => set({ palette }),
  setShortcuts: (shortcuts) => set({ shortcuts }),
  setSettings: (settings) => set({ settings }),
  openSettings: (section) =>
    set((s) => ({ settings: true, settingsSection: section ?? s.settingsSection })),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setSnippetEditor: (snippetEditor) => set({ snippetEditor }),
  openSnippetEditor: (snippetId) =>
    set({ snippetEditor: true, snippetEditorTarget: snippetId ?? null })
}))
