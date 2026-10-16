import { BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/api'
import type { WindowState } from '@shared/types'
import { PARTITION } from './config'
import { attachDetachedWindows, detachedWindowOptions, isDetachedName } from './detached'
import { store } from './store'
import icon from '../../resources/icon.png?asset'

export const WINDOW_BG = { dark: '#0f1218', light: '#f3f4f7' }

export function currentBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BG.dark : WINDOW_BG.light
}

function windowState(win: BrowserWindow): WindowState {
  return { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() }
}

function restoredBounds(): {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
} {
  const saved = store.windowBounds
  const fallback = { width: 1360, height: 860, maximized: false }
  if (!saved) return fallback
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return (
      saved.x !== undefined &&
      saved.y !== undefined &&
      saved.x < a.x + a.width &&
      saved.y < a.y + a.height
    )
  })
  return visible ? saved : { ...fallback, maximized: saved.maximized }
}

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const bounds = restoredBounds()

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'JumpDesk',
    backgroundColor: currentBackground(),
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } }
      : { frame: false }),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      offscreen: Boolean(process.env['JUMPDESK_OFFSCREEN'])
    }
  })
  if (process.env['JUMPDESK_OFFSCREEN']) win.webContents.setFrameRate(60)

  if (bounds.maximized) win.maximize()

  win.once('ready-to-show', () => {
    if (!process.env['JUMPDESK_HIDE_WINDOW']) win.show()
  })

  const emitState = (): void => win.webContents.send(IPC.winStateChanged, windowState(win))
  for (const ev of [
    'maximize',
    'unmaximize',
    'enter-full-screen',
    'leave-full-screen',
    'focus',
    'blur'
  ] as const) {
    win.on(ev as 'maximize', emitState)
  }

  win.on('close', () => {
    const b = win.getNormalBounds()
    store.setWindowBounds({ ...b, maximized: win.isMaximized() })
  })

  win.webContents.setVisualZoomLevelLimits(1, 1)
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isDetachedName(frameName) && (url === '' || url === 'about:blank'))
      return { action: 'allow', overrideBrowserWindowOptions: detachedWindowOptions() }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  attachDetachedWindows(win)
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!(is.dev && devUrl && url.startsWith(devUrl))) e.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

export function getWindowState(win: BrowserWindow): WindowState {
  return windowState(win)
}
