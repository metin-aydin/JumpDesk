import type { DragPreviewPayload } from '@shared/api'
import { previewRegistry } from '@/features/workspace/preview-registry'
import { jumpdesk } from '@/lib/jumpdesk'
import { findTab, groupOf, tabTitle, useWorkspace, type WorkspaceTab } from '@/stores/workspace'

const TITLEBAR_HEIGHT = 40

const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * Sürüklenen sekmenin (ya da grubun) pencere önizlemesi: oturumların anlık görüntüsü, açılacak pencerenin boyutu
 * (ekran pikseli) ve temanın renkleri.
 */
export function buildDragPreview(tabId: string): DragPreviewPayload | null {
  const ws = useWorkspace.getState()
  const group = groupOf(ws.groups, tabId)
  const tabs = (group ? group.ids : [tabId])
    .map((id) => findTab(ws, id))
    .filter((t): t is WorkspaceTab => Boolean(t))
  if (!tabs.length) return null
  const zoom = jumpdesk.ui.getZoom()
  const area = document.querySelector('[data-workspace]')?.getBoundingClientRect()
  const panes = tabs.map((tab) => {
    const shot = previewRegistry.capture(tab.id)
    return {
      title: tabTitle(tab),
      html: shot?.kind === 'html' ? shot.html : undefined,
      background: shot?.kind === 'html' ? shot.background : undefined,
      image: shot?.kind === 'image' ? shot.src : undefined
    }
  })
  return {
    title: group ? (group.name ?? tabs.map((tab) => tabTitle(tab)).join(', ')) : tabTitle(tabs[0]),
    count: group ? tabs.length : undefined,
    width: Math.round(Math.max(640, area?.width ?? 960) * zoom),
    height: Math.round(Math.max(420, (area?.height ?? 600) + TITLEBAR_HEIGHT) * zoom),
    mode: group?.mode,
    panes,
    colors: {
      titlebar: cssVar('--titlebar'),
      titlebarForeground: cssVar('--titlebar-foreground'),
      background: cssVar('--background'),
      foreground: cssVar('--foreground'),
      border: cssVar('--border'),
      tab: cssVar('--tab-active'),
      primary: cssVar('--primary')
    }
  }
}
