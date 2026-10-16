import { create } from 'zustand'

export type IntegrationStatus = 'off' | 'pending' | 'ready' | 'failed'

export interface SessionInfo {
  cwd?: string
  /** Sunucudaki komut geçmişi; en eski başta, en yeni sonda. */
  history: string[]
  lastHistoryNum?: number
  ips: string[]
  integration: IntegrationStatus
  /** Oturumun bağlantı token'ı; dosya yöneticisi bundan yeni token türetir. */
  tokenId?: string
  protocol?: string
  /** Hesaba tanınan eylemler (connect, upload, download, delete...). */
  actions?: string[]
}

interface SessionInfoStore {
  byTab: Record<string, SessionInfo>
  patch: (tabId: string, patch: Partial<SessionInfo>) => void
  appendCommand: (tabId: string, num: number | undefined, command: string) => void
  remove: (tabId: string) => void
}

const empty = (): SessionInfo => ({ history: [], ips: [], integration: 'off' })
const MAX_HISTORY = 2000

export const useSessionInfo = create<SessionInfoStore>((set) => ({
  byTab: {},
  patch: (tabId, patch) =>
    set((s) => ({ byTab: { ...s.byTab, [tabId]: { ...(s.byTab[tabId] ?? empty()), ...patch } } })),
  appendCommand: (tabId, num, command) =>
    set((s) => {
      const info = s.byTab[tabId] ?? empty()
      if (num !== undefined && info.lastHistoryNum !== undefined && num <= info.lastHistoryNum)
        return s
      const history = [...info.history, command].slice(-MAX_HISTORY)
      return {
        byTab: {
          ...s.byTab,
          [tabId]: { ...info, history, lastHistoryNum: num ?? info.lastHistoryNum }
        }
      }
    }),
  remove: (tabId) =>
    set((s) => {
      const next = { ...s.byTab }
      delete next[tabId]
      return { byTab: next }
    })
}))
