import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import { IPC, type JumpDeskApi } from '@shared/api'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const platformInfo = ipcRenderer.sendSync(IPC.platformInfo) as {
  positions?: boolean
  alarmWarmupMs?: number | null
  alarmSnippetWaitMs?: number | null
  language?: 'en' | 'tr'
  languageForced?: boolean
  terminalWebgl?: boolean
} | null

const api: JumpDeskApi = {
  platform: process.platform,
  windowPositions: platformInfo?.positions !== false,
  alarmWarmupMs: platformInfo?.alarmWarmupMs ?? null,
  alarmSnippetWaitMs: platformInfo?.alarmSnippetWaitMs ?? null,
  language: platformInfo?.language ?? 'en',
  languageForced: platformInfo?.languageForced === true,
  terminalWebgl: platformInfo?.terminalWebgl !== false,
  auth: {
    getState: () => ipcRenderer.invoke(IPC.authState),
    login: (server) => ipcRenderer.invoke(IPC.authLogin, server),
    cancel: () => ipcRenderer.invoke(IPC.authCancel),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
    setViewBounds: (bounds) => ipcRenderer.send(IPC.authViewBounds, bounds),
    onChange: (cb) => subscribe(IPC.authChanged, cb)
  },
  jms: {
    profile: () => ipcRenderer.invoke(IPC.jmsProfile),
    avatar: (url) => ipcRenderer.invoke(IPC.jmsAvatar, url),
    treeChildren: (key) => ipcRenderer.invoke(IPC.jmsTreeChildren, key),
    treeSearch: (keyword) => ipcRenderer.invoke(IPC.jmsTreeSearch, keyword),
    treeAsset: (id) => ipcRenderer.invoke(IPC.jmsTreeAsset, id),
    treeChildrenById: (id) => ipcRenderer.invoke(IPC.jmsTreeChildrenById, id),
    assetDetail: (id) => ipcRenderer.invoke(IPC.jmsAssetDetail, id),
    connectionToken: (req) => ipcRenderer.invoke(IPC.jmsConnectionToken, req),
    exchangeToken: (id) => ipcRenderer.invoke(IPC.jmsExchangeToken, id),
    connectMethods: (id) => ipcRenderer.invoke(IPC.jmsConnectMethods, id),
    smartEndpoint: (params) => ipcRenderer.invoke(IPC.jmsSmartEndpoint, params)
  },
  win: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.winToggleMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    getState: () => ipcRenderer.invoke(IPC.winState),
    onStateChange: (cb) => subscribe(IPC.winStateChanged, cb),
    focus: () => ipcRenderer.send(IPC.winFocus)
  },
  detached: {
    control: (name, action) => ipcRenderer.send(IPC.detachedControl, name, action),
    bounds: () => ipcRenderer.invoke(IPC.windowBounds)
  },
  dragPreview: {
    show: (payload) => ipcRenderer.send(IPC.dragPreviewShow, payload),
    move: () => ipcRenderer.send(IPC.dragPreviewMove),
    hide: () => ipcRenderer.send(IPC.dragPreviewHide),
    commit: () => ipcRenderer.send(IPC.dragPreviewCommit)
  },
  ui: {
    setZoom: (factor) => {
      webFrame.setZoomFactor(factor)
      ipcRenderer.send(IPC.uiZoom, factor)
    },
    getZoom: () => webFrame.getZoomFactor()
  },
  theme: {
    get: () => ipcRenderer.invoke(IPC.themeGet),
    set: (pref) => ipcRenderer.invoke(IPC.themeSet, pref),
    onChange: (cb) => subscribe(IPC.themeChanged, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    setLanguage: (language) => ipcRenderer.send(IPC.settingsSetLanguage, language)
  },
  net: {
    resolve: (host) => ipcRenderer.invoke(IPC.netResolve, host)
  },
  tray: {
    setLayouts: (list) => ipcRenderer.send(IPC.trayLayouts, list),
    onOpenLayout: (cb) => subscribe(IPC.trayOpenLayout, cb)
  },
  app: {
    onHidden: (cb) => subscribe(IPC.appHidden, () => cb())
  },
  notify: {
    show: (opts) => ipcRenderer.send(IPC.notifyShow, opts),
    onClick: (cb) => subscribe(IPC.notifyClicked, cb),
    clear: (tabId) => ipcRenderer.send(IPC.notifyClear, tabId)
  },
  downloads: {
    begin: (name) => ipcRenderer.invoke(IPC.downloadBegin, name),
    write: (id, data) => ipcRenderer.invoke(IPC.downloadWrite, id, data),
    end: (id, ok) => ipcRenderer.invoke(IPC.downloadEnd, id, ok),
    showInFolder: (target) => ipcRenderer.send(IPC.downloadShow, target)
  },
  serverMeta: {
    getAll: () => ipcRenderer.invoke(IPC.serverMetaGetAll),
    set: (assetId, patch) => ipcRenderer.invoke(IPC.serverMetaSet, assetId, patch)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC.aiGetConfig),
    setConfig: (patch) => ipcRenderer.invoke(IPC.aiSetConfig, patch),
    setSecret: (provider, key, value) => ipcRenderer.invoke(IPC.aiSetSecret, provider, key, value),
    test: (language) => ipcRenderer.invoke(IPC.aiTest, language),
    suggest: (request) => ipcRenderer.invoke(IPC.aiSuggest, request),
    listModels: (provider) => ipcRenderer.invoke(IPC.aiListModels, provider)
  },
  update: {
    getState: () => ipcRenderer.invoke(IPC.updateGetState),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.send(IPC.updateInstall),
    setAutoCheck: (enabled) => ipcRenderer.invoke(IPC.updateSetAuto, enabled),
    onChange: (cb) => subscribe(IPC.updateState, cb)
  },
  transfer: {
    save: (payload, username) => ipcRenderer.invoke(IPC.transferSave, payload, username),
    open: () => ipcRenderer.invoke(IPC.transferOpen)
  }
}

contextBridge.exposeInMainWorld('jumpdesk', api)
