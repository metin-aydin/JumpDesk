import type { AiConfig, AiFeatures, AiProvider, AiSuggestRequest, AiSuggestResult } from './ai'
import type {
  ApiResult,
  AppSettings,
  AssetDetail,
  AuthState,
  ConnectionToken,
  ConnectionTokenRequest,
  ConnectMethod,
  JmsTreeNode,
  ResolvedTheme,
  ServerMeta,
  SmartEndpoint,
  UserProfile,
  WindowState
} from './types'

export const IPC = {
  authState: 'auth:state',
  authLogin: 'auth:login',
  authCancel: 'auth:cancel',
  authLogout: 'auth:logout',
  authChanged: 'auth:changed',
  authViewBounds: 'auth:view-bounds',
  jmsTreeChildren: 'jms:tree-children',
  jmsTreeSearch: 'jms:tree-search',
  jmsTreeAsset: 'jms:tree-asset',
  jmsTreeChildrenById: 'jms:tree-children-by-id',
  netResolve: 'net:resolve',
  notifyShow: 'notify:show',
  notifyClear: 'notify:clear',
  notifyClicked: 'notify:clicked',
  downloadBegin: 'download:begin',
  downloadWrite: 'download:write',
  downloadEnd: 'download:end',
  downloadShow: 'download:show',
  jmsAssetDetail: 'jms:asset-detail',
  jmsConnectionToken: 'jms:connection-token',
  jmsExchangeToken: 'jms:exchange-token',
  jmsConnectMethods: 'jms:connect-methods',
  jmsSmartEndpoint: 'jms:smart-endpoint',
  jmsProfile: 'jms:profile',
  jmsAvatar: 'jms:avatar',
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winState: 'win:state',
  winStateChanged: 'win:state-changed',
  winFocus: 'win:focus',
  detachedControl: 'detached:control',
  uiZoom: 'ui:zoom',
  platformInfo: 'platform:info',
  windowBounds: 'windows:bounds',
  dragPreviewShow: 'drag-preview:show',
  dragPreviewMove: 'drag-preview:move',
  dragPreviewHide: 'drag-preview:hide',
  dragPreviewCommit: 'drag-preview:commit',
  themeGet: 'theme:get',
  themeSet: 'theme:set',
  themeChanged: 'theme:changed',
  settingsGet: 'settings:get',
  settingsSetLanguage: 'settings:set-language',
  serverMetaGetAll: 'server-meta:get-all',
  serverMetaSet: 'server-meta:set',
  transferSave: 'transfer:save',
  transferOpen: 'transfer:open',
  aiGetConfig: 'ai:get-config',
  aiSetConfig: 'ai:set-config',
  aiSetSecret: 'ai:set-secret',
  aiTest: 'ai:test',
  aiSuggest: 'ai:suggest',
  aiListModels: 'ai:list-models'
} as const

/** İçe aktarım dosyası okunurken çıkabilecek hatalar. */
export type TransferError =
  'not-jumpdesk' | 'unsupported-version' | 'corrupt' | 'wrong-format' | 'too-large' | 'read-failed'

export type TransferOpenResult =
  | { status: 'canceled' }
  | { status: 'error'; name: string; error: TransferError }
  | { status: 'ok'; name: string; payload: Record<string, unknown> }

export type DetachedAction = 'minimize' | 'toggle-maximize' | 'focus' | 'place'

/** Sekme pencere dışına sürüklenirken imleçte gösterilen yarı saydam pencere önizlemesi. */
export interface DragPreviewPayload {
  /** Önizleme sekmesinde görünen ad (grup adı ya da sunucu adı). */
  title: string
  /** Gruptaki sunucu sayısı (tek sekmede verilmez). */
  count?: number
  /** Açılacak pencerenin boyutu (ekran pikseli). */
  width: number
  height: number
  mode?: 'vertical' | 'horizontal' | 'grid'
  /** Panellerin anlık görüntüsü: terminalde HTML, grafik oturumda resim (data URL). */
  panes: { title: string; html?: string; image?: string; background?: string }[]
  colors: {
    titlebar: string
    titlebarForeground: string
    background: string
    foreground: string
    border: string
    tab: string
    primary: string
  }
}

/** Ayrı sekme pencerelerinin `window.open` adı bu önekle başlar. */
export const DETACHED_PREFIX = 'jumpdesk-tab-'

export interface ThemeInfo {
  preference: AppSettings['theme']
  resolved: ResolvedTheme
}

/** Renderer'a `window.jumpdesk` olarak açılan köprü. */
export interface JumpDeskApi {
  platform: NodeJS.Platform
  /**
   * Pencere ve imleç konumları biliniyor mu. Wayland'da (XWayland dışında) uygulama ekran konumlarını göremez; sekmeyi
   * pencereler arasında sürüklemek ve önizlemeyi imleçte göstermek bu durumda yapılamaz.
   */
  windowPositions: boolean
  /**
   * Alarm bekleme sürelerinin (ms) ortam değişkeniyle verilen değerleri; verilmediyse null ve Bildirimler ayarı
   * geçerlidir. `alarmWarmupMs`: bağlantıdan sonra, `alarmSnippetWaitMs`: otomatik snippet'ler gönderildikten sonra.
   */
  alarmWarmupMs: number | null
  alarmSnippetWaitMs: number | null
  /** Açılıştaki arayüz dili: son seçilen dil, hiç seçilmediyse İngilizce. */
  language: 'en' | 'tr'
  /** Dil ortam değişkeniyle (JUMPDESK_LANGUAGE, testler) sabitlendi; ayardan değiştirilemez. */
  languageForced: boolean
  auth: {
    getState(): Promise<AuthState>
    /**
     * Verilen JumpServer adresine (verilmezse son adrese) giriş sayfasını açar. Adres JumpServer olarak yanıt
     * vermezse giriş açılmaz, durum hata iletisiyle `logged-out` olur.
     */
    login(server?: string): Promise<void>
    /** Giriş sayfasını kapatıp adres ekranına döner. */
    cancel(): Promise<void>
    logout(): Promise<void>
    setViewBounds(bounds: { x: number; y: number; width: number; height: number } | null): void
    onChange(cb: (state: AuthState) => void): () => void
  }
  jms: {
    profile(): Promise<ApiResult<UserProfile>>
    /** Profil fotoğrafını oturum çereziyle indirip data URL olarak döndürür; yoksa null. */
    avatar(url: string): Promise<string | null>
    treeChildren(key?: string): Promise<ApiResult<JmsTreeNode[]>>
    /** Klasör UUID'siyle çocuklar; dönen varlıkların `pId`'si klasörün anahtarıdır. */
    treeChildrenById(nodeId: string): Promise<ApiResult<JmsTreeNode[]>>
    treeSearch(keyword: string): Promise<ApiResult<JmsTreeNode[]>>
    /** Tek bir varlığın ağaç düğümü; `pId` varlığın bulunduğu klasörün anahtarıdır. */
    treeAsset(assetId: string): Promise<ApiResult<JmsTreeNode[]>>
    assetDetail(assetId: string): Promise<ApiResult<AssetDetail>>
    connectionToken(req: ConnectionTokenRequest): Promise<ApiResult<ConnectionToken>>
    /** Aynı varlık/hesap için yeni tek kullanımlık token üretir (yeniden bağlanma). */
    exchangeToken(tokenId: string): Promise<ApiResult<ConnectionToken>>
    /** Protokol başına bu varlık için sunulan bağlantı yöntemleri (web, applet, native...). */
    connectMethods(assetId: string): Promise<ApiResult<Record<string, ConnectMethod[]>>>
    smartEndpoint(params: {
      protocol: string
      assetId?: string
      token?: string
    }): Promise<ApiResult<SmartEndpoint>>
  }
  win: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    getState(): Promise<WindowState>
    onStateChange(cb: (state: WindowState) => void): () => void
    /** Ana pencereyi öne getirir (ayrı pencereden sekme geri alınınca). */
    focus(): void
  }
  /** Sekmenin taşındığı ayrı pencereler; `name`, pencere açılırken verilen addır. */
  detached: {
    control(name: string, action: DetachedAction): void
    /**
     * Uygulama pencerelerinin içerik alanlarının ekrandaki yeri (ekran pikseli): ana pencere `main`, ayrı pencereler
     * kendi kimlikleriyle. Sekme sürüklenirken imlecin hangi pencerenin üzerinde olduğu bunlarla bulunur.
     */
    bounds(): Promise<Record<string, { x: number; y: number; width: number; height: number }>>
  }
  dragPreview: {
    /** Önizlemeyi imleçte gösterir (yoksa oluşturur). */
    show(payload: DragPreviewPayload): void
    /** Önizlemeyi imlecin yeni yerine taşır. */
    move(): void
    hide(): void
    /** Önizlemeyi gizler; hemen ardından açılan ayrı pencere onun yerinde ve boyutunda açılır. */
    commit(): void
  }
  ui: {
    /** Arayüz yakınlaştırma çarpanı; ana pencereye hemen, ayrı pencerelere ana süreç üzerinden uygulanır. */
    setZoom(factor: number): void
    getZoom(): number
  }
  theme: {
    get(): Promise<ThemeInfo>
    set(preference: AppSettings['theme']): Promise<ThemeInfo>
    onChange(cb: (info: ThemeInfo) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    /** Son seçilen dili ana sürece bildirir (giriş ekranı ve ana süreç iletileri için). */
    setLanguage(language: 'en' | 'tr'): void
  }
  net: {
    /** Ana makine adını istemcinin DNS'iyle IPv4 adresine çözer; çözülemezse null. */
    resolve(host: string): Promise<string | null>
  }
  notify: {
    /** Masaüstü bildirimi; tıklanınca pencere öne gelir ve `onClick` sekme kimliğiyle çağrılır. */
    show(opts: { title: string; body: string; tabId: string }): void
    onClick(cb: (tabId: string) => void): () => void
    /** Gösterilmiş bildirimleri bildirim merkezinden kaldırır (verilirse yalnız o sekmeninkileri). */
    clear(tabId?: string): void
  }
  downloads: {
    /** İndirilenler klasöründe yeni bir dosya açar; aynı ad varsa numaralı ad seçilir. */
    begin(name: string): Promise<{ id: string; path: string }>
    write(id: string, data: Uint8Array): Promise<void>
    /** Dosyayı kapatır; `ok` değilse yarım dosyayı siler. Tamamlanan dosyanın yolunu döndürür. */
    end(id: string, ok: boolean): Promise<string | null>
    showInFolder(path: string): void
  }
  serverMeta: {
    getAll(): Promise<Record<string, ServerMeta>>
    set(assetId: string, patch: Partial<ServerMeta>): Promise<ServerMeta>
  }
  /**
   * Yapay zeka: ayarlar kullanıcıya özel ana süreçte tutulur, API anahtarı şifrelenir ve arayüze hiç verilmez; istekler
   * ana süreçten gider. Dışa aktarıma dahil değildir.
   */
  ai: {
    getConfig(): Promise<AiConfig>
    setConfig(patch: {
      provider?: AiProvider | null
      field?: { provider: AiProvider; key: string; value: string }
      features?: Partial<AiFeatures>
    }): Promise<AiConfig>
    /** Boş değer kayıtlı anahtarı siler. */
    setSecret(provider: AiProvider, key: string, value: string | null): Promise<AiConfig>
    test(language: 'en' | 'tr'): Promise<AiSuggestResult>
    /** Sağlayıcının, kayıtlı anahtarla kullanılabilen modelleri (Azure'da boş). */
    listModels(
      provider: AiProvider
    ): Promise<{ ok: true; models: { id: string; label: string }[] } | { ok: false; error: string }>
    suggest(request: AiSuggestRequest): Promise<AiSuggestResult>
  }
  /** Ayar ve kayıtların şifreli `.jumpdesk` dosyasına aktarımı. */
  transfer: {
    /** Kayıt penceresini açar (önerilen ad kullanıcı adı + tarih); vazgeçilirse null. */
    save(payload: unknown, username: string): Promise<{ path: string } | null>
    /** Dosya seçtirir, çözer ve doğrular. */
    open(): Promise<TransferOpenResult>
  }
}
