import { t } from '@/lib/i18n'
import { useConfirm } from '@/stores/confirm'
import { isGroupDirty, useLayouts } from '@/stores/layouts'
import {
  MAIN_WINDOW,
  findTab,
  groupOf,
  isMainGroup,
  tabsOfWindow,
  useWorkspace,
  windowIdOf
} from '@/stores/workspace'

/**
 * Kaydedilmemiş düzen değişikliği olan grup kapanacak/dağılacaksa kullanıcıya sorulur. Gruplar düzene bağlı değilse ya da
 * değişiklik yoksa sormadan devam edilir.
 */
async function confirmGroups(groupIds: string[]): Promise<boolean> {
  const { groups, tabs, detached } = useWorkspace.getState()
  const layouts = useLayouts.getState().layouts
  const all = [...tabs, ...detached]
  const dirty = groups.filter((g) => groupIds.includes(g.id) && isGroupDirty(g, all, layouts))
  if (!dirty.length) return true
  return useConfirm.getState().ask({
    title: t('Kaydedilmemiş Düzen Değişiklikleri'),
    description: t('Düzende yaptığınız değişiklikler kaybolacaktır. Devam etmek istiyor musunuz?'),
    confirmLabel: t('Devam Et')
  })
}

/** Gruptaki tüm oturumları kapatır. */
export async function closeGroup(groupId: string): Promise<void> {
  if (!(await confirmGroups([groupId]))) return
  const ws = useWorkspace.getState()
  ws.groups.find((g) => g.id === groupId)?.ids.forEach((id) => ws.close(id))
}

/** Grubu dağıtır; oturumlar ayrı sekmelerde kalır. */
export async function ungroupSafely(groupId: string): Promise<void> {
  if (await confirmGroups([groupId])) useWorkspace.getState().ungroup(groupId)
}

export async function closeAllSafely(): Promise<void> {
  const ws = useWorkspace.getState()
  if (await confirmGroups(ws.groups.filter((g) => isMainGroup(ws, g)).map((g) => g.id)))
    useWorkspace.getState().closeAll()
}

/** Verilen sekme dışındaki sekmeleri kapatır (sekme bir gruptaysa o grup korunur). */
export async function closeOthersSafely(tabId: string): Promise<void> {
  const ws = useWorkspace.getState()
  const keep = groupOf(ws.groups, tabId)?.ids ?? [tabId]
  const tab = findTab(ws, tabId)
  const windowTabs = tabsOfWindow(ws, tab ? windowIdOf(tab) : MAIN_WINDOW)
  const others = ws.groups
    .filter(
      (g) =>
        g.ids.some((id) => windowTabs.some((t) => t.id === id)) &&
        !g.ids.some((id) => keep.includes(id))
    )
    .map((g) => g.id)
  if (!(await confirmGroups(others))) return
  const windowId = tab ? windowIdOf(tab) : MAIN_WINDOW
  tabsOfWindow(useWorkspace.getState(), windowId)
    .filter((t) => !keep.includes(t.id))
    .forEach((t) => useWorkspace.getState().close(t.id))
}

/** Grup en az iki panelle yaşar; bir paneli kapatmak/ayırmak grubu dağıtacaksa sorulur. */
export async function confirmLeaveGroup(tabId: string): Promise<boolean> {
  const group = groupOf(useWorkspace.getState().groups, tabId)
  return !group || group.ids.length > 2 || confirmGroups([group.id])
}

export async function closeTabSafely(tabId: string): Promise<void> {
  if (await confirmLeaveGroup(tabId)) useWorkspace.getState().close(tabId)
}

export async function detachSafely(tabId: string): Promise<void> {
  if (!(await confirmLeaveGroup(tabId))) return
  useWorkspace.getState().detachFromGroup(tabId)
  useWorkspace.getState().activate(tabId)
}

/** Ayrı penceredeki tüm oturumları kapatır (düzene bağlı grup değiştiyse sorar). */
export async function closeWindowSafely(windowId: string): Promise<void> {
  const ws = useWorkspace.getState()
  const tabs = tabsOfWindow(ws, windowId)
  const groupIds = ws.groups
    .filter((g) => g.ids.some((id) => tabs.some((t) => t.id === id)))
    .map((g) => g.id)
  if (!(await confirmGroups(groupIds))) return
  tabs.forEach((t) => useWorkspace.getState().close(t.id))
}
