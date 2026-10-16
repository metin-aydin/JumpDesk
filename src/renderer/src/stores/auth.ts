import { create } from 'zustand'
import type { AuthState } from '@shared/types'
import { jumpdesk } from '@/lib/jumpdesk'
import { setUserScope } from '@/lib/user-storage'
import { useSessionInfo } from './session-info'
import { useWorkspace } from './workspace'

interface AuthStore {
  state: AuthState | null
}

export const useAuth = create<AuthStore>(() => ({ state: null }))

/**
 * Oturum kapanınca açık sekmeler kapatılır; yeniden girişte eski sunuculara kendiliğinden bağlanılmaz. Kullanıcı
 * kayıtları, arayüz yeni durumu çizmeden önce giriş yapan kullanıcınınkilere geçer (çıkışta boşalır).
 */
function apply(state: AuthState): void {
  const wasLoggedIn = useAuth.getState().state?.status === 'logged-in'
  if (wasLoggedIn && state.status !== 'logged-in') {
    useWorkspace.getState().reset()
    useSessionInfo.setState({ byTab: {} })
  }
  setUserScope(state.status === 'logged-in' ? state.scope : null)
  useAuth.setState({ state })
}

void jumpdesk.auth.getState().then(apply)
jumpdesk.auth.onChange(apply)
