import {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  nativeTheme,
  type IpcMainInvokeEvent
} from 'electron'
import { lookup } from 'dns/promises'
import { IPC, type DetachedAction, type DragPreviewPayload, type ThemeInfo } from '@shared/api'
import type { AiProvider } from '@shared/ai'
import type { ConnectionTokenRequest, ServerMeta, ThemePreference } from '@shared/types'
import { cancelLogin, getAuthState, logout, setLoginViewBounds, startLogin } from './auth'
import { jmsApi } from './jms/api'
import { jmsImage } from './jms/http'
import { controlDetached, detachedBounds, zoomDetached } from './detached'
import {
  commitDragPreview,
  hideDragPreview,
  moveDragPreview,
  showDragPreview
} from './drag-preview'
import { downloads } from './downloads'
import icon from '../../resources/icon.png?asset'
import {
  aiConfig,
  aiListModels,
  aiSuggest,
  aiTest,
  setAiConfig,
  setAiSecret,
  type AiConfigPatch
} from './ai'
import { currentLanguage, languageForced } from './i18n'
import { store } from './store'
import { openImport, saveExport } from './transfer'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  setAutoCheck,
  updateState
} from './updater'
import { currentBackground, getWindowState } from './window'

function themeInfo(): ThemeInfo {
  return {
    preference: store.settings.theme,
    resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
}

const asString = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || v.length > 4096) throw new Error(`Geçersiz parametre: ${name}`)
  return v
}

/** Wayland'da (X11 köprüsü kullanılmadıkça) pencere ve imleç konumları uygulamaya verilmez. */
function windowPositionsKnown(): boolean {
  if (process.platform !== 'linux' || process.env['XDG_SESSION_TYPE'] !== 'wayland') return true
  return app.commandLine.getSwitchValue('ozone-platform') === 'x11'
}

/** Ortam değişkeninde verilen süre (ms); verilmediyse ya da geçersizse null. */
function envMs(name: string): number | null {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function registerIpc(win: BrowserWindow): void {
  ipcMain.on(IPC.platformInfo, (e) => {
    e.returnValue = {
      positions: windowPositionsKnown(),
      alarmWarmupMs: envMs('JUMPDESK_ALARM_WARMUP_MS'),
      alarmSnippetWaitMs: envMs('JUMPDESK_ALARM_SNIPPET_WAIT_MS'),
      language: currentLanguage(),
      languageForced: languageForced(),
      terminalWebgl: process.env['JUMPDESK_DISABLE_WEBGL'] !== '1'
    }
  })

  const fromApp = (e: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean =>
    e.sender === win.webContents

  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (e, ...args) => {
      if (!fromApp(e)) throw new Error('Yetkisiz gönderici')
      return fn(...args)
    })
  }
  const on = (channel: string, fn: (...args: unknown[]) => void): void => {
    ipcMain.on(channel, (e, ...args) => {
      if (fromApp(e)) fn(...args)
    })
  }

  handle(IPC.authState, () => getAuthState())
  handle(IPC.authLogin, (server) =>
    startLogin(server === undefined ? undefined : asString(server, 'server'))
  )
  handle(IPC.authCancel, () => cancelLogin())
  handle(IPC.authLogout, () => logout())
  on(IPC.authViewBounds, (bounds) =>
    setLoginViewBounds(bounds as Parameters<typeof setLoginViewBounds>[0])
  )

  handle(IPC.jmsProfile, () => jmsApi.profile())
  handle(IPC.jmsAvatar, (url) => jmsImage(asString(url, 'url')))
  handle(IPC.jmsTreeChildren, (key) =>
    jmsApi.treeChildren(key === undefined ? undefined : asString(key, 'key'))
  )
  handle(IPC.jmsTreeSearch, (keyword) => jmsApi.treeSearch(asString(keyword, 'keyword')))
  handle(IPC.jmsTreeAsset, (id) => jmsApi.treeAsset(asString(id, 'assetId')))
  handle(IPC.jmsTreeChildrenById, (id) => jmsApi.treeChildrenById(asString(id, 'nodeId')))
  handle(IPC.netResolve, async (host) => {
    const name = asString(host, 'host')
    if (!/^[a-z0-9.-]+$/i.test(name)) return null
    try {
      return (await lookup(name, { family: 4 })).address
    } catch {
      return null
    }
  })
  /** Bildirim merkezinde duran bildirimler; görülünce kapatılır, böylece dock'taki okunmamış sayısı da düşer. */
  const shown = new Set<{ tabId: string; notification: Notification }>()
  on(IPC.notifyClear, (tabId) => {
    if (process.env['JUMPDESK_NO_NOTIFY']) {
      const sink = globalThis as { __jumpdeskNotificationClears?: unknown[] }
      ;(sink.__jumpdeskNotificationClears ??= []).push(tabId ?? '*')
    }
    for (const entry of [...shown]) {
      if (tabId !== undefined && entry.tabId !== tabId) continue
      entry.notification.close()
      shown.delete(entry)
    }
  })
  on(IPC.notifyShow, (raw) => {
    const opts = raw as { title?: unknown; body?: unknown; tabId?: unknown }
    if (process.env['JUMPDESK_NO_NOTIFY']) {
      const sink = globalThis as { __jumpdeskNotifications?: unknown[] }
      ;(sink.__jumpdeskNotifications ??= []).push(opts)
      return
    }
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: asString(opts.title, 'title').slice(0, 200),
      body: asString(opts.body, 'body').slice(0, 400),
      icon
    })
    const tabId = asString(opts.tabId, 'tabId')
    shown.add({ tabId, notification: n })
    n.on('close', () => {
      for (const entry of shown) if (entry.notification === n) shown.delete(entry)
    })
    n.on('click', () => {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send(IPC.notifyClicked, tabId)
    })
    n.show()
  })
  handle(IPC.downloadBegin, (name) => downloads.begin(asString(name, 'name')))
  handle(IPC.downloadWrite, (id, data) => {
    if (!(data instanceof Uint8Array)) throw new Error('Geçersiz parametre: data')
    return downloads.write(asString(id, 'id'), data)
  })
  handle(IPC.downloadEnd, (id, ok) => downloads.end(asString(id, 'id'), ok === true))
  on(IPC.downloadShow, (target) => downloads.showInFolder(asString(target, 'path')))
  handle(IPC.jmsAssetDetail, (id) => jmsApi.assetDetail(asString(id, 'assetId')))
  handle(IPC.jmsConnectionToken, (req) => jmsApi.connectionToken(req as ConnectionTokenRequest))
  handle(IPC.jmsExchangeToken, (id) => jmsApi.exchangeToken(asString(id, 'tokenId')))
  handle(IPC.jmsConnectMethods, (id) => jmsApi.connectMethods(asString(id, 'assetId')))
  handle(IPC.jmsSmartEndpoint, (params) =>
    jmsApi.smartEndpoint(params as { protocol: string; assetId?: string; token?: string })
  )

  on(IPC.winMinimize, () => win.minimize())
  on(IPC.winToggleMaximize, () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  on(IPC.winClose, () => win.close())
  on(IPC.winFocus, () => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  on(IPC.detachedControl, (name, action) => {
    const a = asString(action, 'action') as DetachedAction
    if (['minimize', 'toggle-maximize', 'focus', 'place'].includes(a))
      controlDetached(asString(name, 'name'), a)
  })
  on(IPC.dragPreviewShow, (payload) => {
    const p = payload as DragPreviewPayload
    if (
      p &&
      typeof p.title === 'string' &&
      Number.isFinite(p.width) &&
      Number.isFinite(p.height) &&
      Array.isArray(p.panes) &&
      p.colors
    )
      showDragPreview(p)
  })
  handle(IPC.windowBounds, () => ({ main: win.getContentBounds(), ...detachedBounds() }))
  on(IPC.dragPreviewMove, () => moveDragPreview())
  on(IPC.dragPreviewHide, () => hideDragPreview())
  on(IPC.dragPreviewCommit, () => commitDragPreview())
  on(IPC.uiZoom, (factor) => {
    if (typeof factor === 'number' && factor >= 0.5 && factor <= 3) zoomDetached(factor)
  })
  handle(IPC.winState, () => getWindowState(win))

  handle(IPC.themeGet, () => themeInfo())
  handle(IPC.themeSet, (pref) => {
    const preference = asString(pref, 'theme') as ThemePreference
    if (!['system', 'dark', 'light'].includes(preference)) throw new Error('Geçersiz tema')
    store.updateSettings({ theme: preference })
    nativeTheme.themeSource = preference
    return themeInfo()
  })
  nativeTheme.on('updated', () => {
    win.setBackgroundColor(currentBackground())
    win.webContents.send(IPC.themeChanged, themeInfo())
  })

  handle(IPC.settingsGet, () => store.settings)
  on(IPC.settingsSetLanguage, (language) => {
    if ((language === 'en' || language === 'tr') && !languageForced())
      store.updateSettings({ language })
  })
  handle(IPC.transferSave, (payload, username) =>
    saveExport(win, payload, asString(username, 'username'))
  )
  handle(IPC.transferOpen, () => openImport(win))
  handle(IPC.aiGetConfig, () => aiConfig())
  handle(IPC.aiSetConfig, (patch) => setAiConfig((patch ?? {}) as AiConfigPatch))
  handle(IPC.aiSetSecret, (provider, key, value) =>
    setAiSecret(
      asString(provider, 'provider') as AiProvider,
      asString(key, 'key'),
      value === null ? null : asString(value, 'value')
    )
  )
  handle(IPC.aiTest, (language) => aiTest(language === 'tr' ? 'tr' : 'en'))
  handle(IPC.aiSuggest, (request) => aiSuggest(request))
  handle(IPC.aiListModels, (provider) => aiListModels(provider))
  handle(IPC.updateGetState, () => updateState())
  handle(IPC.updateCheck, () => checkForUpdates())
  handle(IPC.updateDownload, () => downloadUpdate())
  on(IPC.updateInstall, () => installUpdate())
  handle(IPC.updateSetAuto, (enabled) => setAutoCheck(enabled === true))
  handle(IPC.serverMetaGetAll, () => store.servers)
  handle(IPC.serverMetaSet, (assetId, patch) =>
    store.updateServer(asString(assetId, 'assetId'), patch as Partial<ServerMeta>)
  )
}
