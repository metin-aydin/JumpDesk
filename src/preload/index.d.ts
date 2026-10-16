import type { JumpDeskApi } from '@shared/api'

declare global {
  interface Window {
    jumpdesk: JumpDeskApi
  }
}
