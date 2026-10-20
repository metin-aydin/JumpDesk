import type { NumberShortcut } from '@/lib/shortcuts'
import { groupOf, topLevelTabs, useWorkspace } from '@/stores/workspace'

/**
 * Numara kısayolunu pencerede uygular: şeritteki sekmeye ya da `tabId`'nin grubundaki panele geçer (büyütülmüş
 * gruptaysa büyütme hedef panele geçer). Sekme bir grupta değilse panel kısayolu işlenmez (false); tuş terminale gider,
 * uzak programlar (irssi, weechat) Alt+rakamı kullanabilir.
 */
export function applyNumberShortcut(
  shortcut: NumberShortcut,
  windowId: string,
  tabId: string
): boolean {
  const ws = useWorkspace.getState()
  const pick = (ids: string[]): string | undefined =>
    shortcut.n === 9 ? ids[ids.length - 1] : ids[shortcut.n - 1]
  if (shortcut.scope === 'tab') {
    const id = pick(topLevelTabs(ws, windowId))
    if (id) ws.activate(id)
    return true
  }
  const group = groupOf(ws.groups, tabId)
  if (!group) return false
  const id = pick(group.ids)
  if (!id) return true
  if (group.zoomedId && group.zoomedId !== id) ws.toggleZoom(id)
  else ws.activate(id)
  return true
}
