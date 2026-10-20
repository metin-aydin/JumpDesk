import { jumpdesk } from '@/lib/jumpdesk'
import { useLanguage } from '@/lib/i18n'
import { useAuth } from '@/stores/auth'
import { countServers, openLayout, useLayouts } from '@/stores/layouts'
import { useWorkspace } from '@/stores/workspace'

/**
 * Sistem tepsisiyle eşitleme: giriş yapmış kullanıcının kayıtlı düzenleri ana sürece bildirilir (tepsi menüsü ve
 * açılır penceresi, pencere kapalıyken de bu listeyi gösterir; dil değişince menü yeniden kurulsun diye yine
 * bildirilir). Tepsiden seçilen düzen yeni sekmede açılır; oturum açık değilse girişten sonra açılır. Pencere
 * kapatılınca uygulama tepside sürer ve açık oturumlar kapatılır.
 */
export function startTraySync(): () => void {
  let pending: string | null = null
  const loggedIn = (): boolean => useAuth.getState().state?.status === 'logged-in'
  const push = (): void =>
    jumpdesk.tray.setLayouts(
      loggedIn()
        ? useLayouts.getState().layouts.map((l) => ({
            id: l.id,
            name: l.name,
            servers: countServers(l.items)
          }))
        : []
    )
  const open = (id: string): void => {
    const layout = useLayouts.getState().layouts.find((l) => l.id === id)
    if (layout) openLayout(layout)
  }

  push()
  const offLayouts = useLayouts.subscribe(push)
  const offLanguage = useLanguage.subscribe(push)
  const offAuth = useAuth.subscribe(() => {
    push()
    if (pending && loggedIn()) {
      const id = pending
      pending = null
      open(id)
    }
  })
  const offOpen = jumpdesk.tray.onOpenLayout((id) => {
    if (loggedIn()) open(id)
    else pending = id
  })
  const offHidden = jumpdesk.app.onHidden(() => useWorkspace.getState().reset())
  return () => {
    offLayouts()
    offLanguage()
    offAuth()
    offOpen()
    offHidden()
  }
}
