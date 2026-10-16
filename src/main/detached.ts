import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron'
import { DETACHED_PREFIX, type DetachedAction } from '@shared/api'
import { destroyDragPreview, takePreviewBounds } from './drag-preview'
import { currentBackground } from './window'
import icon from '../../resources/icon.png?asset'

/**
 * Sekmenin taşındığı ayrı pencereler ana pencereden `window.open('', 'jumpdesk-tab-…')` ile açılır. Pencere ana
 * pencerenin renderer'ını paylaşır: oturumlar ana pencerede yaşar, yalnız görüntüleri bu pencereye taşınır.
 */
const windows = new Map<string, BrowserWindow>()

export const isDetachedName = (name: string): boolean => name.startsWith(DETACHED_PREFIX)

export function detachedWindowOptions(): BrowserWindowConstructorOptions {
  const isMac = process.platform === 'darwin'
  return {
    minWidth: 480,
    minHeight: 320,
    title: 'JumpDesk',
    show: !process.env['JUMPDESK_HIDE_WINDOW'] || Boolean(process.env['JUMPDESK_SHOW_DETACHED']),
    backgroundColor: currentBackground(),
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } }
      : { frame: false, icon })
  }
}

export function attachDetachedWindows(main: BrowserWindow): void {
  main.webContents.on('did-create-window', (child, { frameName }) => {
    if (!isDetachedName(frameName)) return
    windows.set(frameName, child)
    // Sekme pencere dışına bırakıldıysa pencere önizlemenin yerinde ve boyutunda açılır.
    const bounds = takePreviewBounds()
    if (bounds) child.setBounds(bounds)
    child.webContents.setZoomFactor(main.webContents.getZoomFactor())
    child.webContents.setVisualZoomLevelLimits(1, 1)
    child.webContents.on('will-navigate', (e) => e.preventDefault())
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    child.on('closed', () => windows.delete(frameName))
  })
  // Ayrı pencerelerin içeriği ana pencerenin renderer'ında çalışır; ana pencere kapanınca onlar da kapanır.
  main.on('closed', () => {
    for (const w of windows.values()) if (!w.isDestroyed()) w.destroy()
    windows.clear()
    destroyDragPreview()
  })
}

export function controlDetached(name: string, action: DetachedAction): void {
  const win = windows.get(name)
  if (!win || win.isDestroyed()) return
  if (action === 'place') {
    // Pencerenin tüm sekmeleri dışarı sürüklenip bırakıldı: pencere önizlemenin yerine taşınır.
    const bounds = takePreviewBounds()
    if (bounds) win.setBounds(bounds)
    win.focus()
  } else if (action === 'minimize') win.minimize()
  else if (action === 'toggle-maximize') {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  } else {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

export function zoomDetached(factor: number): void {
  for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.setZoomFactor(factor)
}

/** Ayrı pencerelerin içerik alanları, pencere kimliğine (adın öneki atılmış haline) göre. */
export function detachedBounds(): Record<string, Electron.Rectangle> {
  const out: Record<string, Electron.Rectangle> = {}
  for (const [name, win] of windows)
    if (!win.isDestroyed()) out[name.slice(DETACHED_PREFIX.length)] = win.getContentBounds()
  return out
}
