import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC, type TrayLayout, type TrayLayoutList } from '@shared/api'
import { TRAY_POPUP_IPC, type TrayPopupState } from '@shared/tray-popup'
import { currentLanguage, mt } from './i18n'
import { isQuitting, markQuitting } from './quitting'
import { popupPosition, type Rect } from './tray-position'
import { checkOnReopen } from './updater'
import lightIcon from '../../resources/tray/tray-light.png?asset'
import lightIcon2x from '../../resources/tray/tray-light@2x.png?asset'
import templateIcon from '../../resources/tray/trayTemplate.png?asset'
import templateIcon2x from '../../resources/tray/trayTemplate@2x.png?asset'

const POPUP_WIDTH = 300
const POPUP_MAX_HEIGHT = 480

let tray: Tray | null = null
let popup: BrowserWindow | null = null
let popupAnchor: Rect | null = null
let popupHeight = 160
let layouts: TrayLayout[] = []
let folders: string[] = []
let mainWindow: BrowserWindow | null = null
/** Testler menüyü ve açılır pencereyi sistem tepsisine tıklamadan kullanır. */
let lastMenu: MenuItemConstructorOptions[] = []

/**
 * Simge yalnız `>_` işaretidir. macOS şablon görüntüsü (sistem açık/koyu menü çubuğuna göre renklendirir); Windows'ta
 * görev çubuğunun rengine göre beyaz ya da siyah; Linux'ta (GNOME üst çubuğu koyu) beyaz.
 */
function trayImage(): NativeImage {
  const pair = (one: string, two: string): NativeImage => {
    const image = nativeImage.createFromPath(one)
    image.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(two).toPNG() })
    return image
  }
  if (process.platform === 'darwin') {
    const image = pair(templateIcon, templateIcon2x)
    image.setTemplateImage(true)
    return image
  }
  if (process.platform === 'win32' && !nativeTheme.shouldUseDarkColorsForSystemIntegratedUI)
    return pair(templateIcon, templateIcon2x)
  return pair(lightIcon, lightIcon2x)
}

/** Pencereyi öne getirir; tepsiye gizlenmişse arayüze bildirilir ve güncelleme denetlenir. */
function showWindow(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  const wasHidden = !win.isVisible()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (!wasHidden) return
  win.webContents.send(IPC.appShown)
  checkOnReopen()
}

/** Düzen ana pencerede yeni sekmede açılır; pencere kapalıysa (gizli) önce gösterilir. */
function chooseLayout(id: string): void {
  popup?.hide()
  showWindow()
  mainWindow?.webContents.send(IPC.trayOpenLayout, id)
}

function quit(): void {
  markQuitting()
  app.quit()
}

/** Linux ve Windows'ta menü etiketindeki `&` kısayol harfi sayılır; düzen adında olduğu gibi görünsün. */
const menuLabel = (text: string): string => text.replace(/&/g, '&&')

const layoutItem = (layout: TrayLayout): MenuItemConstructorOptions => ({
  label: menuLabel(layout.name),
  click: () => chooseLayout(layout.id)
})

/** Klasörler alt menü olarak (boş klasör pasif bir satırla), ardından klasörsüz düzenler. */
function layoutMenuItems(): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = folders.map((folder) => {
    const inside = layouts.filter((l) => l.folder === folder)
    return {
      label: menuLabel(folder),
      submenu: inside.length
        ? inside.map(layoutItem)
        : [{ label: mt('Klasörde düzen yok'), enabled: false }]
    }
  })
  for (const layout of layouts)
    if (!layout.folder || !folders.includes(layout.folder)) items.push(layoutItem(layout))
  return items
}

function menuTemplate(withLayouts: boolean): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (withLayouts) {
    items.push({ label: mt('Kayıtlı Düzenler'), enabled: false })
    if (layouts.length === 0 && folders.length === 0)
      items.push({ label: mt('Kayıtlı düzen yok'), enabled: false })
    items.push(...layoutMenuItems())
    items.push({ type: 'separator' })
  }
  items.push(
    { label: mt("JumpDesk'i Göster"), click: showWindow },
    { label: mt('Çıkış'), click: quit }
  )
  return items
}

/**
 * Linux'ta (GNOME AppIndicator) tek tık yalnız masaüstünün menüsünü açar, uygulamaya tıklama olayı gelmez; düzenler
 * doğrudan bu menüde listelenir. macOS ve Windows'ta sol tık düzen listesini uygulamanın açılır penceresinde açar, sağ
 * tık kısa menüyü gösterir.
 */
function refreshMenu(): void {
  if (!tray) return
  if (process.platform === 'linux') {
    lastMenu = menuTemplate(true)
    tray.setContextMenu(Menu.buildFromTemplate(lastMenu))
  } else lastMenu = menuTemplate(false)
}

function popupState(): TrayPopupState {
  return { folders, layouts, language: currentLanguage(), dark: nativeTheme.shouldUseDarkColors }
}

function placePopup(): void {
  if (!popup) return
  const anchor = popupAnchor
  const display = anchor
    ? screen.getDisplayMatching(anchor)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const size = { width: POPUP_WIDTH, height: Math.min(popupHeight, POPUP_MAX_HEIGHT) }
  const { x, y } = popupPosition(anchor, display.workArea, size)
  popup.setBounds({ x, y, ...size })
}

function popupWindow(): BrowserWindow {
  if (popup && !popup.isDestroyed()) return popup
  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: popupHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/tray.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      offscreen: Boolean(process.env['JUMPDESK_OFFSCREEN'])
    }
  })
  win.on('blur', () => win.hide())
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/tray.html`)
  else void win.loadFile(join(__dirname, '../renderer/tray.html'))
  popup = win
  return win
}

/** Açılır pencereyi simgenin yanında açar; açıksa kapatır. */
function togglePopup(anchor: Rect | null): void {
  const win = popupWindow()
  if (win.isVisible()) {
    win.hide()
    return
  }
  popupAnchor = anchor
  placePopup()
  const reveal = (): void => {
    win.webContents.send(TRAY_POPUP_IPC.state, popupState())
    win.show()
    win.focus()
  }
  // İlk açılışta sayfa yüklenmeden gösterilen pencere boş görünür.
  if (win.webContents.isLoading()) win.once('ready-to-show', reveal)
  else reveal()
}

function registerPopupIpc(): void {
  const fromPopup = (e: Electron.IpcMainEvent): boolean =>
    Boolean(popup && !popup.isDestroyed() && e.sender === popup.webContents)
  ipcMain.on(TRAY_POPUP_IPC.init, (e) => {
    e.returnValue = fromPopup(e) ? popupState() : null
  })
  ipcMain.on(TRAY_POPUP_IPC.choose, (e, id) => {
    if (fromPopup(e) && typeof id === 'string' && layouts.some((l) => l.id === id)) chooseLayout(id)
  })
  ipcMain.on(TRAY_POPUP_IPC.showApp, (e) => {
    if (!fromPopup(e)) return
    popup?.hide()
    showWindow()
  })
  ipcMain.on(TRAY_POPUP_IPC.height, (e, height) => {
    if (!fromPopup(e) || typeof height !== 'number' || !Number.isFinite(height)) return
    popupHeight = Math.max(80, Math.round(height) + 8)
    placePopup()
  })
  ipcMain.on(TRAY_POPUP_IPC.close, (e) => {
    if (fromPopup(e)) popup?.hide()
  })
}

/** Ana pencerenin bildirdiği düzen ve klasör listesi; bozuk girdiler atılır. */
function setLayouts(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  const list = raw as Partial<TrayLayoutList>
  if (!Array.isArray(list.layouts)) return
  folders = (Array.isArray(list.folders) ? list.folders : [])
    .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
    .slice(0, 100)
    .map((f) => f.slice(0, 120))
  layouts = list.layouts
    .filter(
      (l): l is TrayLayout =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as TrayLayout).id === 'string' &&
        typeof (l as TrayLayout).name === 'string' &&
        typeof (l as TrayLayout).servers === 'number'
    )
    .slice(0, 200)
    .map((l) => {
      const layout: TrayLayout = { id: l.id, name: l.name.slice(0, 120), servers: l.servers }
      if (typeof l.folder === 'string' && folders.includes(l.folder.slice(0, 120)))
        layout.folder = l.folder.slice(0, 120)
      return layout
    })
  refreshMenu()
  if (popup && !popup.isDestroyed() && popup.isVisible())
    popup.webContents.send(TRAY_POPUP_IPC.state, popupState())
}

/**
 * Sistem tepsisi simgesi (Linux ve macOS'ta sağ üst, Windows'ta sağ alt): kayıtlı düzenleri açar. Ana pencere
 * kapatılınca uygulama kapanmaz: açık oturumlar kapatılır, pencere gizlenir ve tepsiden düzen seçilince ya da uygulama
 * yeniden başlatılınca aynı pencere gösterilir. Ekransız testlerde simge yalnız `JUMPDESK_TEST_TRAY` ile kurulur.
 */
export function initTray(win: BrowserWindow): void {
  if (process.env['JUMPDESK_HIDE_WINDOW'] && !process.env['JUMPDESK_TEST_TRAY']) return
  mainWindow = win
  tray = new Tray(trayImage())
  tray.setToolTip('JumpDesk')
  if (process.platform === 'win32') nativeTheme.on('updated', () => tray?.setImage(trayImage()))
  if (process.platform === 'linux') tray.on('click', showWindow)
  else {
    tray.on('click', (_e, bounds) => togglePopup(bounds))
    tray.on('right-click', () =>
      tray?.popUpContextMenu(Menu.buildFromTemplate(menuTemplate(false)))
    )
  }
  refreshMenu()
  registerPopupIpc()
  ipcMain.on(IPC.trayLayouts, (e, raw) => {
    if (e.sender === win.webContents) setLayouts(raw)
  })

  win.on('close', (e) => {
    if (isQuitting()) return
    e.preventDefault()
    win.webContents.send(IPC.appHidden)
    win.hide()
  })

  if (process.env['JUMPDESK_TEST_TRAY'])
    (globalThis as { __jumpdeskTray?: unknown }).__jumpdeskTray = {
      /** Menü etiketleri; alt menü verilirse (`Klasör`) onun etiketleri. */
      labels: (submenu?: string) => {
        const items = submenu
          ? ((lastMenu.find((i) => i.label === submenu)?.submenu as MenuItemConstructorOptions[]) ??
            [])
          : lastMenu
        return items.map((i) =>
          i.type === 'separator' ? '—' : `${String(i.label)}${i.submenu ? ' ▸' : ''}`
        )
      },
      /** Etikete tıklar; `Klasör/Düzen` biçiminde alt menüdeki öğeye. */
      click: (path: string) => {
        const [first, second] = path.split('/')
        let item = lastMenu.find((i) => i.label === (second === undefined ? path : first))
        if (second !== undefined)
          item = (item?.submenu as MenuItemConstructorOptions[] | undefined)?.find(
            (i) => i.label === second
          )
        ;(item?.click as (() => void) | undefined)?.()
        return Boolean(item)
      },
      openPopup: () => togglePopup({ x: 900, y: 0, width: 24, height: 24 }),
      popupVisible: () => Boolean(popup && !popup.isDestroyed() && popup.isVisible()),
      mainVisible: () => win.isVisible()
    }
}

/** Uygulama yeniden başlatılınca (ikinci örnek) ya da macOS'ta Dock'tan açılınca gizli pencere gösterilir. */
export function revealMainWindow(): void {
  showWindow()
}
