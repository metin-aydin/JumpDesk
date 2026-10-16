import { create } from 'zustand'
import type { WindowState } from '@shared/types'
import { jumpdesk } from '@/lib/jumpdesk'

export const useWindowState = create<WindowState>(() => ({
  maximized: false,
  fullscreen: false,
  focused: true
}))

void jumpdesk.win.getState().then((s) => useWindowState.setState(s))
jumpdesk.win.onStateChange((s) => useWindowState.setState(s))
