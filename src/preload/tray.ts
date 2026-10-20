import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { TRAY_POPUP_IPC as IPC, type TrayPopupApi, type TrayPopupState } from '@shared/tray-popup'

/**
 * Tepsi açılır penceresinin önyüklemesi: yalnız düzen listesini alır ve seçimi bildirir; ana pencerenin API'sine
 * erişimi yoktur. Dil ve platform, ortak arayüz kodunun (`t()`) okuyabilmesi için `window.jumpdesk` altında da durur.
 */
const initial = ipcRenderer.sendSync(IPC.init) as TrayPopupState

const api: TrayPopupApi = {
  initial,
  onState: (cb) => {
    const listener = (_e: IpcRendererEvent, state: TrayPopupState): void => cb(state)
    ipcRenderer.on(IPC.state, listener)
    return () => ipcRenderer.removeListener(IPC.state, listener)
  },
  choose: (layoutId) => ipcRenderer.send(IPC.choose, layoutId),
  showApp: () => ipcRenderer.send(IPC.showApp),
  setHeight: (height) => ipcRenderer.send(IPC.height, height),
  close: () => ipcRenderer.send(IPC.close)
}

contextBridge.exposeInMainWorld('jumpdeskTray', api)
contextBridge.exposeInMainWorld('jumpdesk', {
  language: initial.language,
  platform: process.platform
})
