import { create } from 'zustand'
import { toast } from 'sonner'
import type { UpdateState } from '@shared/update'
import { t } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { useAuth } from './auth'
import { useDialogs } from './dialogs'

interface UpdateStore {
  state: UpdateState | null
}

export const useUpdate = create<UpdateStore>(() => ({ state: null }))

/** Ayarlarda Güncellemeler bölümünü açar ve yeni sürümü indirmeye başlar (kurulamayan sürümde yayın sayfası açılır). */
export function startUpdate(state: UpdateState): void {
  if (!state.installer) {
    if (state.releaseUrl) window.open(state.releaseUrl)
    return
  }
  useDialogs.getState().openSettings('updates')
  void jumpdesk.update.download()
}

let announcedVersion: string | null = null
const loggedIn = (): boolean => useAuth.getState().state?.status === 'logged-in'

/**
 * Ayarlar ekranı kapalıyken bulunan yeni sürüm ve tamamlanan indirme bildirimle duyurulur. Giriş ekranında bulunan
 * sürüm girişten sonra duyurulur.
 */
function announce(prev: UpdateState | null, next: UpdateState): void {
  if (!loggedIn()) return
  const settingsOpen = useDialogs.getState().settings
  if (next.status === 'available' && next.version && next.version !== announcedVersion) {
    announcedVersion = next.version
    if (settingsOpen) return
    toast(t('JumpDesk {version} yayımlandı', { version: next.version }), {
      description: next.installer
        ? t('Yeni sürüm uygulama içinden indirilip kurulabilir.')
        : t('Yeni sürüm yayın sayfasından indirilebilir.'),
      duration: 20_000,
      action: {
        label: next.installer ? t('Güncelle') : t('İndirme Sayfasını Aç'),
        onClick: () => startUpdate(next)
      }
    })
  }
  if (next.status === 'downloaded' && prev?.status === 'downloading' && !settingsOpen) {
    toast.success(t('Güncelleme hazır'), {
      description: t('Kurmak için JumpDesk yeniden başlatılır.'),
      duration: Infinity,
      action: { label: t('Yeniden Başlat'), onClick: () => jumpdesk.update.install() }
    })
  }
}

export async function initUpdate(): Promise<void> {
  jumpdesk.update.onChange((next) => {
    const prev = useUpdate.getState().state
    useUpdate.setState({ state: next })
    announce(prev, next)
  })
  const state = await jumpdesk.update.getState()
  useUpdate.setState({ state })
  announce(null, state)
  useAuth.subscribe((auth, prevAuth) => {
    const current = useUpdate.getState().state
    if (current && auth.state?.status === 'logged-in' && prevAuth.state?.status !== 'logged-in')
      announce(null, current)
  })
}
