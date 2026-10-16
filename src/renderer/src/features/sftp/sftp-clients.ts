import { useSyncExternalStore } from 'react'
import { jumpdesk } from '@/lib/jumpdesk'
import { SftpClient, sftpUrl } from './sftp-client'

/**
 * Açık dosya oturumları, anahtara göre (ör. `panel:<sekme>`, `tab:<sekme>`). Panel sekme değiştikçe yeniden
 * bağlanmaz; oturum sekmesi kapanınca `drop` ile kapatılır. Yeniden bağlanmada son token `exchange` edilir.
 */
export interface SftpEntryState {
  client?: SftpClient
  error?: string
  /** Bu oturumun açıldığı ya da türetildiği token. */
  tokenId: string
  server: string
}

/** Dosya oturumu hazırlanırken her aşamada (token, bağlantı, ilk liste) gösterilen tek metin. */
export const FILES_LOADING_LABEL = 'Dosya oturumu açılıyor…'

/** Dosya yöneticisinin açılış klasörü; SFTP kökü dışındaysa kökten başlanır. */
export const FILES_START_PATH = '/tmp'

/** Sağ paneldeki dosya oturumunun anahtarı. */
export const panelKey = (tabId: string): string => `panel:${tabId}`
/** Dosya yöneticisi sekmesinin oturum anahtarı. */
export const filesTabKey = (tabId: string): string => `tab:${tabId}`

const entries = new Map<string, SftpEntryState>()
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

/** İstemcinin kendi durum değişiklikleri (bağlandı, kapandı) istemciye abone olunarak izlenir. */
function attach(key: string, entry: SftpEntryState): void {
  entries.set(key, entry)
  emit()
}

async function create(
  key: string,
  server: string,
  tokenId: string,
  exchange: boolean
): Promise<void> {
  const placeholder: SftpEntryState = { tokenId, server }
  entries.set(key, placeholder)
  emit()
  let id = tokenId
  if (exchange) {
    const res = await jumpdesk.jms.exchangeToken(tokenId)
    if (entries.get(key) !== placeholder) return
    if (!res.ok) {
      attach(key, { tokenId, server, error: res.error })
      return
    }
    id = res.data.id
  }
  attach(key, { tokenId: id, server, client: new SftpClient(sftpUrl(server, id)) })
}

export const sftpClients = {
  get(key: string): SftpEntryState | undefined {
    return entries.get(key)
  },

  /** Anahtar için oturum yoksa açar. `exchange` ile verilen token'dan yenisi türetilir (token başka bir oturumda kullanılıyorsa). */
  ensure(key: string, server: string, tokenId: string, exchange: boolean): void {
    if (entries.has(key)) return
    void create(key, server, tokenId, exchange)
  },

  reconnect(key: string): void {
    const entry = entries.get(key)
    if (!entry) return
    entry.client?.close()
    void create(key, entry.server, entry.tokenId, true)
  },

  drop(key: string): void {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    entry.client?.close()
    emit()
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}

export function useSftpEntry(key: string | undefined): SftpEntryState | undefined {
  return useSyncExternalStore(sftpClients.subscribe, () => (key ? entries.get(key) : undefined))
}
