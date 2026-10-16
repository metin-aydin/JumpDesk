import { create } from 'zustand'
import type { ExportBundle, SectionId } from '@/features/transfer/bundle'

/**
 * Dışa ve içe aktarım ekranları. Kapanınca içerik kapanma animasyonu bitene kadar yerinde kalır; her açılış yeni bir
 * `nonce` alır ve ekran baştan kurulur.
 */
interface TransferStore {
  exportOpen: boolean
  /** Dışa aktarım ekranı açılırken seçili gelen bölümler. */
  exportSelection: SectionId[]
  importOpen: boolean
  /** Seçilen ve doğrulanan dosya; içe aktarım ekranı onu gösterir. */
  importing: { bundle: ExportBundle; fileName: string; selection: SectionId[] } | null
  nonce: number
  openExport: (selection: SectionId[]) => void
  closeExport: () => void
  showImport: (bundle: ExportBundle, fileName: string, selection: SectionId[]) => void
  closeImport: () => void
}

export const useTransfer = create<TransferStore>((set) => ({
  exportOpen: false,
  exportSelection: [],
  importOpen: false,
  importing: null,
  nonce: 0,
  openExport: (selection) =>
    set((s) => ({ exportOpen: true, exportSelection: selection, nonce: s.nonce + 1 })),
  closeExport: () => set({ exportOpen: false }),
  showImport: (bundle, fileName, selection) =>
    set((s) => ({
      importOpen: true,
      importing: { bundle, fileName, selection },
      nonce: s.nonce + 1
    })),
  closeImport: () => set({ importOpen: false })
}))
