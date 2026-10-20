import { create } from 'zustand'
import { toast } from 'sonner'
import { DETACHED_PREFIX } from '@shared/api'
import { closeTabSafely, confirmLeaveGroup } from '@/features/layouts/guard'
import { terminalRegistry } from '@/features/terminal/registry'
import { t, useLanguage } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { isAppShortcut, numberShortcut } from '@/lib/shortcuts'
import { applyNumberShortcut } from '@/features/workspace/number-keys'
import { useAlarms } from '@/stores/alarms'
import {
  MAIN_WINDOW,
  activeOfWindow,
  groupOf,
  tabTitle,
  tabsOfWindow,
  useWorkspace,
  windowIdOf
} from '@/stores/workspace'
import { parkTabHost } from './tab-hosts'

/**
 * Ayrı sekme pencereleri ana pencereden `window.open('')` ile açılır ve ana pencerenin JavaScript bağlamını paylaşır.
 * Oturum ana pencerede yaşamaya devam eder; React içeriği portal ile bu pencerenin belgesine çizilir. Her ayrı
 * pencerenin ana pencere gibi kendi sekmeleri vardır (pencere kimliği: `windowIdOf`). Yönetici çalışma alanındaki
 * `detached` listesini izler: pencerenin ilk sekmesi listeye girince açılır, son sekmesi çıkınca kapanır.
 */
export interface DetachedEntry {
  name: string
  win: Window
  /** Pencere içeriğinin (başlık çubuğu + oturumlar) çizildiği kap. */
  root: HTMLElement
}

interface DetachedWindowsStore {
  /** Pencere kimliğine göre açık ayrı pencereler. */
  windows: Record<string, DetachedEntry>
}

export const useDetachedWindows = create<DetachedWindowsStore>(() => ({ windows: {} }))

interface OpenWindow extends DetachedEntry {
  /** Pencereyi biz kapatıyoruz; kapanış olayı oturumları geri almaz. */
  closing: boolean
  dispose: () => void
}

const open = new Map<string, OpenWindow>()
/** Pencerelerin son odaklanma zamanı; üst üste binen pencerelerde üstteki bundan tahmin edilir. */
const focusedAt = new Map<string, number>()
window.addEventListener('focus', () => focusedAt.set(MAIN_WINDOW, Date.now()))

/** Ana belgedeki stiller ve kök öğe öznitelikleri (tema sınıfı, renk şeması) ayrı pencereye kopyalanır, izlenir. */
function mirrorDocument(win: Window): () => void {
  const doc = win.document
  doc.documentElement.lang = document.documentElement.lang
  const meta = doc.createElement('meta')
  meta.setAttribute('charset', 'utf-8')
  doc.head.appendChild(meta)
  const base = doc.createElement('base')
  base.href = document.baseURI
  doc.head.appendChild(base)

  const clones = new Map<Node, HTMLElement>()
  const syncStyles = (): void => {
    const sources = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    for (const [source, clone] of clones) {
      if (!sources.includes(source as Element)) {
        clone.remove()
        clones.delete(source)
      }
    }
    for (const source of sources) {
      const existing = clones.get(source)
      if (existing && existing.textContent === source.textContent) continue
      const clone = source.cloneNode(true) as HTMLElement
      if (existing) existing.replaceWith(clone)
      else doc.head.appendChild(clone)
      clones.set(source, clone)
    }
  }
  const syncRoot = (): void => {
    const from = document.documentElement
    const to = doc.documentElement
    to.className = from.className
    to.lang = from.lang
    to.style.cssText = from.style.cssText
    doc.body.className = document.body.className
  }
  syncStyles()
  syncRoot()
  const styleObserver = new MutationObserver(syncStyles)
  styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
  const rootObserver = new MutationObserver(syncRoot)
  rootObserver.observe(document.documentElement, { attributes: true })
  return () => {
    styleObserver.disconnect()
    rootObserver.disconnect()
  }
}

/** Penceredeki odaklı oturum: etkin sekme (grupta odaklı panel). */
const focusedTabOf = (windowId: string): string | undefined =>
  activeOfWindow(useWorkspace.getState(), windowId) || undefined

function onFocus(windowId: string, win: Window): void {
  focusedAt.set(windowId, Date.now())
  const tabId = focusedTabOf(windowId)
  if (!tabId) return
  const ws = useWorkspace.getState()
  const tab = ws.detached.find((t) => t.id === tabId)
  if (tab?.alarm || tab?.activity) ws.updateTab(tabId, { alarm: false, activity: false })
  useAlarms.getState().markTabRead(tabId)
  jumpdesk.notify.clear(tabId)
  const active = win.document.activeElement
  if (!active || active === win.document.body) terminalRegistry.get(tabId)?.focus()
}

/**
 * Ayrı pencerede o pencerenin oturumlarına ait kısayollar: kapat, terminalde ara, paneli büyüt, Ctrl+Tab ile
 * pencerenin sekmeleri arasında gezin, Ctrl+1…9 ile şeritteki sekmeye, Alt+1…9 ile gruptaki panele geçiş.
 */
function onKey(e: KeyboardEvent, windowId: string): void {
  const tabId = focusedTabOf(windowId)
  if (!tabId) return
  const ws = useWorkspace.getState()
  const number = numberShortcut(e)
  let handled = true
  if (isAppShortcut(e, 'W')) void closeTabSafely(tabId)
  else if (isAppShortcut(e, 'S')) terminalRegistry.get(tabId)?.openSearch()
  else if (isAppShortcut(e, 'Enter') && groupOf(ws.groups, tabId)) ws.toggleZoom(tabId)
  else if (e.ctrlKey && e.key === 'Tab') {
    const tabs = tabsOfWindow(ws, windowId)
    const i = tabs.findIndex((t) => t.id === tabId)
    const next = tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]
    if (next) ws.activate(next.id)
  } else if (number) handled = applyNumberShortcut(number, windowId, tabId)
  else handled = false
  if (handled) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** Pencere başlığı: etkin grubun adı ya da etkin sekmenin adı. */
function windowTitle(windowId: string): string {
  const ws = useWorkspace.getState()
  const active = activeOfWindow(ws, windowId)
  const group = groupOf(ws.groups, active)
  const tab = tabsOfWindow(ws, windowId).find((t) => t.id === active)
  return `${group?.name ?? (tab ? tabTitle(tab) : 'JumpDesk')} — JumpDesk`
}

/** Açık ayrı pencerelerin başlıklarını geçerli sekmeye ve dile göre yeniler. */
function refreshTitles(): void {
  for (const [windowId, entry] of open) {
    const title = windowTitle(windowId)
    if (entry.win.document.title !== title) entry.win.document.title = title
  }
}

function openFor(windowId: string): void {
  const name = `${DETACHED_PREFIX}${windowId}`
  const zoom = jumpdesk.ui.getZoom()
  const area = document.querySelector('[data-workspace]')?.getBoundingClientRect()
  const width = Math.round(Math.max(640, area?.width ?? 960) * zoom)
  const height = Math.round(Math.max(420, (area?.height ?? 600) + 40) * zoom)
  const left = Math.round(window.screenX + 60)
  const top = Math.round(window.screenY + 60)
  const win = window.open('', name, `width=${width},height=${height},left=${left},top=${top}`)
  if (!win) {
    toast.error(t('Yeni pencere açılamadı'))
    useWorkspace.getState().attachWindow(windowId)
    return
  }
  win.document.title = windowTitle(windowId)
  const stopMirror = mirrorDocument(win)
  const root = win.document.createElement('div')
  root.className = 'flex h-full flex-col'
  win.document.body.appendChild(root)

  const onHide = (): void => {
    const entry = open.get(windowId)
    if (!entry || entry.closing) return
    // Pencere sistemden (ör. Alt+F4) kapatıldı: oturumlar kaybolmaz, ana pencereye geri alınır.
    entry.closing = true
    parkLeaving(entry, new Set())
    useWorkspace.getState().attachWindow(windowId)
  }
  const focus = (): void => onFocus(windowId, win)
  const key = (e: KeyboardEvent): void => onKey(e, windowId)
  win.addEventListener('pagehide', onHide)
  win.addEventListener('focus', focus)
  win.addEventListener('keydown', key, true)

  focusedAt.set(windowId, Date.now())
  open.set(windowId, {
    name,
    win,
    root,
    closing: false,
    dispose: () => {
      win.removeEventListener('pagehide', onHide)
      win.removeEventListener('focus', focus)
      win.removeEventListener('keydown', key, true)
      stopMirror()
    }
  })
  useDetachedWindows.setState((s) => ({
    windows: { ...s.windows, [windowId]: { name, win, root } }
  }))
}

/** Pencereden çıkan oturumların kapları ana belgeye alınır (pencere kapanınca belgesiyle yok olmasınlar). */
function parkLeaving(entry: DetachedEntry, keep: Set<string>): void {
  const doc = entry.win.document
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-tab-host]'))) {
    const id = el.dataset.tabHost
    if (id && !keep.has(id)) parkTabHost(id, doc)
  }
}

function closeFor(windowId: string): void {
  const entry = open.get(windowId)
  if (!entry) return
  entry.closing = true
  // Kaplar pencere kapanmadan ana belgeye alınır; oturum ana pencereye döndüyse yerine oradan taşınır.
  parkLeaving(entry, new Set())
  entry.dispose()
  open.delete(windowId)
  if (!entry.win.closed) entry.win.close()
  useDetachedWindows.setState((s) => {
    const windows = { ...s.windows }
    delete windows[windowId]
    return { windows }
  })
}

useWorkspace.subscribe((s, prev) => {
  if (
    s.detached === prev.detached &&
    s.groups === prev.groups &&
    s.windowActive === prev.windowActive
  )
    return
  const ids = new Set(s.detached.map(windowIdOf))
  for (const windowId of ids) {
    const entry = open.get(windowId)
    if (!entry) {
      openFor(windowId)
      continue
    }
    const title = windowTitle(windowId)
    if (entry.win.document.title !== title) entry.win.document.title = title
    // Pencereden ayrılan panelin (kendi penceresine ya da ana pencereye geçen) kabı ana belgeye alınır.
    parkLeaving(
      entry,
      new Set(s.detached.filter((t) => windowIdOf(t) === windowId).map((t) => t.id))
    )
  }
  for (const id of [...open.keys()]) if (!ids.has(id)) closeFor(id)
})

useLanguage.subscribe(refreshTitles)

/**
 * Oturum sekmesini yeni bir ayrı pencereye taşır (sürükleme önizlemesi bırakıldıysa pencere onun yerinde açılır). Sekme
 * kayıtlı bir düzenin grubundaysa ve grup dağılacaksa önce sorulur.
 */
export async function openInNewWindow(tabId: string): Promise<void> {
  if (!(await confirmLeaveGroup(tabId))) return
  useWorkspace.getState().detachToWindow(tabId)
}

/** Döşenmiş grubu tüm panelleriyle ayrı pencereye taşır; grup bozulmadığı için sorulmaz. */
export function openGroupInNewWindow(groupId: string): void {
  useWorkspace.getState().detachGroupToWindow(groupId)
}

/** Ana pencereyi öne getirip klavyeyi (kap yerine çizildikten sonra) terminale verir. */
function focusMain(tabId: string): void {
  jumpdesk.win.focus()
  setTimeout(() => terminalRegistry.get(tabId)?.focus(), 60)
}

/** Ayrı penceredeki tek oturumu (grupta yalnız o paneli) ana pencereye geri alır. */
export function dockTab(tabId: string, index?: number): void {
  useWorkspace.getState().attachFromWindow(tabId, index)
  focusMain(tabId)
}

/** Ayrı penceredeki her şeyi (tek sekme ya da grup) ana pencereye geri alır. */
export function dockWindow(windowId: string, index?: number): void {
  useWorkspace.getState().attachWindow(windowId, index)
  focusMain(useWorkspace.getState().activeId)
}

const windowOfTab = (tabId: string): OpenWindow | undefined => {
  const tab = useWorkspace.getState().detached.find((t) => t.id === tabId)
  return tab ? open.get(windowIdOf(tab)) : undefined
}

/** Oturum ayrı penceresinde odakta mı: pencere odakta ve oturum pencerenin etkin sekmesi (ya da odaklı paneli). */
export function detachedHasFocus(tabId: string): boolean {
  const entry = windowOfTab(tabId)
  const tab = useWorkspace.getState().detached.find((t) => t.id === tabId)
  if (!entry || !tab || entry.win.closed || !entry.win.document.hasFocus()) return false
  return activeOfWindow(useWorkspace.getState(), windowIdOf(tab)) === tabId
}

/** Ayrı penceredeki oturumu öne getirir (gruptaysa paneline odaklanır); oturum ana penceredeyse false döner. */
export function focusDetached(tabId: string): boolean {
  const entry = windowOfTab(tabId)
  if (!entry) return false
  useWorkspace.getState().focusPane(tabId)
  jumpdesk.detached.control(entry.name, 'focus')
  return true
}

/** Ayrı pencerenin `window.open` adı (ana süreç pencereyi bu adla tanır). */
export const detachedWindowName = (windowId: string): string => `${DETACHED_PREFIX}${windowId}`

/**
 * Açık ayrı pencereler, en son odaklanan önce; sekme sürüklenirken imlecin hangi pencerenin üzerinde olduğu bunlarla
 * bulunur.
 */
export function openDetachedWindows(): { windowId: string; win: Window }[] {
  return [...open]
    .filter(([, e]) => !e.closing && !e.win.closed)
    .map(([windowId, e]) => ({ windowId, win: e.win }))
    .sort((a, b) => (focusedAt.get(b.windowId) ?? 0) - (focusedAt.get(a.windowId) ?? 0))
}

/** Pencerenin son odaklanma zamanı (hiç odaklanmadıysa 0). */
export const lastFocusedAt = (windowId: string): number => focusedAt.get(windowId) ?? 0
