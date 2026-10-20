import type { JumpDeskApi } from '@shared/api'
import type { TrayPopupApi } from '@shared/tray-popup'

declare global {
  interface Window {
    jumpdesk: JumpDeskApi
    /** Yalnız tepsi açılır penceresinde (`tray.html`) tanımlıdır. */
    jumpdeskTray?: TrayPopupApi
  }
}
