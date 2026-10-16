import type { Terminal } from '@xterm/xterm'
import type { KokoConnection } from './koko-connection'

export interface TerminalHandle {
  tabId: string
  term: Terminal
  connection: KokoConnection
  /** Metni kullanıcı yazmış gibi uzak kabuğa gönderir. */
  send: (text: string) => void
  /** Komutu çalıştırır (sonuna satır sonu ekler). */
  run: (command: string) => void
  focus: () => void
  /** Terminal içi arama çubuğunu açar; metin verilmezse terminalde seçili metinle başlar. */
  openSearch: (text?: string) => void
  /** Kabuk entegrasyonundan gelen anlık durum; autocomplete okur, render tetiklemez. */
  live: {
    cwd?: string
    entries: string[]
    commandNames: string[]
    promptEnd?: { x: number; y: number }
    /** Kabuk komut bekliyor (istem sonu görüldü, Enter'a henüz basılmadı). */
    atPrompt: boolean
  }
}

const handles = new Map<string, TerminalHandle>()
const listeners = new Set<() => void>()

export const terminalRegistry = {
  set(handle: TerminalHandle): void {
    handles.set(handle.tabId, handle)
    listeners.forEach((l) => l())
  },
  delete(tabId: string): void {
    handles.delete(tabId)
    listeners.forEach((l) => l())
  },
  get(tabId: string): TerminalHandle | undefined {
    return handles.get(tabId)
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
