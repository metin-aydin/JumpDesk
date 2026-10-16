import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/utils'
import { PortalContainerContext } from '@/lib/portal-container'
import { HostSlot } from '@/features/windows/HostSlot'
import { useDetachedWindows } from '@/features/windows/detached-windows'
import { tabHost } from '@/features/windows/tab-hosts'
import { usePreferences } from '@/stores/preferences'
import {
  MAIN_WINDOW,
  activeOfWindow,
  groupOf,
  tabsOfWindow,
  useWorkspace,
  windowIdOf,
  type WorkspaceTab
} from '@/stores/workspace'
import { HomeView } from './HomeView'
import { SessionView } from './SessionView'
import { DragGhost, PaneHeader, TileHandles } from './tiling'
import { pct } from './tile-layout'
import { useTiling } from './use-tiling'

function TabContent({
  tab,
  active,
  visible
}: {
  tab: WorkspaceTab
  active: boolean
  visible: boolean
}): React.JSX.Element {
  if (tab.kind === 'connect') return <HomeView tabId={tab.id} active={active} />
  return <SessionView tab={tab} active={active} visible={visible} />
}

/**
 * Sekme içeriği sekmenin kalıcı kabına çizilir; sekme başka pencereye taşınsa da React ağacındaki yeri aynı kalır ve
 * oturum yeniden oluşturulmaz. Ayrı penceredeki içeriğin menüleri o pencerede açılır.
 */
function TabPortal({
  tab,
  active,
  visible,
  portalContainer
}: {
  tab: WorkspaceTab
  active: boolean
  visible: boolean
  portalContainer?: HTMLElement
}): React.ReactPortal {
  return createPortal(
    <PortalContainerContext.Provider value={portalContainer}>
      <TabContent tab={tab} active={active} visible={visible} />
    </PortalContainerContext.Provider>,
    tabHost(tab.id)
  )
}

/**
 * Tüm pencerelerin sekme içerikleri tek bir anahtarlı listede çizilir: sekme pencereler arasında taşınınca aynı
 * anahtarla kalır, yeniden kurulmaz. Etkin ve görünür olma, sekmenin penceresine göre hesaplanır.
 */
function TabPortals(): React.JSX.Element {
  const state = useWorkspace(
    useShallow((s) => ({
      tabs: s.tabs,
      detached: s.detached,
      groups: s.groups,
      activeId: s.activeId,
      windowActive: s.windowActive
    }))
  )
  const windows = useDetachedWindows((s) => s.windows)
  return (
    <>
      {[...state.tabs, ...state.detached].map((tab) => {
        const windowId = windowIdOf(tab)
        const active = activeOfWindow(state, windowId)
        const group = groupOf(state.groups, active)
        const shown = group?.ids.includes(tab.id)
          ? !group.zoomedId || group.zoomedId === tab.id
          : tab.id === active
        const detachedWindow = windowId === MAIN_WINDOW ? undefined : windows[windowId]
        return (
          <TabPortal
            key={tab.id}
            tab={tab}
            active={tab.id === active}
            visible={shown && (windowId === MAIN_WINDOW || Boolean(detachedWindow))}
            portalContainer={detachedWindow?.win.document.body}
          />
        )
      })}
    </>
  )
}

/**
 * Bir pencerenin çalışma alanı: sekmeleri aynı kapsayıcıda sabit anahtarlarla, mutlak konumla çizilir; tek görünüm ile
 * döşenmiş grup arasında geçişte oturumlar yeniden oluşturulmaz, yalnız konumları değişir.
 */
export function WindowWorkspace({ windowId }: { windowId: string }): React.JSX.Element {
  const tabs = useWorkspace(useShallow((s) => tabsOfWindow(s, windowId)))
  const activeId = useWorkspace((s) => activeOfWindow(s, windowId))
  const group = useWorkspace((s) => groupOf(s.groups, activeOfWindow(s, windowId)))
  const activate = useWorkspace((s) => s.activate)
  const dimInactive = usePreferences((s) => s.dimInactivePanes)
  const containerRef = useRef<HTMLDivElement>(null)
  const { layout, paneDrag, startPaneDrag, startResize } = useTiling(group, containerRef)
  const groupActive = Boolean(group)
  const zoomedId = group ? group.zoomedId : null

  return (
    <div
      ref={containerRef}
      data-workspace
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
    >
      {tabs.map((tab) => {
        const rect = layout?.rects.get(tab.id)
        const inGroupView = groupActive && group!.ids.includes(tab.id)
        const visible = rect ? true : zoomedId ? tab.id === zoomedId : tab.id === activeId
        const focused = tab.id === activeId
        const showHeader = inGroupView && visible
        return (
          <div
            key={tab.id}
            onPointerDownCapture={() => rect && !focused && activate(tab.id)}
            className={cn(
              'absolute flex-col overflow-hidden',
              visible ? 'flex' : 'hidden',
              rect && focused && !paneDrag && 'z-10 ring-1 ring-primary/60',
              rect &&
                !focused &&
                dimInactive &&
                !paneDrag &&
                'opacity-[0.82] transition-opacity hover:opacity-95',
              paneDrag && rect && 'transition-[left,top,width,height] duration-200 ease-out'
            )}
            style={rect ? pct(rect) : { inset: 0 }}
          >
            {showHeader && (
              <PaneHeader
                tab={tab}
                group={group!}
                focused={focused}
                detached={windowId !== MAIN_WINDOW}
                onDragStart={startPaneDrag}
              />
            )}
            <HostSlot
              tabId={tab.id}
              onPointerDownCapture={() => rect && !focused && activate(tab.id)}
            />
            {paneDrag && rect && paneDrag.sourceId === tab.id && (
              <div className="pointer-events-none absolute inset-0 z-30 m-1 rounded-md border-2 border-dashed border-primary/60 bg-background" />
            )}
          </div>
        )
      })}
      {paneDrag && <DragGhost drag={paneDrag} tab={tabs.find((t) => t.id === paneDrag.sourceId)} />}
      <TileHandles layout={layout} onResize={startResize} />
    </div>
  )
}

/** Ana pencerenin çalışma alanı ve tüm pencerelerin oturum içerikleri. */
export function Workspace(): React.JSX.Element {
  return (
    <>
      <WindowWorkspace windowId={MAIN_WINDOW} />
      <TabPortals />
    </>
  )
}
