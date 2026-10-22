import { create } from 'zustand'

/** Yapay zekaya açıklatılacak terminal metni: seçili çıktı ya da alarm satırı (öncesindeki satırlarla). */
export interface ExplainTarget {
  subject: 'output' | 'alarm'
  text: string
  /** Alarm satırından önceki satırlar. */
  context?: string
  /** Metnin geldiği oturum; önerilen komutlar bu oturumun komut satırına yazılır. */
  tabId?: string
  /** Pencerede gösterilen kaynak (sunucu adı). */
  source?: string
}

interface AiExplainStore {
  target: ExplainTarget | null
  /** Onay penceresini açar; metin kullanıcı "Gönder"e basmadan gönderilmez. */
  open: (target: ExplainTarget) => void
  close: () => void
}

export const useAiExplain = create<AiExplainStore>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null })
}))
