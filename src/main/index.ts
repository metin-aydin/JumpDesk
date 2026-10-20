import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { attachAuthWindow, checkSession } from './auth'
import { registerIpc } from './ipc'
import { installRequestHooks } from './net-hooks'
import { store } from './store'
import { initUpdater } from './updater'
import { createMainWindow } from './window'
import { initTray } from './tray'
import { mt } from './i18n'

app.setName('JumpDesk')
// Geliştirme sürümü kurulu paketin masaüstü kaydıyla (jumpdesk.desktop, X11 WM_CLASS jumpdesk) eşleşirse rıhtım paketin
// simgesini gösterir; ayrı ad verilince pencerenin kendi simgesi (resources/icon.png) görünür.
if (!app.isPackaged && process.platform === 'linux') app.setDesktopName('jumpdesk-dev.desktop')
if (process.env['JUMPDESK_USER_DATA']) app.setPath('userData', process.env['JUMPDESK_USER_DATA'])
if (process.env['JUMPDESK_DOWNLOADS']) app.setPath('downloads', process.env['JUMPDESK_DOWNLOADS'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  // Pencere kapatılmışsa (uygulama tepside) yeniden başlatmak aynı pencereyi gösterir.
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  function buildMenu(): void {
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null)
      return
    }
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        {
          label: mt('Pencere'),
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
          ]
        }
      ])
    )
  }

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('io.github.metin-aydin.jumpdesk')
    nativeTheme.themeSource = store.settings.theme
    buildMenu()

    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    mainWindow = createMainWindow()
    const appContentsId = mainWindow.webContents.id
    registerIpc(mainWindow)
    initTray(mainWindow)
    attachAuthWindow(mainWindow)
    installRequestHooks((id) => id === appContentsId)
    initUpdater(mainWindow)
    await checkSession()

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
      else if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('before-quit', () => store.flushNow())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
