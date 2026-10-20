import { useEffect } from 'react'
import { isAppShortcut, isMac, isSettingsShortcut, numberShortcut } from '@/lib/shortcuts'
import { applyNumberShortcut } from '@/features/workspace/number-keys'
import { terminalRegistry } from '@/features/terminal/registry'
import { useTabSearch } from '@/stores/tab-search'
import { useDialogs } from '@/stores/dialogs'
import { closeTabSafely } from '@/features/layouts/guard'
import { MAIN_WINDOW, groupOf, useWorkspace } from '@/stores/workspace'

/** Uygulama kısayolları yakalama aşamasında dinlenir; terminale ulaşmadan işlenir. */
export function useGlobalShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      const ws = useWorkspace.getState()
      const number = numberShortcut(e)
      let handled = true
      if (isAppShortcut(e, 'T')) ws.openConnectTab()
      else if (isAppShortcut(e, 'W')) void closeTabSafely(ws.activeId)
      else if (isAppShortcut(e, 'B')) ws.toggleRightPanel()
      else if (isAppShortcut(e, 'E')) ws.toggleLeftPanel()
      else if (isAppShortcut(e, 'P'))
        useDialogs.getState().setPalette(!useDialogs.getState().palette)
      else if (isAppShortcut(e, 'K'))
        useDialogs.getState().setShortcuts(!useDialogs.getState().shortcuts)
      else if (isSettingsShortcut(e))
        useDialogs.getState().setSettings(!useDialogs.getState().settings)
      else if (isAppShortcut(e, 'S') && terminalRegistry.get(ws.activeId))
        terminalRegistry.get(ws.activeId)!.openSearch()
      else if (isAppShortcut(e, 'Enter') && groupOf(ws.groups, ws.activeId)) ws.toggleZoom()
      else if (
        (isMac ? e.metaKey : e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toUpperCase() === 'A'
      )
        useTabSearch.getState().setOpen(!useTabSearch.getState().open)
      else if (e.ctrlKey && e.key === 'Tab') ws.activateRelative(e.shiftKey ? -1 : 1)
      else if (number) handled = applyNumberShortcut(number, MAIN_WINDOW, ws.activeId)
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled])
}
