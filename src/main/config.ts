import { session, type Session } from 'electron'
import { store } from './store'

/** JumpServer çerezlerinin tutulduğu kalıcı oturum; giriş görünümü ve ana pencere bunu paylaşır. */
export const PARTITION = 'persist:jumpserver'

const MAX_RECENT_SERVERS = 5

/**
 * Giriş ekranında seçilen adres; seçilmediyse ortam değişkeni ya da kaydedilen son adres geçerlidir. Uygulamada gömülü
 * bir adres yoktur: hiç girilmediyse boş döner.
 */
let selected: string | null = null

export function serverUrl(): string {
  const raw = selected || process.env['JUMPDESK_SERVER'] || store.settings.server
  return raw.replace(/\/+$/, '')
}

export function serverOrigin(): string {
  return new URL(serverUrl()).origin
}

/**
 * Bağlanılacak JumpServer'ı değiştirir ve son kullanılanlara ekler. Ortam değişkeniyle verilen adres (geliştirme,
 * test) kalıcı ayara yazılmaz.
 */
export function selectServer(url: string): void {
  selected = url
  if (url === process.env['JUMPDESK_SERVER']) return
  const recent = [url, ...(store.settings.recentServers ?? []).filter((s) => s !== url)]
  store.updateSettings({ server: url, recentServers: recent.slice(0, MAX_RECENT_SERVERS) })
}

export function jmsSession(): Session {
  return session.fromPartition(PARTITION)
}
