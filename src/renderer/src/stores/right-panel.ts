import { create } from 'zustand'
import { useWorkspace } from './workspace'

export type RightPanelTab = 'snippets' | 'history' | 'files' | 'alarms' | 'highlights'

interface RightPanelStore {
  tab: RightPanelTab
  setTab: (tab: RightPanelTab) => void
  /** Sağ paneli açıp verilen sekmeye geçer. */
  show: (tab: RightPanelTab) => void
}

export const useRightPanel = create<RightPanelStore>((set) => ({
  tab: 'snippets',
  setTab: (tab) => set({ tab }),
  show: (tab) => {
    set({ tab })
    if (!useWorkspace.getState().rightPanelOpen) useWorkspace.getState().toggleRightPanel()
  }
}))
