import type { TrayLayout } from './api'

/**
 * Tepsi açılır penceresinin (ayrı önyükleme, `tray.html`) kanalları ve türleri. Ana pencerenin önyüklemesiyle ortak
 * çalışma zamanı kodu paylaşmaz: iki önyükleme ortak bir modülü içe aktarırsa paketleyici onu ayrı dosyaya böler ve
 * korumalı (sandbox) önyükleme başka dosya yükleyemez.
 */
export const TRAY_POPUP_IPC = {
  init: 'tray-popup:init',
  state: 'tray-popup:state',
  choose: 'tray-popup:choose',
  showApp: 'tray-popup:show-app',
  height: 'tray-popup:height',
  close: 'tray-popup:close'
} as const

/** Tepsi açılır penceresinin durumu (her açılışta ana süreçten gelir). */
export interface TrayPopupState {
  folders: string[]
  layouts: TrayLayout[]
  language: 'en' | 'tr'
  dark: boolean
}

/** Tepsi açılır penceresinin önyüklemesi (`window.jumpdeskTray`). */
export interface TrayPopupApi {
  initial: TrayPopupState
  onState(cb: (state: TrayPopupState) => void): () => void
  choose(layoutId: string): void
  showApp(): void
  /** İçeriğin yüksekliği; pencere buna göre boyutlanır. */
  setHeight(height: number): void
  close(): void
}
