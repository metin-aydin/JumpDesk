import { terminalRegistry } from '@/features/terminal/registry'
import { focusDetached } from '@/features/windows/detached-windows'
import { spotlight, stopAlarmFlash } from '@/stores/spotlight'
import { useWorkspace } from '@/stores/workspace'

/**
 * Alarmın geldiği oturuma geçer, gruptaki diğer panelleri kısa süre soluklaştırır ve terminalde alarm satırını aratır. Alarmlar panelindeki olay
 * ve masaüstü bildirimi tıklanınca kullanılır.
 */
export function revealAlarm(tabId: string, line?: string): void {
  const search = (): void => {
    if (line) terminalRegistry.get(tabId)?.openSearch(line.slice(0, 120))
  }
  // Alarma gidilen oturumun çerçevesi yanıp sönmez; yalnız diğer paneller soluklaşır.
  stopAlarmFlash(tabId)
  const ws = useWorkspace.getState()
  if (!ws.tabs.some((t) => t.id === tabId)) {
    if (!focusDetached(tabId)) return
    spotlight(tabId)
    search()
    return
  }
  ws.activate(tabId)
  spotlight(tabId)
  requestAnimationFrame(search)
}
