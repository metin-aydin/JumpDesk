import { create } from 'zustand'
import { t } from '@/lib/i18n'
import { onUserScope, readUserItem, writeUserItem } from '@/lib/user-storage'

export type TabKind = 'connect' | 'session'
export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
export type TileMode = 'vertical' | 'horizontal' | 'grid'

export interface AssetRef {
  id: string
  name: string
  address?: string
  platformType?: string
}

export interface WorkspaceTab {
  id: string
  kind: TabKind
  title: string
  asset?: AssetRef
  protocol?: string
  status: SessionStatus
  /** Sekme görünmezken yeni çıktı geldi; sekme etkinleşince temizlenir. */
  activity?: boolean
  /** Kullanıcı bakmıyorken bir alarm kuralı eşleşti; sekme (ya da grubu) açılınca temizlenir. */
  alarm?: boolean
  /** Hatırlanan hesap yok sayılır, hesap seçimi yeniden sorulur. */
  chooseAccount?: boolean
  /** `files`: oturum terminal yerine dosya yöneticisi olarak açılır. */
  view?: 'files'
  /** Dosya yöneticisinin açılacağı klasör. */
  startPath?: string
  /** Var olan bir oturumun token'ı; yeni token bundan türetilir, hesap sorulmaz. */
  sourceToken?: string
  /** `sourceToken`'ın hesabına tanınan eylemler (upload, download, delete...). */
  sourceActions?: string[]
  /** Ayrı penceredeyken bağlı olduğu pencere: tek sekmede sekmenin, taşınan grupta grubun kimliği. */
  windowId?: string
}

export type SessionExtras = Pick<
  WorkspaceTab,
  'view' | 'startPath' | 'sourceToken' | 'sourceActions'
>

/** Aynı ekranda döşenen oturumlar; üst çubukta tek sekme olarak görünür. Birden çok grup olabilir. */
export interface TabGroup {
  id: string
  ids: string[]
  mode: TileMode
  /** Grup içinde tek başına büyütülmüş panel. */
  zoomedId: string | null
  /** Odaklı panele yazılan girdi gruptaki diğer panellere de gönderilir. */
  broadcast: boolean
  /** Yayına katılmayan paneller. */
  excluded: string[]
  /** Değiştikçe panel boyutları eşitlenir. */
  layoutVersion: number
  /** Panel boyut oranları; yalnız kaydedildiği yerleşim sürümünde geçerlidir (bkz. `groupGrow`). */
  grow?: GroupGrow
  /** Grup sekmesine dönüldüğünde odaklanacak panel. */
  focusedId: string
  /** Kayıtlı düzenden gelen ya da düzen olarak kaydedilen grubun adı; grup sekmesinde sunucu adı yerine gösterilir. */
  name?: string
  layoutId?: string
  /** Düzendeki öğenin sırası (düzen birden çok öğe içeriyorsa grubun karşılığı). */
  layoutItem?: number
}

/** Satır yükseklik oranları (satır sırasına göre) ve satır içi genişlik oranları (sekmeye göre); varsayılan 1. */
export interface GroupGrow {
  version: number
  row: Record<number, number>
  col: Record<string, number>
}

const NO_GROW = { row: {}, col: {} } as const

/** Grubun geçerli panel oranları; yerleşim değişmişse (üye, mod, eşitleme) boş. */
export function groupGrow(group: TabGroup): Pick<GroupGrow, 'row' | 'col'> {
  return group.grow && group.grow.version === group.layoutVersion ? group.grow : NO_GROW
}

interface WorkspaceStore {
  tabs: WorkspaceTab[]
  /**
   * Ayrı pencerelerdeki sekmeler (her biri `windowId` taşır); ana penceredeki sekme şeridinde ve çalışma alanında yer
   * almaz. Bir pencerenin sekme sırası bu listedeki sıradır.
   */
  detached: WorkspaceTab[]
  /** Ayrı pencerelerin etkin sekmesi (pencere kimliğine göre). */
  windowActive: Record<string, string>
  activeId: string
  /** Gruba ya da sekmeye dönüldüğünde odaklanacak son oturum. */
  lastSessionId: string | null
  groups: TabGroup[]
  rightPanelOpen: boolean
  /** Soldaki sunucu ağacı açık mı (tercih saklanır). */
  leftPanelOpen: boolean
  openSession: (
    asset: AssetRef,
    protocol?: string,
    chooseAccount?: boolean,
    extras?: SessionExtras
  ) => string
  /** Varlıkları yeni sekmelerde açar ve hepsini tek bir döşenmiş grupta toplar. */
  openGroup: (
    assets: AssetRef[],
    mode: TileMode,
    label?: {
      name: string
      layoutId: string
      layoutItem: number
      /** Düzende kayıtlı panel oranları: satırlar ve sunucu sırasına göre genişlikler. */
      sizes?: { rows: number[]; cols: number[] }
    }
  ) => void
  /** Grubu bir düzen adına bağlar (düzen olarak kaydedilince ya da düzen yeniden adlandırılınca). */
  nameGroup: (groupId: string, name: string, layoutId: string, layoutItem?: number) => void
  /** Tüm sekmelerin alarm rozetini kaldırır (alarmlar temizlenince). */
  clearAlarmBadges: () => void
  /** Grubun düzen bağını kaldırır (düzen silinince); grup sekmesi yeniden sunucu adıyla görünür. */
  unnameGroup: (groupId: string) => void
  openConnectTab: () => string
  replaceWithSession: (
    tabId: string,
    asset: AssetRef,
    protocol?: string,
    chooseAccount?: boolean,
    extras?: SessionExtras
  ) => void
  updateTab: (tabId: string, patch: Partial<WorkspaceTab>) => void
  close: (tabId: string) => void
  /**
   * Sekmeleri (tek sekme ya da bir grubun tüm üyeleri) başka bir pencereye taşır: `MAIN_WINDOW`, ayrı pencere kimliği
   * ya da `NEW_WINDOW` (yeni pencere). `index` hedef penceredeki sekme sırasıdır (verilmezse sona). Tamamen taşınan
   * gruplar korunur, yarım kalan gruptan çıkarılan sekme gruptan düşer. Hedef pencerenin kimliğini döndürür.
   */
  moveTabs: (ids: string[], target: string, index?: number) => string | null
  /** Oturum sekmesini ayrı pencereye taşır; gruptaysa önce gruptan çıkarılır. */
  detachToWindow: (tabId: string) => void
  /** Döşenmiş grubu (tüm panelleriyle, düzeni korunarak) ayrı pencereye taşır. */
  detachGroupToWindow: (groupId: string) => void
  /**
   * Ayrı penceredeki tek oturumu ana pencerenin sekmelerine geri alır (`index` verilmezse sona); oturum ayrı penceredeki
   * bir grubun paneliyse gruptan çıkar. Ana pencerede yalnız boş bir "Yeni Bağlantı" sekmesi varsa onun yerini alır.
   */
  attachFromWindow: (tabId: string, index?: number) => void
  /** Ayrı penceredeki her şeyi (tek sekme ya da grup) ana pencereye geri alır. */
  attachWindow: (windowId: string, index?: number) => void
  /** Ayrı penceredeki grubun panelini kendi penceresine ayırır. */
  splitToWindow: (tabId: string) => void
  /** Panele odaklanır: ana pencerede sekmeyi etkinleştirir, ayrı penceredeki grupta odaklı paneli değiştirir. */
  focusPane: (tabId: string) => void
  /** Tüm sekmeleri kapatır; geriye boş bir "Yeni Bağlantı" sekmesi kalır. */
  closeAll: () => void
  activate: (tabId: string) => void
  move: (tabId: string, toIndex: number) => void
  /** Sekmeleri (ör. bir grubun üyeleri) birlikte taşır; `toIndex` blok dışındaki sekmeler arasındaki yeridir. */
  moveBlock: (ids: string[], toIndex: number) => void
  /**
   * `tabId` (verilmezse etkin sekme) bir gruptaysa o grubun düzeni değişir; değilse hiçbir gruba ait olmayan
   * oturumlar yeni bir grupta döşenir. Var olan gruplar korunur.
   */
  arrange: (mode: TileMode, tabId?: string) => void
  setGroupMode: (groupId: string, mode: TileMode) => void
  /** Gruba ait olmayan bir oturumu grubun sonuna ekler. */
  addToGroup: (groupId: string, tabId: string) => void
  ungroup: (groupId: string) => void
  detachFromGroup: (tabId: string) => void
  /** Gruptaki iki panelin yerini değiştirir. */
  swapInGroup: (a: string, b: string) => void
  /** Grubun panel sırasını verilen sırayla değiştirir. */
  reorderGroup: (groupId: string, ids: string[]) => void
  toggleZoom: (tabId?: string) => void
  toggleBroadcast: (groupId: string) => void
  toggleExcluded: (tabId: string) => void
  /** Panel oranlarını günceller (tutamaçla boyutlandırma); `update` geçerli oranları alır. */
  setGroupGrow: (
    groupId: string,
    update: (current: Pick<GroupGrow, 'row' | 'col'>) => Partial<Pick<GroupGrow, 'row' | 'col'>>
  ) => void
  equalize: (groupId: string) => void
  toggleRightPanel: () => void
  setLeftPanelOpen: (open: boolean) => void
  toggleLeftPanel: () => void
  activateRelative: (offset: number) => void
  /** Tüm oturum sekmelerini kapatıp başlangıç durumuna döner (çıkışta). */
  reset: () => void
}

const LEFT_PANEL_KEY = 'leftPanelOpen'

function readLeftPanelOpen(): boolean {
  return readUserItem(LEFT_PANEL_KEY) !== '0'
}

let counter = 0
const nextId = (): string => `tab-${Date.now().toString(36)}-${(counter++).toString(36)}`

/** Hiç sekmesiz kalınmaz: başlangıçta ve son sekme kapanınca boş bir "Yeni Bağlantı" sekmesi açılır. */
const newConnectTab = (): WorkspaceTab => ({
  id: nextId(),
  kind: 'connect',
  title: 'Yeni Bağlantı',
  status: 'idle'
})
const FIRST_TAB = newConnectTab()

const sessionTab = (
  asset: AssetRef,
  protocol?: string,
  chooseAccount?: boolean,
  extras?: SessionExtras
): WorkspaceTab => ({
  id: nextId(),
  kind: 'session',
  title: asset.name,
  asset,
  protocol,
  chooseAccount,
  status: 'connecting',
  ...extras
})

/**
 * Sekmenin ekranda gösterilen başlığı: "Yeni Bağlantı" sekmesinin saklanan başlığı geçerli dile çevrilir. Bileşenler
 * `useT()` ile aldıkları işlevi verir; böylece dil değişince başlık da yenilenir.
 */
export const tabTitle = (tab: Pick<WorkspaceTab, 'kind' | 'title'>, translate = t): string =>
  tab.kind === 'connect' ? translate(tab.title) : tab.title

/** Ana pencerenin kimliği (sekmeleri `tabs` listesindedir). */
export const MAIN_WINDOW = 'main'
/** `moveTabs` hedefi: sekmeler yeni bir ayrı pencerede açılır. */
export const NEW_WINDOW = 'new'

/** Sekmenin bulunduğu pencere (ana pencerede `MAIN_WINDOW`). */
export const windowIdOf = (tab: WorkspaceTab): string => tab.windowId ?? MAIN_WINDOW

/** Pencerenin sekmeleri, şeritteki sırasıyla. */
export function tabsOfWindow(
  state: Pick<WorkspaceStore, 'tabs' | 'detached'>,
  windowId: string
): WorkspaceTab[] {
  return windowId === MAIN_WINDOW
    ? state.tabs
    : state.detached.filter((t) => t.windowId === windowId)
}

/** Pencerenin etkin sekmesi. */
export function activeOfWindow(
  state: Pick<WorkspaceStore, 'tabs' | 'detached' | 'activeId' | 'windowActive'>,
  windowId: string
): string {
  if (windowId === MAIN_WINDOW) return state.activeId
  const tabs = tabsOfWindow(state, windowId)
  const id = state.windowActive[windowId]
  return tabs.some((t) => t.id === id) ? id : (tabs[0]?.id ?? '')
}

/** Grup ana pencerede mi (üyeleri ana sekmelerde). */
export const isMainGroup = (state: Pick<WorkspaceStore, 'tabs'>, group: TabGroup): boolean =>
  group.ids.some((id) => state.tabs.some((t) => t.id === id))

/** Sekmeyi ana pencerede ya da ayrı pencerelerde arar. */
export function findTab(
  state: Pick<WorkspaceStore, 'tabs' | 'detached'>,
  tabId: string
): WorkspaceTab | undefined {
  return state.tabs.find((t) => t.id === tabId) ?? state.detached.find((t) => t.id === tabId)
}

export function groupOf(groups: TabGroup[], tabId: string): TabGroup | undefined {
  return groups.find((g) => g.ids.includes(tabId))
}

function newGroup(ids: string[], mode: TileMode, focusedId: string): TabGroup {
  return {
    id: `group-${nextId()}`,
    ids,
    mode,
    zoomedId: null,
    broadcast: false,
    excluded: [],
    layoutVersion: 0,
    focusedId
  }
}

/** Grup ikiden az üyeye düşerse dağıtılır. */
function prune(group: TabGroup, removed: string): TabGroup | null {
  if (!group.ids.includes(removed)) return group
  const ids = group.ids.filter((id) => id !== removed)
  if (ids.length < 2) return null
  return {
    ...group,
    ids,
    zoomedId: group.zoomedId === removed ? null : group.zoomedId,
    excluded: group.excluded.filter((id) => id !== removed),
    focusedId: group.focusedId === removed ? ids[0] : group.focusedId,
    layoutVersion: group.layoutVersion + 1
  }
}

const pruneAll = (groups: TabGroup[], removed: string): TabGroup[] =>
  groups.map((g) => prune(g, removed)).filter((g): g is TabGroup => g !== null)

const updateGroup = (
  groups: TabGroup[],
  groupId: string,
  fn: (g: TabGroup) => TabGroup
): TabGroup[] => groups.map((g) => (g.id === groupId ? fn(g) : g))

/** Grup üyeleri sekme şeridinde ilk üyenin yerinde yan yana toplanır. */
function gatherMembers(tabs: WorkspaceTab[], ids: string[]): WorkspaceTab[] {
  const first = tabs.findIndex((t) => ids.includes(t.id))
  if (first < 0) return tabs
  const members = ids
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is WorkspaceTab => Boolean(t))
  const rest = tabs.filter((t) => !ids.includes(t.id))
  const at = tabs.slice(0, first).filter((t) => !ids.includes(t.id)).length
  return [...rest.slice(0, at), ...members, ...rest.slice(at)]
}

/**
 * Sekmeler bir listeden çıkarılınca kalanlar ve yeni etkin sekme: etkin sekme gittiyse grubundaki bir komşu, yoksa
 * sağdaki ya da soldaki sekme.
 */
function removeFrom(
  list: WorkspaceTab[],
  ids: string[],
  active: string,
  groups: TabGroup[]
): { rest: WorkspaceTab[]; active: string } {
  const index = list.findIndex((t) => ids.includes(t.id))
  const rest = list.filter((t) => !ids.includes(t.id))
  if (rest.some((t) => t.id === active)) return { rest, active }
  const peer = groupOf(groups, active)?.ids.find(
    (id) => !ids.includes(id) && rest.some((t) => t.id === id)
  )
  return { rest, active: peer ?? (rest[index] ?? rest[index - 1] ?? rest[0])?.id ?? '' }
}

/** Pencerenin sekme listesini yeni sırayla yazar (ayrı pencerede diğer pencerelerin sekmelerine dokunmadan). */
function windowList(
  s: Pick<WorkspaceStore, 'detached'>,
  windowId: string,
  ordered: WorkspaceTab[]
): Partial<Pick<WorkspaceStore, 'tabs' | 'detached'>> {
  if (windowId === MAIN_WINDOW) return { tabs: ordered }
  let i = 0
  return { detached: s.detached.map((t) => (t.windowId === windowId ? ordered[i++] : t)) }
}

const windowOfDetached = (s: Pick<WorkspaceStore, 'detached'>, tabId: string): string | undefined =>
  s.detached.find((t) => t.id === tabId)?.windowId

/** Kısmen taşınan grupların taşınan üyeleri gruptan düşer; tamamı taşınan gruplar olduğu gibi kalır. */
function pruneMoved(groups: TabGroup[], ids: string[]): TabGroup[] {
  let out = groups
  for (const g of groups) {
    if (!g.ids.some((id) => ids.includes(id)) || g.ids.every((id) => ids.includes(id))) continue
    for (const id of g.ids) if (ids.includes(id)) out = pruneAll(out, id)
  }
  return out
}

/**
 * Sekme ana pencereden çıkarılınca (kapatma ya da ayrı pencereye taşıma) kalan sekmeler ve yeni etkin sekme: grubu
 * varsa gruptaki bir komşu, yoksa sağdaki ya da soldaki sekme. Hiç sekme kalmazsa boş "Yeni Bağlantı" açılır.
 */
function withoutTab(
  s: Pick<WorkspaceStore, 'tabs' | 'activeId' | 'groups' | 'lastSessionId'>,
  tabId: string
): Pick<WorkspaceStore, 'tabs' | 'activeId' | 'groups' | 'lastSessionId'> | null {
  const index = s.tabs.findIndex((t) => t.id === tabId)
  if (index < 0) return null
  const rest = s.tabs.filter((t) => t.id !== tabId)
  if (rest.length === 0) rest.push(newConnectTab())
  let nextActive = s.activeId
  if (s.activeId === tabId || !rest.some((t) => t.id === s.activeId)) {
    const groupPeer = groupOf(s.groups, tabId)?.ids.find((id) => id !== tabId)
    nextActive = groupPeer ?? (rest[index] ?? rest[index - 1] ?? rest[0]).id
  }
  return {
    tabs: rest,
    activeId: nextActive,
    groups: pruneAll(s.groups, tabId),
    lastSessionId: s.lastSessionId === tabId ? null : s.lastSessionId
  }
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  tabs: [FIRST_TAB],
  detached: [],
  windowActive: {},
  activeId: FIRST_TAB.id,
  lastSessionId: null,
  groups: [],
  rightPanelOpen: false,
  leftPanelOpen: readLeftPanelOpen(),

  openSession: (asset, protocol, chooseAccount, extras) => {
    const tab = sessionTab(asset, protocol, chooseAccount, extras)
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id, lastSessionId: tab.id }))
    return tab.id
  },

  openGroup: (assets, mode, label) => {
    if (assets.length === 0) return
    const { tabs, activeId } = get()
    const active = tabs.find((t) => t.id === activeId)
    const created = assets.map((a) => sessionTab(a))
    const ids = created.map((t) => t.id)
    const base = active?.kind === 'connect' ? tabs.filter((t) => t.id !== active.id) : tabs
    const at = active?.kind === 'connect' ? tabs.indexOf(active) : base.length
    const nextTabs = [...base.slice(0, at), ...created, ...base.slice(at)]
    const { sizes, ...names } = label ?? {}
    const group: TabGroup = { ...newGroup(ids, mode, ids[0]), ...(label ? names : {}) }
    if (sizes)
      group.grow = {
        version: group.layoutVersion,
        row: Object.fromEntries(sizes.rows.map((v, i) => [i, v])),
        col: Object.fromEntries(ids.map((id, i) => [id, sizes.cols[i] ?? 1]))
      }
    set((s) => ({
      tabs: nextTabs,
      groups: ids.length > 1 ? [...s.groups, group] : s.groups,
      activeId: ids[0],
      lastSessionId: ids[0]
    }))
  },

  openConnectTab: () => {
    const tab = newConnectTab()
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab.id
  },

  replaceWithSession: (tabId, asset, protocol, chooseAccount, extras) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...sessionTab(asset, protocol, chooseAccount, extras), id: t.id } : t
      ),
      activeId: tabId,
      lastSessionId: tabId
    }))
  },

  updateTab: (tabId, patch) => {
    set((s) =>
      s.detached.some((t) => t.id === tabId)
        ? { detached: s.detached.map((t) => (t.id === tabId ? { ...t, ...patch } : t)) }
        : { tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)) }
    )
  },

  close: (tabId) => {
    const s = get()
    const tab = s.detached.find((t) => t.id === tabId)
    if (tab?.windowId) {
      const windowId = tab.windowId
      const inWindow = tabsOfWindow(s, windowId)
      const { active } = removeFrom(inWindow, [tabId], activeOfWindow(s, windowId), s.groups)
      const windowActive = { ...s.windowActive }
      if (inWindow.length > 1) windowActive[windowId] = active
      else delete windowActive[windowId]
      set({
        detached: s.detached.filter((t) => t.id !== tabId),
        groups: pruneAll(s.groups, tabId),
        windowActive
      })
      return
    }
    const next = withoutTab(s, tabId)
    if (next) set(next)
  },

  moveTabs: (ids, target, index) => {
    const s = get()
    const all = [...s.tabs, ...s.detached]
    const moving = ids
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is WorkspaceTab => Boolean(t))
    if (!moving.length) return null
    const source = windowIdOf(moving[0])
    const targetId = target === NEW_WINDOW ? `win-${nextId()}` : target
    if (source === targetId) return targetId
    const movingIds = moving.map((t) => t.id)
    const groups = pruneMoved(s.groups, movingIds)
    const intact = groups.find((g) => g.ids.every((id) => movingIds.includes(id)))
    const focus = intact && movingIds.includes(intact.focusedId) ? intact.focusedId : movingIds[0]

    let tabs = s.tabs
    let detached = s.detached
    let activeId = s.activeId
    let lastSessionId = s.lastSessionId
    const windowActive = { ...s.windowActive }
    if (source === MAIN_WINDOW) {
      const removed = removeFrom(tabs, movingIds, activeId, s.groups)
      tabs = removed.rest
      activeId = removed.active
      if (tabs.length === 0) {
        const tab = newConnectTab()
        tabs = [tab]
        activeId = tab.id
      }
      if (lastSessionId && movingIds.includes(lastSessionId)) lastSessionId = null
    } else {
      const inWindow = tabsOfWindow(s, source)
      const removed = removeFrom(inWindow, movingIds, activeOfWindow(s, source), s.groups)
      detached = detached.filter((t) => !movingIds.includes(t.id))
      if (removed.rest.length) windowActive[source] = removed.active
      else delete windowActive[source]
    }

    const moved = moving.map((t) => ({
      ...t,
      activity: false,
      windowId: targetId === MAIN_WINDOW ? undefined : targetId
    }))
    if (targetId === MAIN_WINDOW) {
      // Ana pencerede yalnız boş bir "Yeni Bağlantı" sekmesi varsa taşınan sekmeler onun yerini alır.
      if (tabs.length === 1 && tabs[0].kind === 'connect') tabs = []
      const at = Math.max(0, Math.min(index ?? tabs.length, tabs.length))
      tabs = [...tabs.slice(0, at), ...moved, ...tabs.slice(at)]
      activeId = focus
      lastSessionId = focus
    } else {
      const inWindow = detached.filter((t) => t.windowId === targetId)
      const at = Math.max(0, Math.min(index ?? inWindow.length, inWindow.length))
      const anchor = inWindow[at]
      const pos = anchor
        ? detached.indexOf(anchor)
        : inWindow.length
          ? detached.indexOf(inWindow[inWindow.length - 1]) + 1
          : detached.length
      detached = [...detached.slice(0, pos), ...moved, ...detached.slice(pos)]
      windowActive[targetId] = focus
    }
    set({ tabs, detached, activeId, lastSessionId, groups, windowActive })
    return targetId
  },

  detachToWindow: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'session') get().moveTabs([tabId], NEW_WINDOW)
  },

  detachGroupToWindow: (groupId) => {
    const group = get().groups.find((g) => g.id === groupId)
    if (group) get().moveTabs(group.ids, NEW_WINDOW)
  },

  attachFromWindow: (tabId, index) => {
    if (get().detached.some((t) => t.id === tabId)) get().moveTabs([tabId], MAIN_WINDOW, index)
  },

  attachWindow: (windowId, index) => {
    const ids = tabsOfWindow(get(), windowId).map((t) => t.id)
    if (ids.length) get().moveTabs(ids, MAIN_WINDOW, index)
  },

  splitToWindow: (tabId) => {
    if (get().detached.some((t) => t.id === tabId)) get().moveTabs([tabId], NEW_WINDOW)
  },

  focusPane: (tabId) => get().activate(tabId),

  closeAll: () => {
    const tab = newConnectTab()
    // Ayrı penceredeki gruplar ana pencereyle birlikte kapanmaz.
    set((s) => ({
      tabs: [tab],
      activeId: tab.id,
      lastSessionId: null,
      groups: s.groups.filter((g) => !isMainGroup(s, g))
    }))
  },

  activate: (tabId) =>
    set((s) => {
      const group = groupOf(s.groups, tabId)
      const groups =
        group && group.focusedId !== tabId
          ? updateGroup(s.groups, group.id, (g) => ({ ...g, focusedId: tabId }))
          : s.groups
      const detachedTab = s.detached.find((t) => t.id === tabId)
      if (detachedTab?.windowId) {
        return {
          windowActive: { ...s.windowActive, [detachedTab.windowId]: tabId },
          groups,
          detached:
            detachedTab.activity || detachedTab.alarm
              ? s.detached.map((t) =>
                  t.id === tabId ? { ...t, activity: false, alarm: false } : t
                )
              : s.detached
        }
      }
      if (!s.tabs.some((t) => t.id === tabId)) return s
      return {
        activeId: tabId,
        lastSessionId:
          s.tabs.find((t) => t.id === tabId)?.kind === 'session' ? tabId : s.lastSessionId,
        groups,
        tabs: s.tabs.some((t) => t.id === tabId && (t.activity || t.alarm))
          ? s.tabs.map((t) => (t.id === tabId ? { ...t, activity: false, alarm: false } : t))
          : s.tabs
      }
    }),

  move: (tabId, toIndex) => {
    const tabs = [...get().tabs]
    const from = tabs.findIndex((t) => t.id === tabId)
    const target = Math.max(0, Math.min(toIndex, tabs.length - 1))
    if (from < 0 || from === target) return
    const [tab] = tabs.splice(from, 1)
    tabs.splice(target, 0, tab)
    set({ tabs })
  },

  moveBlock: (ids, toIndex) => {
    const s = get()
    const first = findTab(s, ids[0])
    if (!first) return
    const windowId = windowIdOf(first)
    const tabs = tabsOfWindow(s, windowId)
    const block = tabs.filter((t) => ids.includes(t.id))
    const rest = tabs.filter((t) => !ids.includes(t.id))
    const at = Math.max(0, Math.min(toIndex, rest.length))
    const next = [...rest.slice(0, at), ...block, ...rest.slice(at)]
    if (next.every((t, i) => t === tabs[i])) return
    set(windowList(s, windowId, next))
  },

  arrange: (mode, tabId) => {
    const s = get()
    const ref = tabId ?? s.activeId
    const existing = groupOf(s.groups, ref)
    if (existing) {
      get().setGroupMode(existing.id, mode)
      return
    }
    const refTab = findTab(s, ref)
    const windowId = refTab ? windowIdOf(refTab) : MAIN_WINDOW
    const tabs = tabsOfWindow(s, windowId)
    const grouped = new Set(s.groups.flatMap((g) => g.ids))
    const ids = tabs.filter((t) => t.kind === 'session' && !grouped.has(t.id)).map((t) => t.id)
    if (ids.length < 2) return
    const focus = ids.includes(ref) ? ref : ids[0]
    set({
      groups: [...s.groups, newGroup(ids, mode, focus)],
      ...windowList(s, windowId, gatherMembers(tabs, ids))
    })
    get().activate(focus)
  },

  clearAlarmBadges: () =>
    set((s) =>
      s.tabs.some((t) => t.alarm) || s.detached.some((t) => t.alarm)
        ? {
            tabs: s.tabs.map((t) => (t.alarm ? { ...t, alarm: false } : t)),
            detached: s.detached.map((t) => (t.alarm ? { ...t, alarm: false } : t))
          }
        : s
    ),

  unnameGroup: (groupId) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) => ({
        ...g,
        name: undefined,
        layoutId: undefined
      }))
    })),

  nameGroup: (groupId, name, layoutId, layoutItem) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) => ({
        ...g,
        name,
        layoutId,
        layoutItem: layoutItem ?? g.layoutItem ?? 0
      }))
    })),

  setGroupMode: (groupId, mode) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) => ({
        ...g,
        mode,
        zoomedId: null,
        layoutVersion: g.layoutVersion + 1
      }))
    })),

  addToGroup: (groupId, tabId) =>
    set((s) => {
      const target = s.groups.find((g) => g.id === groupId)
      const tab = findTab(s, tabId)
      if (!target || !tab || tab.kind !== 'session' || target.ids.includes(tabId)) return s
      const groups = pruneAll(s.groups, tabId).map((g) =>
        g.id === groupId
          ? {
              ...g,
              ids: [...g.ids, tabId],
              zoomedId: null,
              focusedId: tabId,
              layoutVersion: g.layoutVersion + 1
            }
          : g
      )
      const ids = groups.find((g) => g.id === groupId)?.ids ?? []
      const windowId = windowIdOf(tab)
      return { groups, ...windowList(s, windowId, gatherMembers(tabsOfWindow(s, windowId), ids)) }
    }),

  ungroup: (groupId) => set((s) => ({ groups: s.groups.filter((g) => g.id !== groupId) })),

  detachFromGroup: (tabId) => set((s) => ({ groups: pruneAll(s.groups, tabId) })),

  reorderGroup: (groupId, ids) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) =>
        ids.length === g.ids.length && ids.every((id) => g.ids.includes(id))
          ? { ...g, ids, zoomedId: null }
          : g
      )
    })),

  swapInGroup: (a, b) =>
    set((s) => {
      const group = groupOf(s.groups, a)
      if (!group || a === b || !group.ids.includes(b)) return s
      const ids = [...group.ids]
      const i = ids.indexOf(a)
      const j = ids.indexOf(b)
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      return { groups: updateGroup(s.groups, group.id, (g) => ({ ...g, ids, zoomedId: null })) }
    }),

  toggleZoom: (tabId) =>
    set((s) => {
      const id = tabId ?? s.activeId
      const group = groupOf(s.groups, id)
      if (!group) return s
      return {
        groups: updateGroup(s.groups, group.id, (g) => ({
          ...g,
          zoomedId: g.zoomedId === id ? null : id,
          focusedId: id
        })),
        activeId: s.tabs.some((t) => t.id === id) ? id : s.activeId,
        windowActive: windowOfDetached(s, id)
          ? { ...s.windowActive, [windowOfDetached(s, id)!]: id }
          : s.windowActive
      }
    }),

  toggleBroadcast: (groupId) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) => ({ ...g, broadcast: !g.broadcast }))
    })),

  toggleExcluded: (tabId) =>
    set((s) => {
      const group = groupOf(s.groups, tabId)
      if (!group) return s
      return {
        groups: updateGroup(s.groups, group.id, (g) => ({
          ...g,
          excluded: g.excluded.includes(tabId)
            ? g.excluded.filter((id) => id !== tabId)
            : [...g.excluded, tabId]
        }))
      }
    }),

  setGroupGrow: (groupId, update) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) => {
        const current = groupGrow(g)
        const next = update(current)
        return {
          ...g,
          grow: {
            version: g.layoutVersion,
            row: next.row ?? current.row,
            col: next.col ?? current.col
          }
        }
      })
    })),

  equalize: (groupId) =>
    set((s) => ({
      groups: updateGroup(s.groups, groupId, (g) => ({ ...g, layoutVersion: g.layoutVersion + 1 }))
    })),

  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  setLeftPanelOpen: (open) => {
    writeUserItem(LEFT_PANEL_KEY, open ? '1' : '0')
    set({ leftPanelOpen: open })
  },

  toggleLeftPanel: () => get().setLeftPanelOpen(!get().leftPanelOpen),

  activateRelative: (offset) => {
    const { tabs, activeId } = get()
    const i = tabs.findIndex((t) => t.id === activeId)
    const next = tabs[(i + offset + tabs.length) % tabs.length]
    if (next) get().activate(next.id)
  },

  reset: () => {
    get().closeAll()
    set({ detached: [], groups: [], windowActive: {} })
  }
}))

/** Yayın açıkken bir panelden gelen girdinin gideceği diğer paneller. */
export function broadcastPeers(originTabId: string): string[] {
  const group = groupOf(useWorkspace.getState().groups, originTabId)
  if (!group?.broadcast || group.excluded.includes(originTabId)) return []
  return group.ids.filter((id) => id !== originTabId && !group.excluded.includes(id))
}

onUserScope(() => useWorkspace.setState({ leftPanelOpen: readLeftPanelOpen() }))
