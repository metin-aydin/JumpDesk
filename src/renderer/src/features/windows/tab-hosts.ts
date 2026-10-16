import { useWorkspace } from '@/stores/workspace'

/**
 * Her sekmenin içeriği (oturum) kalıcı bir kap öğesine çizilir. Kap, sekme ana penceredeyken çalışma alanındaki
 * yerine, ayrı penceredeyken o pencerenin içerik alanına taşınır. React ağacındaki yeri değişmediği için oturum
 * (WebSocket, terminal) yeniden oluşturulmaz; yalnız DOM'daki yeri değişir.
 */
const hosts = new Map<string, HTMLDivElement>()
const movedListeners = new Map<string, Set<() => void>>()

export function tabHost(tabId: string): HTMLDivElement {
  let el = hosts.get(tabId)
  if (!el) {
    el = document.createElement('div')
    el.className = 'flex min-h-0 min-w-0 flex-1 flex-col'
    el.dataset.tabHost = tabId
    hosts.set(tabId, el)
  }
  return el
}

function move(tabId: string, host: HTMLDivElement, slot: HTMLElement): void {
  if (host.parentNode === slot) return
  const before = host.ownerDocument
  slot.appendChild(host)
  if (host.ownerDocument !== before) movedListeners.get(tabId)?.forEach((cb) => cb())
}

/** Kabı verilen yuvaya taşır; başka bir pencerenin belgesine geçtiyse içindeki bileşenlere haber verilir. */
export function placeTabHost(tabId: string, slot: HTMLElement): void {
  move(tabId, tabHost(tabId), slot)
}

/** Ana belgede görünmeyen bekleme yeri; kapanan ayrı pencereden çıkarılan kaplar buraya alınır. */
function parking(): HTMLElement {
  let el = document.getElementById('jumpdesk-host-parking')
  if (!el) {
    el = document.createElement('div')
    el.id = 'jumpdesk-host-parking'
    el.hidden = true
    document.body.appendChild(el)
  }
  return el
}

/** Kap verilen belgedeyse ana belgedeki bekleme yerine alınır. */
export function parkTabHost(tabId: string, from: Document): void {
  const host = hosts.get(tabId)
  if (host?.ownerDocument === from) move(tabId, host, parking())
}

/** Sekmenin kabı başka bir pencereye taşınınca çağrılır (terminal pencere değişikliğini işler). */
export function onTabHostMoved(tabId: string, cb: () => void): () => void {
  let set = movedListeners.get(tabId)
  if (!set) movedListeners.set(tabId, (set = new Set()))
  set.add(cb)
  return () => {
    set.delete(cb)
    if (!set.size) movedListeners.delete(tabId)
  }
}

/** Sekmesi kalmayan kaplar bırakılır. */
useWorkspace.subscribe((s, prev) => {
  if (s.tabs === prev.tabs && s.detached === prev.detached) return
  for (const id of hosts.keys()) {
    if (!s.tabs.some((t) => t.id === id) && !s.detached.some((t) => t.id === id)) {
      hosts.get(id)?.remove()
      hosts.delete(id)
    }
  }
})

/**
 * Öğenin bulunduğu pencerenin ResizeObserver'ıyla boyut izler; öğe başka pencereye taşınınca `restart` ile yeniden
 * bağlanır (her belge kendi gözlemcilerini çalıştırır).
 */
export function observeSize(
  el: HTMLElement,
  cb: () => void
): { restart: () => void; stop: () => void } {
  let ro: ResizeObserver | null = null
  const start = (): void => {
    ro?.disconnect()
    const View = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis
    ro = new View.ResizeObserver(cb)
    ro.observe(el)
  }
  start()
  return { restart: start, stop: () => ro?.disconnect() }
}
