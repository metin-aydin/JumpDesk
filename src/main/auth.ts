import { BrowserWindow, WebContentsView, shell } from 'electron'
import type { AuthState, UserProfile } from '@shared/types'
import { IPC } from '@shared/api'
import { normalizeServerUrl, userScopeOf } from '@shared/user-scope'
import { PARTITION, jmsSession, selectServer, serverUrl } from './config'
import { jmsApi } from './jms/api'
import { jmsEvents } from './jms/http'
import { store } from './store'
import { mt } from './i18n'

type Bounds = { x: number; y: number; width: number; height: number }

const LOGIN_PATH = '/core/auth/login/'
/** Girişten sonra sunucunun yönlendireceği hafif sayfa; buraya varmak girişin bittiğini gösterir. */
const AFTER_LOGIN_PATH = '/api/health/'

/** Adres `checkSession`'da okunur: modül yüklenirken ayar dosyası okunursa veri klasörü (`userData`) henüz ayarlanmamış olur. */
let state: AuthState = { status: 'checking', server: '' }
let window: BrowserWindow | null = null
let loginView: WebContentsView | null = null
let viewBounds: Bounds | null = null

const PROBE_TIMEOUT_MS = 8000

/** Kullanıcı kayıtlarının kapsamı, durum arayüze gitmeden önce ana süreçte de değişir. */
function setState(next: AuthState): void {
  state = next
  store.setUserScope(next.status === 'logged-in' ? next.scope : null)
  window?.webContents.send(IPC.authChanged, state)
}

function loggedIn(user: UserProfile): AuthState {
  const server = serverUrl()
  return { status: 'logged-in', server, user, scope: userScopeOf(server, user.username) }
}

/** Adreste bir JumpServer yanıt veriyor mu (`/api/health/`); vermiyorsa kullanıcıya gösterilecek ileti döner. */
async function probeServer(url: string): Promise<string | null> {
  try {
    const res = await jmsSession().fetch(`${url}/api/health/`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: 'follow'
    })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (body && typeof body === 'object' && 'status' in body) return null
    return mt('{url} bir JumpServer sunucusu gibi yanıt vermedi (HTTP {status}).', {
      url,
      status: res.status
    })
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError' ? mt('zaman aşımı') : mt('bağlanılamadı')
    return mt('{url} adresine ulaşılamadı ({reason}).', { url, reason })
  }
}

export function getAuthState(): AuthState {
  return state
}

export function attachAuthWindow(win: BrowserWindow): void {
  window = win
  jmsEvents.on('unauthorized', () => {
    if (state.status === 'logged-in') {
      setState({
        status: 'logged-out',
        server: serverUrl(),
        error: mt('Oturum süresi doldu, yeniden giriş yapın.')
      })
    }
  })
}

export async function checkSession(): Promise<AuthState> {
  if (!serverUrl()) {
    setState({ status: 'logged-out', server: '' })
    return state
  }
  setState({ status: 'checking', server: serverUrl() })
  const res = await jmsApi.profile()
  if (res.ok) {
    setState(loggedIn(res.data))
  } else {
    setState({
      status: 'logged-out',
      server: serverUrl(),
      error: res.status === 0 ? res.error : undefined
    })
  }
  return state
}

function destroyLoginView(): void {
  if (!loginView) return
  window?.contentView.removeChildView(loginView)
  loginView.webContents.close()
  loginView = null
}

async function onLoginNavigate(url: string): Promise<void> {
  const path = new URL(url).pathname
  if (path.startsWith('/core/auth/')) return
  const res = await jmsApi.profile()
  if (res.ok) {
    destroyLoginView()
    setState(loggedIn(res.data))
  } else if (loginView) {
    void loginView.webContents.loadURL(loginUrl())
  }
}

function loginUrl(): string {
  return `${serverUrl()}${LOGIN_PATH}?next=${encodeURIComponent(AFTER_LOGIN_PATH)}`
}

export function setLoginViewBounds(bounds: Bounds | null): void {
  viewBounds = bounds
  if (!loginView) return
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    loginView.setBounds(bounds)
    loginView.setVisible(true)
  } else {
    loginView.setVisible(false)
  }
}

/**
 * Verilen adres (yoksa son adres) JumpServer olarak doğrulanır; o sunucuda geçerli oturum varsa doğrudan girilir,
 * yoksa giriş sayfası açılır.
 */
export async function startLogin(server?: string): Promise<void> {
  if (!window || loginView) return
  if (server !== undefined) {
    const url = normalizeServerUrl(server)
    if (!url) {
      setState({ status: 'logged-out', server, error: mt('Geçerli bir sunucu adresi girin.') })
      return
    }
    setState({ status: 'checking', server: url })
    const problem = await probeServer(url)
    if (problem) {
      setState({ status: 'logged-out', server: url, error: problem })
      return
    }
    selectServer(url)
    const res = await jmsApi.profile()
    if (res.ok) {
      setState(loggedIn(res.data))
      return
    }
  }
  if (loginView) return
  if (!serverUrl()) {
    setState({ status: 'logged-out', server: '', error: mt('Sunucu adresi girin.') })
    return
  }
  setState({ status: 'logging-in', server: serverUrl() })

  loginView = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  loginView.setBackgroundColor('#00000000')
  window.contentView.addChildView(loginView)
  setLoginViewBounds(viewBounds)

  const wc = loginView.webContents
  wc.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('did-navigate', (_e, url) => void onLoginNavigate(url))
  wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    destroyLoginView()
    setState({
      status: 'logged-out',
      server: serverUrl(),
      error: mt('Giriş sayfası açılamadı ({description}): {url}', { description, url })
    })
  })

  await wc.loadURL(loginUrl()).catch(() => undefined)
}

export function cancelLogin(): void {
  destroyLoginView()
  setState({ status: 'logged-out', server: serverUrl() })
}

export async function logout(): Promise<void> {
  destroyLoginView()
  const ses = jmsSession()
  await ses
    .fetch(`${serverUrl()}/core/auth/logout/`, { credentials: 'include', redirect: 'manual' })
    .catch(() => undefined)
  const cookies = await ses.cookies.get({ url: serverUrl() })
  await Promise.all(cookies.map((c) => ses.cookies.remove(serverUrl(), c.name)))
  await ses.cookies.flushStore()
  setState({ status: 'logged-out', server: serverUrl() })
}
