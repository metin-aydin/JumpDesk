import { create } from 'zustand'
import { t } from '@/lib/i18n'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'
import { tileRows } from '@/features/workspace/tile-layout'
import {
  groupGrow,
  groupOf,
  useWorkspace,
  type AssetRef,
  type TabGroup,
  type TileMode,
  type WorkspaceTab
} from './workspace'

/** Düzendeki bir öğe: tek oturum sekmesi ya da döşenmiş grup. Sıra, sekme şeridindeki sıradır. */
export type LayoutItem =
  | { type: 'tab'; asset: AssetRef; view?: 'files' }
  | {
      type: 'group'
      mode: TileMode
      assets: AssetRef[]
      /** Panel oranları: satır sırasına göre yükseklikler, sunucu sırasına göre satır içi genişlikler (yoksa eşit). */
      sizes?: LayoutSizes
    }

export interface LayoutSizes {
  rows: number[]
  cols: number[]
}

const validSizes = (v: unknown): v is LayoutSizes => {
  const s = v as LayoutSizes
  const ok = (a: unknown): boolean =>
    Array.isArray(a) && a.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
  return Boolean(s) && ok(s.rows) && ok(s.cols)
}

export interface SavedLayout {
  id: string
  name: string
  items: LayoutItem[]
  createdAt: number
  /** Düzenin bulunduğu klasörün adı; yoksa düzen klasörsüzdür. */
  folder?: string
}

const KEY = 'layouts'
const FOLDERS_KEY = 'layoutFolders'
const MAX_FOLDER_NAME = 80

const folderKey = (name: string): string => name.trim().toLocaleLowerCase('tr')
const cleanFolderName = (name: unknown): string =>
  typeof name === 'string' ? name.trim().slice(0, MAX_FOLDER_NAME) : ''

const validAsset = (a: unknown): a is AssetRef =>
  Boolean(a) && typeof (a as AssetRef).id === 'string' && typeof (a as AssetRef).name === 'string'

/** Kayıttan ya da içe aktarılan dosyadan gelen düzenleri doğrular; bozuk öğeler atlanır. */
export function sanitizeLayouts(raw: unknown): SavedLayout[] {
  if (!Array.isArray(raw)) return []
  const out: SavedLayout[] = []
  for (const l of raw as Partial<SavedLayout>[]) {
    if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || !Array.isArray(l.items))
      continue
    const items = l.items
      .filter((i): i is LayoutItem =>
        i?.type === 'tab'
          ? validAsset(i.asset)
          : i?.type === 'group' &&
            ['vertical', 'horizontal', 'grid'].includes(i.mode) &&
            Array.isArray(i.assets) &&
            i.assets.every(validAsset)
      )
      .map((i) => {
        if (i.type !== 'group' || i.sizes === undefined || validSizes(i.sizes)) return i
        return { type: 'group' as const, mode: i.mode, assets: i.assets }
      })
    if (!items.length) continue
    const layout: SavedLayout = {
      id: l.id,
      name: l.name,
      items,
      createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now()
    }
    const folder = cleanFolderName(l.folder)
    if (folder) layout.folder = folder
    out.push(layout)
  }
  return out
}

/**
 * Klasör listesini doğrular: adlar kırpılır, büyük/küçük harf farkıyla yinelenenler atılır; düzenlerin kullandığı ama
 * listede olmayan klasörler sona eklenir. Düzenlerin klasör adı listedeki yazımla eşitlenir.
 */
export function sanitizeFolders(
  raw: unknown,
  layouts: SavedLayout[]
): { folders: string[]; layouts: SavedLayout[] } {
  const folders: string[] = []
  const byKey = new Map<string, string>()
  const add = (value: unknown): void => {
    const name = cleanFolderName(value)
    if (!name || byKey.has(folderKey(name))) return
    byKey.set(folderKey(name), name)
    folders.push(name)
  }
  if (Array.isArray(raw)) raw.forEach(add)
  layouts.forEach((l) => add(l.folder))
  return {
    folders,
    layouts: layouts.map((l) =>
      l.folder && byKey.get(folderKey(l.folder)) !== l.folder
        ? { ...l, folder: byKey.get(folderKey(l.folder)) }
        : l
    )
  }
}

function read(): { folders: string[]; layouts: SavedLayout[] } {
  return sanitizeFolders(readUserJson(FOLDERS_KEY), sanitizeLayouts(readUserJson(KEY)))
}

function write(layouts: SavedLayout[], folders?: string[]): void {
  writeUserJson(KEY, layouts)
  if (folders) writeUserJson(FOLDERS_KEY, folders)
}

/** Klasörler (kayıt sırasıyla, her birinin düzenleriyle) ve klasörsüz düzenler. */
export function groupByFolder(
  layouts: SavedLayout[],
  folders: string[]
): { folders: { name: string; layouts: SavedLayout[] }[]; loose: SavedLayout[] } {
  return {
    folders: folders.map((name) => ({ name, layouts: layouts.filter((l) => l.folder === name) })),
    loose: layouts.filter((l) => !l.folder || !folders.includes(l.folder))
  }
}

/** Listede ve aramada gösterilen ad: klasördeki düzen "Klasör / Düzen". */
export function layoutPath(layout: SavedLayout): string {
  return layout.folder ? `${layout.folder} / ${layout.name}` : layout.name
}

/** Grubun panel oranları (hepsi eşitse yok). */
function sizesOf(group: TabGroup): LayoutSizes | undefined {
  const grow = groupGrow(group)
  const rows = tileRows(group.ids, group.mode).map((_r, i) => grow.row[i] ?? 1)
  const cols = group.ids.map((id) => grow.col[id] ?? 1)
  return [...rows, ...cols].every((v) => v === 1) ? undefined : { rows, cols }
}

/** Grubun düzen öğesi: sunucular, yerleşim ve panel oranları. */
function groupItem(group: TabGroup, tabs: WorkspaceTab[]): LayoutItem {
  const assets = group.ids
    .map((id) => tabs.find((t) => t.id === id)?.asset)
    .filter((a): a is AssetRef => Boolean(a))
  const sizes = sizesOf(group)
  return sizes
    ? { type: 'group', mode: group.mode, assets, sizes }
    : { type: 'group', mode: group.mode, assets }
}

/** Satır ağırlıklarını ve satır içi genişlik ağırlıklarını oranlara çevirir (karşılaştırma için). */
function fractions(ids: string[], mode: TileMode, sizes: LayoutSizes | undefined): number[] {
  const rows = tileRows(ids, mode)
  const rowWeights = rows.map((_r, i) => sizes?.rows[i] ?? 1)
  const rowTotal = rowWeights.reduce((a, b) => a + b, 0)
  const out = rowWeights.map((w) => w / rowTotal)
  let index = 0
  for (const row of rows) {
    const weights = row.map((_id, c) => sizes?.cols[index + c] ?? 1)
    const total = weights.reduce((a, b) => a + b, 0)
    out.push(...weights.map((w) => w / total))
    index += row.length
  }
  return out
}

/** Açık oturum sekmelerini ve grupları (düzen, sıra) düzen öğelerine çevirir; "Yeni Bağlantı" sekmeleri atlanır. */
export function captureLayout(): LayoutItem[] {
  const { tabs, groups } = useWorkspace.getState()
  const items: LayoutItem[] = []
  const seen = new Set<string>()
  for (const tab of tabs) {
    if (tab.kind !== 'session' || !tab.asset) continue
    const group = groupOf(groups, tab.id)
    if (group) {
      if (seen.has(group.id)) continue
      seen.add(group.id)
      items.push(groupItem(group, tabs))
    } else {
      items.push({ type: 'tab', asset: tab.asset, view: tab.view })
    }
  }
  return items
}

/** Bir grubun sunucularını ve yerleşimini düzen öğesine çevirir. */
export function captureGroup(groupId: string): LayoutItem[] {
  const { tabs, groups } = useWorkspace.getState()
  const group = groups.find((g) => g.id === groupId)
  if (!group) return []
  return [groupItem(group, tabs)]
}

export function countServers(items: LayoutItem[]): number {
  return items.reduce((n, i) => n + (i.type === 'tab' ? 1 : i.assets.length), 0)
}

export function layoutSummary(layout: SavedLayout): string {
  return t('{n} sunucu', { n: countServers(layout.items) })
}

/** Düzeni açar: tekli sekmeler ve gruplar sırayla açılır; etkin boş "Yeni Bağlantı" sekmesi ilk öğeye dönüşür. */
export function openLayout(layout: SavedLayout): void {
  for (const [index, item] of layout.items.entries()) {
    const ws = useWorkspace.getState()
    const active = ws.tabs.find((t) => t.id === ws.activeId)
    if (item.type === 'group') {
      ws.openGroup(item.assets, item.mode, {
        name: layout.name,
        layoutId: layout.id,
        layoutItem: index,
        sizes: item.sizes
      })
      continue
    }
    const extras = item.view ? { view: item.view } : undefined
    if (active?.kind === 'connect')
      ws.replaceWithSession(active.id, item.asset, undefined, false, extras)
    else ws.openSession(item.asset, undefined, false, extras)
  }
}

interface LayoutStore {
  layouts: SavedLayout[]
  /** Klasör adları (gösterim sırası); boş klasörler de tutulur. */
  folders: string[]
  /**
   * Verilen grubu (yoksa tüm açık oturumları) verilen adla kaydeder; aynı adlı düzen varsa üzerine yazar. Grup
   * kaydedildiyse grup sekmesi düzenin adını alır. `folder`: düzenin klasörü (`null` klasörsüz; verilmezse üzerine
   * yazılan düzenin klasörü korunur), yoksa oluşturulur.
   */
  saveCurrent: (name: string, groupId?: string, folder?: string | null) => SavedLayout | null
  rename: (id: string, name: string) => void
  /** Grubun şu anki sunucularını, sırasını ve yerleşimini bağlı olduğu düzene yazar. */
  updateFromGroup: (groupId: string) => void
  remove: (id: string) => void
  /** Klasör oluşturur; aynı adda (büyük/küçük harf farkı gözetmeden) klasör varsa onun adını döndürür. */
  createFolder: (name: string) => string | null
  /** Klasörün adını değiştirir; başka bir klasör bu adı kullanıyorsa değiştirmez ve `false` döner. */
  renameFolder: (from: string, to: string) => boolean
  /** Klasörü siler; içindeki düzenler klasörsüz kalır. */
  removeFolder: (name: string) => void
  /** Düzeni klasöre taşır (`null` klasörden çıkarır); klasör yoksa oluşturulur. */
  moveToFolder: (id: string, folder: string | null) => void
  /**
   * Tüm düzenleri (ve klasörleri) verilenlerle değiştirir (içe aktarma); açık gruplardan silinen düzenlere bağlı
   * olanların adı kalkar.
   */
  replaceAll: (layouts: SavedLayout[], folders?: string[]) => void
}

const withoutFolder = (layout: SavedLayout): SavedLayout => {
  const copy = { ...layout }
  delete copy.folder
  return copy
}

/** Klasör listesinde aynı adlı (büyük/küçük harf farkı gözetmeden) klasör. */
const findFolder = (folders: string[], name: string): string | undefined =>
  folders.find((f) => folderKey(f) === folderKey(name))

export const useLayouts = create<LayoutStore>((set, get) => ({
  ...read(),
  saveCurrent: (name, groupId, folder) => {
    const items = groupId ? captureGroup(groupId) : captureLayout()
    const trimmed = name.trim()
    if (!items.length || !trimmed) return null
    const existing = get().layouts.find(
      (l) => l.name.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr')
    )
    let folders = get().folders
    let target = folder === undefined ? existing?.folder : folder
    if (target) {
      const known = findFolder(folders, target)
      target = known ?? cleanFolderName(target)
      if (!known && target) folders = [...folders, target]
    }
    const layout: SavedLayout = {
      id: existing?.id ?? `layout-${Date.now().toString(36)}`,
      name: trimmed,
      items,
      createdAt: Date.now()
    }
    if (target) layout.folder = target
    const layouts = existing
      ? get().layouts.map((l) => (l.id === existing.id ? layout : l))
      : [...get().layouts, layout]
    write(layouts, folders)
    set({ layouts, folders })
    if (groupId) useWorkspace.getState().nameGroup(groupId, layout.name, layout.id, 0)
    return layout
  },
  updateFromGroup: (groupId) => {
    const group = useWorkspace.getState().groups.find((g) => g.id === groupId)
    const item = captureGroup(groupId)[0]
    if (!group?.layoutId || !item) return
    const index = group.layoutItem ?? 0
    const layouts = get().layouts.map((l) =>
      l.id === group.layoutId
        ? { ...l, items: l.items.map((it, i) => (i === index ? item : it)), createdAt: Date.now() }
        : l
    )
    write(layouts)
    set({ layouts })
  },
  rename: (id, name) => {
    const layouts = get().layouts.map((l) =>
      l.id === id ? { ...l, name: name.trim() || l.name } : l
    )
    write(layouts)
    set({ layouts })
    const renamed = layouts.find((l) => l.id === id)
    const ws = useWorkspace.getState()
    if (renamed)
      ws.groups
        .filter((g) => g.layoutId === id)
        .forEach((g) => ws.nameGroup(g.id, renamed.name, id))
  },
  remove: (id) => {
    const layouts = get().layouts.filter((l) => l.id !== id)
    write(layouts)
    set({ layouts })
    const ws = useWorkspace.getState()
    ws.groups.filter((g) => g.layoutId === id).forEach((g) => ws.unnameGroup(g.id))
  },
  createFolder: (name) => {
    const clean = cleanFolderName(name)
    if (!clean) return null
    const known = findFolder(get().folders, clean)
    if (known) return known
    const folders = [...get().folders, clean]
    writeUserJson(FOLDERS_KEY, folders)
    set({ folders })
    return clean
  },
  renameFolder: (from, to) => {
    const clean = cleanFolderName(to)
    if (!clean || !get().folders.includes(from)) return false
    const other = findFolder(get().folders, clean)
    if (other && other !== from) return false
    const folders = get().folders.map((f) => (f === from ? clean : f))
    const layouts = get().layouts.map((l) => (l.folder === from ? { ...l, folder: clean } : l))
    write(layouts, folders)
    set({ layouts, folders })
    return true
  },
  removeFolder: (name) => {
    const folders = get().folders.filter((f) => f !== name)
    const layouts = get().layouts.map((l) => (l.folder === name ? withoutFolder(l) : l))
    write(layouts, folders)
    set({ layouts, folders })
  },
  moveToFolder: (id, folder) => {
    let folders = get().folders
    let target: string | undefined
    if (folder) {
      target = findFolder(folders, folder) ?? (cleanFolderName(folder) || undefined)
      if (target && !folders.includes(target)) folders = [...folders, target]
    }
    const layouts = get().layouts.map((l) =>
      l.id !== id ? l : target ? { ...l, folder: target } : withoutFolder(l)
    )
    write(layouts, folders)
    set({ layouts, folders })
  },
  replaceAll: (incoming, incomingFolders) => {
    const { layouts, folders } = sanitizeFolders(incomingFolders, incoming)
    write(layouts, folders)
    set({ layouts, folders })
    const ws = useWorkspace.getState()
    ws.groups
      .filter((g) => g.layoutId && !layouts.some((l) => l.id === g.layoutId))
      .forEach((g) => ws.unnameGroup(g.id))
  }
}))

onUserScope(() => useLayouts.setState(read()))

export type LayoutDialogState =
  | { mode: 'save'; groupId?: string }
  | { mode: 'rename'; layout: SavedLayout }
  | { mode: 'folder'; layoutId?: string }
  | { mode: 'folder-rename'; folder: string }

interface LayoutDialogStore {
  /**
   * `save`: grubu (verilmezse tüm açık oturumları) düzen olarak kaydet; `rename`: var olan düzenin adını değiştir;
   * `folder`: yeni klasör (düzen verildiyse oraya taşınır); `folder-rename`: klasörün adını değiştir.
   */
  state: LayoutDialogState | null
  /** Grup verilmezse etkin sekmenin grubu kaydedilir; `null` tüm açık oturumları kaydeder. */
  openSave: (groupId?: string | null) => void
  openRename: (layout: SavedLayout) => void
  openNewFolder: (layoutId?: string) => void
  openRenameFolder: (folder: string) => void
  close: () => void
}

export const useLayoutDialog = create<LayoutDialogStore>((set) => ({
  state: null,
  openSave: (groupId) => {
    const ws = useWorkspace.getState()
    const target = groupId === null ? undefined : (groupId ?? groupOf(ws.groups, ws.activeId)?.id)
    set({ state: { mode: 'save', groupId: target } })
  },
  openRename: (layout) => set({ state: { mode: 'rename', layout } }),
  openNewFolder: (layoutId) => set({ state: { mode: 'folder', layoutId } }),
  openRenameFolder: (folder) => set({ state: { mode: 'folder-rename', folder } }),
  close: () => set({ state: null })
}))

/**
 * Grup bağlı olduğu düzenden farklı mı: sunucular, sıraları, yerleşim (yan yana / alt alta / ızgara) ya da panel
 * boyutları (%2'den fazla) değişmişse. Düzene bağlı olmayan grup hiçbir zaman "değişmiş" sayılmaz.
 */
export function isGroupDirty(
  group: TabGroup,
  tabs: WorkspaceTab[],
  layouts: SavedLayout[]
): boolean {
  if (!group.layoutId) return false
  const layout = layouts.find((l) => l.id === group.layoutId)
  const item = layout?.items[group.layoutItem ?? 0]
  if (!item || item.type !== 'group') return Boolean(layout)
  const current = group.ids.map((id) => tabs.find((t) => t.id === id)?.asset?.id ?? '')
  if (item.mode !== group.mode || item.assets.map((a) => a.id).join('|') !== current.join('|'))
    return true
  const saved = fractions(group.ids, group.mode, item.sizes)
  const now = fractions(group.ids, group.mode, sizesOf(group))
  // Kayan nokta farkı dışındaki her oran değişikliği (bir piksellik sürükleme dahil) değişiklik sayılır.
  return saved.some((v, i) => Math.abs(v - now[i]) > 1e-6)
}
