import { app, net, type BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import {
  AppImageUpdater,
  DebUpdater,
  MacUpdater,
  NsisUpdater,
  type AppUpdater
} from 'electron-updater'
import { IPC } from '@shared/api'
import { compareVersions, type UpdateInstaller, type UpdateState } from '@shared/update'
import { mt } from './i18n'
import { store } from './store'
import { markQuitting } from './quitting'

/** Sürümlerin yayımlandığı GitHub deposu (electron-builder.yml `publish` ile aynı). */
const REPO = 'metin-aydin/JumpDesk'
const RELEASES_PAGE = `https://github.com/${REPO}/releases`
const FIRST_CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Tepsiden yeniden açılan pencerede, son denetim bundan eskiyse yeniden denetlenir (testlerde değiştirilebilir). */
const REOPEN_CHECK_GAP_MS =
  Number(process.env['JUMPDESK_UPDATE_URL'] && process.env['JUMPDESK_TEST_REOPEN_GAP_MS']) || 60_000

/**
 * Testler için: `JUMPDESK_UPDATE_URL` sürüm dosyalarının (latest*.yml) okunduğu adresi, `JUMPDESK_RELEASES_API` uygulama
 * içinden kurulamayan sürümlerde sorulan "son sürüm" adresini değiştirir.
 */
const testFeed = process.env['JUMPDESK_UPDATE_URL']
const releasesApi =
  process.env['JUMPDESK_RELEASES_API'] ?? `https://api.github.com/repos/${REPO}/releases/latest`

let target: BrowserWindow | null = null
let updater: AppUpdater | null = null
let installing = false
/** İndirilen paketin yolu (.deb kurulumu bunu kendisi kurar). */
let downloadedFile: string | null = null
let state: UpdateState = {
  currentVersion: app.getVersion(),
  installer: null,
  status: 'idle',
  autoCheck: true
}

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  if (target && !target.isDestroyed()) target.webContents.send(IPC.updateState, state)
}

/** Hatanın ilk satırı (güncelleyicinin iletileri yanıt başlıklarını ve yığın izini de içerir). */
const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).split('\n')[0].trim()

/**
 * Uygulamanın kendini güncelleyebildiği kurulum türü: Windows'ta NSIS kurulumu (taşınabilir sürüm değil), Linux'ta
 * AppImage ya da .deb paketi, macOS'ta güncelleme dosyası (app-update.yml) bulunan imzalı paket. Geliştirme sürümünde
 * (test adresi verilmedikçe) yoktur.
 */
function detectInstaller(): UpdateInstaller | null {
  if (!app.isPackaged && !testFeed) return null
  if (testFeed && process.env['JUMPDESK_UPDATE_INSTALLER'] === 'deb') return 'deb'
  if (process.platform === 'win32') return process.env['PORTABLE_EXECUTABLE_DIR'] ? null : 'nsis'
  if (process.platform === 'darwin')
    return existsSync(join(process.resourcesPath, 'app-update.yml')) ? 'mac' : null
  if (process.platform !== 'linux') return null
  if (process.env['APPIMAGE']) return 'appimage'
  try {
    const type = readFileSync(join(process.resourcesPath, 'package-type'), 'utf8').trim()
    return type === 'deb' ? 'deb' : null
  } catch {
    return null
  }
}

function createUpdater(kind: UpdateInstaller): AppUpdater {
  const u =
    kind === 'nsis'
      ? new NsisUpdater()
      : kind === 'mac'
        ? new MacUpdater()
        : kind === 'deb'
          ? new DebUpdater()
          : new AppImageUpdater()
  u.autoDownload = false
  u.autoInstallOnAppQuit = false
  if (testFeed) {
    // Paketteki app-update.yml yerine test adresini gösteren bir yapılandırma kullanılır.
    const config = join(app.getPath('userData'), 'test-app-update.yml')
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(
      config,
      `provider: generic\nurl: ${JSON.stringify(testFeed)}\nupdaterCacheDirName: jumpdesk-updater\n`
    )
    u.updateConfigPath = config
    u.forceDevUpdateConfig = true
  }
  u.on('update-downloaded', (info: { downloadedFile?: string }) => {
    downloadedFile = info.downloadedFile ?? null
  })
  u.on('download-progress', (p: { percent: number }) =>
    set({ status: 'downloading', percent: Math.floor(p.percent) })
  )
  // Kurulum hatası (ör. .deb kurulumunda parola penceresinin kapatılması): indirilen dosya durur, yeniden denenebilir.
  u.on('error', (err: unknown) => {
    if (!installing) return
    installing = false
    set({ status: 'downloaded', error: message(err) })
  })
  return u
}

function setAvailable(version: string): void {
  set({
    status: 'available',
    version,
    releaseUrl: `${RELEASES_PAGE}/tag/v${version}`,
    percent: undefined,
    error: undefined
  })
}

/** Uygulama içinden kurulamayan sürümlerde son yayımlanan sürüm GitHub'dan sorulur. */
async function checkLatestRelease(): Promise<void> {
  const res = await net.fetch(releasesApi, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'JumpDesk' }
  })
  if (res.status === 404) {
    set({ status: 'up-to-date' })
    return
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const latest = ((await res.json()) as { tag_name?: string }).tag_name ?? ''
  if (latest && compareVersions(latest, state.currentVersion) > 0)
    setAvailable(latest.replace(/^v/, ''))
  else set({ status: 'up-to-date' })
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (['checking', 'downloading', 'downloaded', 'installing'].includes(state.status)) return state
  set({ status: 'checking', error: undefined })
  try {
    if (updater) {
      const result = await updater.checkForUpdates()
      if (result?.isUpdateAvailable) setAvailable(result.updateInfo.version)
      else set({ status: 'up-to-date' })
    } else {
      await checkLatestRelease()
    }
  } catch (err) {
    set({ status: 'error', error: message(err) })
  }
  set({ checkedAt: Date.now() })
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!updater || state.status !== 'available') return state
  set({ status: 'downloading', percent: 0, error: undefined })
  try {
    await updater.downloadUpdate()
    set({ status: 'downloaded', percent: 100 })
  } catch (err) {
    set({ status: 'available', percent: undefined, error: message(err) })
  }
  return state
}

/**
 * Süreç `no_new_privs` ile mi çalışıyor. Chromium'un yeniden başlatıcısıyla (`app.relaunch()`) açılan süreçte bu bayrak
 * vardır ve alt süreçlere geçer; setuid `pkexec` yönetici yetkisi alamaz. Testlerde `JUMPDESK_TEST_NO_NEW_PRIVS`.
 */
function noNewPrivs(): boolean {
  if (testFeed && process.env['JUMPDESK_TEST_NO_NEW_PRIVS']) return true
  try {
    return /^NoNewPrivs:\s*1\s*$/m.test(readFileSync('/proc/self/status', 'utf8'))
  } catch {
    return false
  }
}

/** Kullanıcının systemd yöneticisine komut çalıştırtan araç (testlerde sahtesi). */
const systemdRun = (): string =>
  (testFeed && process.env['JUMPDESK_TEST_SYSTEMD_RUN']) || 'systemd-run'

/** Kullanıcı yöneticisinde başlatılan uygulamanın masaüstü oturumunu bulması için aktarılan değişkenler. */
const SESSION_ENV = [
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XAUTHORITY',
  'XDG_SESSION_TYPE',
  'XDG_CURRENT_DESKTOP',
  'XDG_SESSION_DESKTOP',
  'DESKTOP_SESSION',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'PATH',
  'JUMPDESK_WAYLAND',
  'JUMPDESK_CHROMIUM_LOGS'
]

/**
 * Komutu bu sürecin alt süreci olarak değil, kullanıcının systemd yöneticisinin geçici bir hizmeti olarak çalıştıran
 * `systemd-run` argümanları; `no_new_privs` devralınmaz. `wait` ile komut bitene kadar beklenir, çıkış kodu ve hata
 * çıktısı geri gelir.
 */
function userServiceArgs(command: string[], wait: boolean): string[] {
  const env = SESSION_ENV.filter((k) => process.env[k]).flatMap((k) => [
    '-E',
    `${k}=${process.env[k]}`
  ])
  return [
    '--user',
    '--quiet',
    '--collect',
    ...(wait ? ['--wait', '--pipe'] : []),
    ...env,
    '--',
    ...command
  ]
}

/** Kullanıcı yöneticisi komut çalıştırabiliyor mu (systemd yoksa ya da kullanıcı veri yolu yoksa hayır). */
function userServiceAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(systemdRun(), userServiceArgs(['true'], true), { stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, 5000)
    child.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

/**
 * Kurulumdan sonra uygulama yeniden açılır. Linux paketinde bu süreç kapandıktan sonra başlatıcıyı kullanıcı
 * yöneticisi çalıştırır: yeni süreç `no_new_privs` taşımaz, sonraki güncellemede de yetki isteyebilir. Kullanıcı
 * yöneticisi yoksa (ve testlerde) `app.relaunch()` kullanılır.
 */
function relaunchAfterInstall(viaUserService: boolean): void {
  const launcher = join(dirname(process.execPath), basename(process.execPath).replace(/-bin$/, ''))
  if (viaUserService && !testFeed && existsSync(launcher)) {
    const waitThenStart = 'while kill -0 "$0" 2>/dev/null; do sleep 0.2; done; exec "$1"'
    spawn(
      systemdRun(),
      userServiceArgs(['/bin/sh', '-c', waitThenStart, String(process.pid), launcher], false),
      { detached: true, stdio: 'ignore' }
    ).unref()
    return
  }
  app.relaunch()
}

/** Hata çıktısının son dolu satırı (pkexec ve dpkg nedeni oraya yazar). */
const lastLine = (text: string): string =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1) ?? ''

/**
 * .deb paketi `pkexec` ile kurulur. Parola penceresi açıkken ana süreç beklemez (electron-updater'ın kurulumu
 * eşzamanlıdır ve pencereyi "yanıt vermiyor" durumuna düşürür); kurulum bitince uygulama yeniden açılır. Bağımlılık
 * eksikse `apt-get install -f` aynı yetkiyle çalışır. Süreç `no_new_privs` taşıyorsa pkexec kullanıcının systemd
 * yöneticisi üzerinden çalıştırılır. Testlerde `JUMPDESK_TEST_DEB_INSTALLER` pkexec yerine çalışır.
 */
async function installDeb(file: string): Promise<void> {
  set({ status: 'installing', error: undefined })
  const testInstaller = testFeed ? process.env['JUMPDESK_TEST_DEB_INSTALLER'] : undefined
  const command = testInstaller
    ? [testInstaller, file]
    : ['pkexec', '/bin/sh', '-c', 'dpkg -i "$1" || apt-get install -f -y', 'jumpdesk-update', file]
  const restricted = noNewPrivs()
  const viaUserService = (restricted || !testFeed) && (await userServiceAvailable())
  const useUserService = restricted && viaUserService
  const child = useUserService
    ? spawn(systemdRun(), userServiceArgs(command, true), { stdio: ['ignore', 'ignore', 'pipe'] })
    : spawn(command[0], command.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000)
  })
  const fail = (error: string): void => {
    installing = false
    if (stderr.trim()) console.error('Güncelleme kurulamadı:', stderr.trim())
    set({ status: 'downloaded', error })
  }
  const reason = (): string => {
    const line = lastLine(stderr)
    return line ? ` (${line})` : ''
  }
  child.once('error', (err) =>
    fail(mt('Kurulum başlatılamadı: {message}', { message: message(err) }))
  )
  child.once('exit', (code) => {
    if (code === 0) {
      store.flushNow()
      relaunchAfterInstall(viaUserService)
      app.quit()
    } else if (code === 126) {
      fail(mt('Parola penceresi kapatıldı; güncelleme kurulmadı.'))
    } else if (code === 127 && restricted && !useUserService) {
      fail(
        mt(
          'JumpDesk bu oturumda yönetici yetkisi isteyemiyor. Tepsi simgesinden "Çıkış" ile kapatıp yeniden açın, sonra tekrar deneyin.'
        )
      )
    } else if (code === 127) {
      fail(mt('Yönetici yetkisi alınamadı; güncelleme kurulmadı.') + reason())
    } else {
      fail(mt('Güncelleme kurulamadı (çıkış kodu {code}).', { code: code ?? '?' }) + reason())
    }
  })
}

/** İndirilen sürümü kurar ve uygulamayı yeniden açar (.deb için sistem parolası sorulur). */
export function installUpdate(): void {
  if (!updater || state.status !== 'downloaded' || installing) return
  installing = true
  set({ error: undefined })
  store.flushNow()
  if (state.installer === 'deb' && downloadedFile) {
    void installDeb(downloadedFile)
    return
  }
  const u = updater
  // macOS'ta kurulum pencereleri app.quit()'ten önce kapatır; pencere kapatılınca tepsiye gizlenmesin.
  markQuitting()
  setImmediate(() => u.quitAndInstall(false, true))
}

export function setAutoCheck(enabled: boolean): UpdateState {
  store.updateSettings({ autoUpdateCheck: enabled })
  set({ autoCheck: enabled })
  return state
}

export const updateState = (): UpdateState => state

/**
 * Pencere tepsiden yeniden gösterildi: uygulama tepside günlerce açık kalabildiği için otomatik denetim açıksa ve son
 * denetimden bu yana bir dakikadan fazla geçtiyse yeni sürüm aranır.
 */
export function checkOnReopen(): void {
  if (!app.isPackaged && !testFeed) return
  if (!state.autoCheck || Date.now() - (state.checkedAt ?? 0) < REOPEN_CHECK_GAP_MS) return
  void checkForUpdates()
}

/** Güncelleyiciyi kurar; otomatik denetim açıksa açılıştan kısa süre sonra ve belirli aralıklarla denetler. */
export function initUpdater(win: BrowserWindow): void {
  target = win
  const installer = detectInstaller()
  try {
    if (installer) updater = createUpdater(installer)
  } catch (err) {
    console.error('Güncelleyici kurulamadı:', err)
  }
  state = {
    ...state,
    installer: updater ? installer : null,
    autoCheck: store.settings.autoUpdateCheck !== false
  }
  // Geliştirme sürümünde (ve testlerde) denetim yalnız elle yapılır.
  if (!app.isPackaged && !testFeed) return
  const auto = (): void => {
    if (state.autoCheck) void checkForUpdates()
  }
  setTimeout(auto, testFeed ? 1000 : FIRST_CHECK_DELAY_MS)
  setInterval(auto, CHECK_INTERVAL_MS)
}
