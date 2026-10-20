import { app, net, type BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
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
 * .deb paketi `pkexec` ile kurulur. Parola penceresi açıkken ana süreç beklemez (electron-updater'ın kurulumu
 * eşzamanlıdır ve pencereyi "yanıt vermiyor" durumuna düşürür); kurulum bitince uygulama yeniden açılır. Bağımlılık
 * eksikse `apt-get install -f` aynı yetkiyle çalışır. Testlerde `JUMPDESK_TEST_DEB_INSTALLER` pkexec yerine çalışır.
 */
function installDeb(file: string): void {
  set({ status: 'installing', error: undefined })
  const testInstaller = testFeed ? process.env['JUMPDESK_TEST_DEB_INSTALLER'] : undefined
  const child = testInstaller
    ? spawn(testInstaller, [file], { stdio: 'ignore' })
    : spawn(
        'pkexec',
        ['/bin/sh', '-c', 'dpkg -i "$1" || apt-get install -f -y', 'jumpdesk-update', file],
        { stdio: 'ignore' }
      )
  const fail = (error: string): void => {
    installing = false
    set({ status: 'downloaded', error })
  }
  child.once('error', (err) =>
    fail(mt('Kurulum başlatılamadı: {message}', { message: message(err) }))
  )
  child.once('exit', (code) => {
    if (code === 0) {
      store.flushNow()
      app.relaunch()
      app.quit()
    } else if (code === 126 || code === 127) {
      fail(mt('Parola penceresi kapatıldı ya da yetki verilmedi; güncelleme kurulmadı.'))
    } else {
      fail(mt('Güncelleme kurulamadı (çıkış kodu {code}).', { code: code ?? '?' }))
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
    installDeb(downloadedFile)
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
