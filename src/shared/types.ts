export type ThemePreference = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

export interface UserProfile {
  id: string
  username: string
  name: string
  email?: string
  /** Sunucuya göre göreli profil fotoğrafı yolu (ör. `/media/avatar/...`). */
  avatar_url?: string
}

export type AuthState =
  | { status: 'checking'; server: string }
  | { status: 'logged-out'; server: string; error?: string }
  | { status: 'logging-in'; server: string }
  | {
      status: 'logged-in'
      server: string
      user: UserProfile
      /** Kullanıcıya özel kayıtların anahtarı (`userScopeOf`). */
      scope: string
    }

export interface JmsTreeNode {
  id: string
  name: string
  title?: string
  pId: string
  isParent: boolean
  open?: boolean
  iconSkin?: string
  chkDisabled?: boolean
  meta: {
    type: 'node' | 'asset'
    data: {
      id?: string
      key?: string
      value?: string
      platform_type?: string
      org_name?: string
      sftp?: boolean
      name?: string
      address?: string
    }
  }
}

export interface PermedProtocol {
  name: string
  port: number
  public: boolean
  setting: Record<string, unknown>
}

export interface PermedAccount {
  id: string
  alias: string
  name: string
  username: string
  has_username: boolean
  has_secret: boolean
  actions: { value: string; label: string }[]
}

export interface AssetDetail {
  id: string
  name: string
  address: string
  /** Varlığın bulunduğu klasörlerin UUID'leri (bazı sürümlerde `{id}` nesneleri). */
  nodes?: (string | { id: string })[]
  platform: { id: number | string; name: string }
  type?: { value: string; label: string }
  permed_protocols: PermedProtocol[]
  permed_accounts: PermedAccount[]
  comment?: string
}

export interface ConnectMethod {
  value: string
  label: string
  type: 'web' | 'native' | 'applet' | 'virtual_app' | string
  component: string
  endpoint_protocol?: string
  disabled?: boolean
}

export interface ConnectionTokenRequest {
  asset: string
  account: string
  protocol: string
  connect_method: string
  input_username?: string
  input_secret?: string
  connect_options?: Record<string, unknown>
}

export interface ConnectionToken {
  id: string
  value: string
  /** Hesabın alias'ı. */
  account?: string
  protocol: string
  connect_method: string
  expire_time: number
  date_expired: string
  actions?: string[]
}

export interface SmartEndpoint {
  host: string
  https_port: number
  http_port: number
  ssh_port: number
  rdp_port: number
}

export interface ServerMeta {
  name?: string
  address?: string
  platformType?: string
  localIp?: string
  /** Son kullanılan hesabın JumpServer alias'ı; bir sonraki bağlantıda otomatik seçilir. */
  lastAccount?: string
  autoRun?: string[]
  /** Kullanıcının yerelde verdiği etiketler; aramada sunucu adıyla birlikte eşleşir. */
  tags?: string[]
  lastConnectedAt?: number
}

export interface AppSettings {
  theme: ThemePreference
  /** Son bağlanılan JumpServer adresi (hiç girilmediyse boş); giriş ekranında hazır gelir. */
  server: string
  /** Son kullanılan JumpServer adresleri (en yenisi başta). */
  recentServers?: string[]
  /** Son seçilen arayüz dili; giriş ekranı ve ana sürecin iletileri bu dildedir. */
  language?: 'en' | 'tr'
  /** Yeni sürüm kendiliğinden denetlenir (yoksa açık). Bilgisayara özeldir, dışa aktarılmaz. */
  autoUpdateCheck?: boolean
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string; code?: string }

export type WindowState = { maximized: boolean; fullscreen: boolean; focused: boolean }
