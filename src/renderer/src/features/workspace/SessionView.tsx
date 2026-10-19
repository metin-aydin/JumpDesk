import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, KeyRound, RotateCw, User } from 'lucide-react'
import { LoadingState } from '@/components/LoadingState'
import type { AssetDetail, ConnectionToken, PermedAccount } from '@shared/types'
import { OsBadge } from '@/components/OsBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RdpPane, type RdpState } from '@/features/rdp/RdpPane'
import { TerminalPane } from '@/features/terminal/TerminalPane'
import { FilesTab } from '@/features/sftp/FilesTab'
import {
  FILES_LOADING_LABEL,
  filesTabKey,
  panelKey,
  sftpClients
} from '@/features/sftp/sftp-clients'
import type { KokoState } from '@/features/terminal/koko-connection'
import { t as translate, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { isIpAddress, osKind } from '@/lib/os'
import { snippetById } from '@/stores/snippets'
import { useAuth } from '@/stores/auth'
import { useSessionInfo } from '@/stores/session-info'
import { useServerMeta } from '@/stores/server-meta'
import { useWorkspace, type WorkspaceTab } from '@/stores/workspace'
import { ServerStatusStrip } from '@/features/server-status/ServerStatusStrip'

const TERMINAL_PROTOCOLS = ['ssh', 'telnet']
const GRAPHICAL_PROTOCOLS = ['rdp', 'vnc']
const PROTOCOL_PREFERENCE = ['ssh', 'rdp', 'telnet', 'vnc']

type Phase =
  | { step: 'loading' }
  | { step: 'choose'; detail: AssetDetail; protocol: string }
  | { step: 'credentials'; detail: AssetDetail; protocol: string; account: PermedAccount }
  | { step: 'token'; detail: AssetDetail; protocol: string; account: PermedAccount }
  | {
      step: 'ready'
      detail: AssetDetail
      protocol: string
      account: PermedAccount
      token: ConnectionToken
    }
  | { step: 'error'; message: string }

interface ResolvedMethod {
  value: string
  options: Record<string, unknown>
}

/**
 * SSH/Telnet koko'nun web terminaliyle, RDP/VNC lion ile açılır. Diğer protokoller (ör. HTTP web konsolları)
 * JumpServer'da uzak uygulama (applet) olarak tanımlıysa o applet ile açılır; görüntü yine lion üzerinden gelir.
 */
async function resolveConnectMethod(
  assetId: string,
  protocol: string
): Promise<ResolvedMethod | { error: string }> {
  if (protocol === 'sftp') return { value: 'web_sftp', options: {} }
  if (TERMINAL_PROTOCOLS.includes(protocol)) return { value: 'web_cli', options: {} }
  if (GRAPHICAL_PROTOCOLS.includes(protocol)) return { value: 'web_gui', options: {} }
  const res = await jumpdesk.jms.connectMethods(assetId)
  if (!res.ok) return { error: res.error }
  const methods = (res.data[protocol] ?? []).filter((m) => !m.disabled)
  const applet = methods.find((m) => m.type === 'applet')
  if (applet) return { value: applet.value, options: { appletConnectMethod: 'web' } }
  const web = methods.find((m) => m.type === 'web' && m.component === 'lion')
  if (web) return { value: web.value, options: {} }
  return {
    error: translate(
      "{protocol} bağlantısı için JumpServer'da tanımlı bir uzak uygulama (applet) bulunamadı. Yöneticinizden bu varlık için applet yayınlamasını isteyin.",
      { protocol: protocol.toUpperCase() }
    )
  }
}

function wsUrlFor(server: string, tokenId: string): string {
  const url = new URL(server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/koko/ws/terminal/'
  url.search = `?token=${encodeURIComponent(tokenId)}`
  return url.toString()
}

/** Anonim hesapta (`@ANON`, ör. web konsolları) kimlik bilgisi sorulmaz; giriş hedef sayfanın kendisinde yapılır. */
function hostOf(address: string): string {
  try {
    return address.includes('://') ? new URL(address).hostname : address.replace(/:\d+$/, '')
  } catch {
    return address
  }
}

/**
 * Kabuk entegrasyonu olmayan oturumlarda (RDP, web konsolu, entegrasyonu çalışmayan kabuklar) iç IP: adres zaten IP
 * ise kendisi, değilse istemcinin DNS'iyle çözülen adresi.
 */
async function resolveFallbackIp(detail: AssetDetail): Promise<void> {
  const meta = useServerMeta.getState()
  if (meta.byAsset[detail.id]?.localIp) return
  const host = hostOf(detail.address)
  const ip = isIpAddress(host) ? host : await jumpdesk.net.resolve(host)
  if (ip && !useServerMeta.getState().byAsset[detail.id]?.localIp)
    await meta.update(detail.id, { localIp: ip })
}

/** Hatırlanan hesapla bağlanılamadıysa o hesap unutulur; bir sonraki bağlantıda hesap yeniden sorulur. */
async function forgetAccount(assetId: string, alias: string): Promise<void> {
  const meta = useServerMeta.getState()
  if (meta.byAsset[assetId]?.lastAccount === alias)
    await meta.update(assetId, { lastAccount: undefined })
}

const needsInput = (a: PermedAccount): boolean =>
  a.alias !== '@ANON' && a.username !== '@ANON' && (!a.has_secret || !a.has_username)

function AccountPicker({
  detail,
  protocol,
  files,
  onProtocol,
  onPick
}: {
  detail: AssetDetail
  protocol: string
  /** Dosya yöneticisi için seçim; protokol seçeneği gösterilmez. */
  files?: boolean
  onProtocol: (p: string) => void
  onPick: (a: PermedAccount) => void
}): React.JSX.Element {
  const t = useT()
  const accounts = detail.permed_accounts.filter((a) =>
    a.actions.some((x) => x.value === 'connect')
  )
  const protocols = files
    ? []
    : detail.permed_protocols.map((p) => p.name).filter((p) => p !== 'sftp')
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <OsBadge platformType={detail.type?.value} size="md" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{detail.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {detail.address} · {detail.platform.name}
            </div>
          </div>
        </div>
        {protocols.length > 1 && (
          <div className="inline-flex rounded-md border bg-muted p-0.5">
            {protocols.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onProtocol(p)}
                className={cn(
                  'rounded-[5px] px-3 py-1 text-xs uppercase',
                  p === protocol
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">
            {t(files ? 'Dosya yöneticisi için hesap seçin' : 'Hesap seçin')}
          </div>
          {accounts.length === 0 && (
            <div className="text-sm text-destructive">
              {t('Bu sunucu için bağlanma yetkiniz olan hesap yok.')}
            </div>
          )}
          {accounts.map((a) => (
            <button
              key={a.alias}
              type="button"
              onClick={() => onPick(a)}
              className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-ring/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <User className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.name}</span>
                {a.username !== a.name && (
                  <span className="block truncate text-xs text-muted-foreground">{a.username}</span>
                )}
              </span>
              {needsInput(a) && <KeyRound className="size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CredentialsForm({
  account,
  onSubmit,
  onBack
}: {
  account: PermedAccount
  onSubmit: (username: string, secret: string) => void
  onBack: () => void
}): React.JSX.Element {
  const t = useT()
  const [username, setUsername] = useState(account.has_username ? account.username : '')
  const [secret, setSecret] = useState('')
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (username) onSubmit(username, secret)
        }}
      >
        <div className="text-sm font-medium">{t('Kimlik bilgileri')}</div>
        <Input
          autoFocus={!account.has_username}
          placeholder={t('Kullanıcı adı')}
          value={username}
          disabled={account.has_username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          autoFocus={account.has_username}
          type="password"
          placeholder={t('Parola')}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            {t('Geri')}
          </Button>
          <Button type="submit">{t('Bağlan')}</Button>
        </div>
      </form>
    </div>
  )
}

export function SessionView({
  tab,
  active,
  visible
}: {
  tab: WorkspaceTab
  active: boolean
  visible: boolean
}): React.JSX.Element {
  const t = useT()
  const server = useAuth((s) => (s.state?.status === 'logged-in' ? s.state.server : ''))
  const updateTab = useWorkspace((s) => s.updateTab)
  const [phase, setPhase] = useState<Phase>({ step: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [conn, setConn] = useState<{ state: KokoState; detail?: string }>({ state: 'connecting' })
  const assetId = tab.asset?.id

  const filesView = tab.view === 'files'

  useEffect(
    () => () => {
      useSessionInfo.getState().remove(tab.id)
      sftpClients.drop(panelKey(tab.id))
      sftpClients.drop(filesTabKey(tab.id))
    },
    [tab.id]
  )

  useEffect(() => {
    if (phase.step !== 'ready' || filesView || !TERMINAL_PROTOCOLS.includes(phase.protocol)) return
    useSessionInfo.getState().patch(tab.id, {
      tokenId: phase.token.id,
      protocol: phase.protocol,
      actions: phase.account.actions.map((a) => a.value)
    })
  }, [phase, filesView, tab.id])

  const autoRunCommands = useCallback((): string[] => {
    if (!assetId) return []
    const ids = useServerMeta.getState().byAsset[assetId]?.autoRun ?? []
    return ids.map((id) => snippetById(id)?.command).filter((c): c is string => Boolean(c))
  }, [assetId])

  const onActivity = useCallback(() => {
    const current = useWorkspace.getState().tabs.find((t) => t.id === tab.id)
    if (current && !current.activity) updateTab(tab.id, { activity: true })
  }, [tab.id, updateTab])

  const onIps = useCallback(
    (ips: string[]) => {
      if (assetId && ips[0]) void useServerMeta.getState().update(assetId, { localIp: ips[0] })
    },
    [assetId]
  )

  const requestToken = useCallback(
    async (
      detail: AssetDetail,
      protocol: string,
      account: PermedAccount,
      input?: { username: string; secret: string }
    ) => {
      setPhase({ step: 'token', detail, protocol, account })
      updateTab(tab.id, { status: 'connecting', protocol })
      const method = await resolveConnectMethod(detail.id, protocol)
      if ('error' in method) {
        setPhase({ step: 'error', message: method.error })
        updateTab(tab.id, { status: 'error' })
        return
      }
      const res = await jumpdesk.jms.connectionToken({
        asset: detail.id,
        account: account.alias,
        protocol,
        connect_method: method.value,
        connect_options: method.options,
        input_username: input?.username ?? '',
        input_secret: input?.secret ?? ''
      })
      if (!res.ok) {
        void forgetAccount(detail.id, account.alias)
        setPhase({ step: 'error', message: res.error })
        updateTab(tab.id, { status: 'error' })
        return
      }
      void useServerMeta.getState().update(detail.id, {
        name: detail.name,
        address: detail.address,
        platformType: detail.type?.value,
        lastAccount: account.alias,
        lastConnectedAt: Date.now()
      })
      setConn({ state: 'connecting' })
      setPhase({ step: 'ready', detail, protocol, account, token: res.data })
    },
    [tab.id, updateTab]
  )

  const begin = useCallback(
    (detail: AssetDetail, protocol: string, account: PermedAccount) => {
      if (needsInput(account)) {
        setPhase({ step: 'credentials', detail, protocol, account })
        updateTab(tab.id, { status: 'idle' })
      } else void requestToken(detail, protocol, account)
    },
    [requestToken]
  )

  useEffect(() => {
    if (!assetId) return
    let cancelled = false
    void jumpdesk.jms.assetDetail(assetId).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setPhase({ step: 'error', message: res.error })
        updateTab(tab.id, { status: 'error' })
        return
      }
      const detail = res.data
      const names = detail.permed_protocols.map((p) => p.name)
      const protocol = filesView
        ? names.includes('sftp')
          ? 'sftp'
          : 'ssh'
        : ((tab.protocol && names.includes(tab.protocol) ? tab.protocol : undefined) ??
          PROTOCOL_PREFERENCE.find((p) => names.includes(p)) ??
          names[0] ??
          'ssh')
      const accounts = detail.permed_accounts.filter((a) =>
        a.actions.some((x) => x.value === 'connect')
      )
      if (filesView && tab.sourceToken) {
        void jumpdesk.jms.exchangeToken(tab.sourceToken).then((ex) => {
          if (cancelled) return
          const account = ex.ok ? accounts.find((a) => a.alias === ex.data.account) : undefined
          if (ex.ok && account) {
            setPhase({ step: 'ready', detail, protocol, account, token: ex.data })
            return
          }
          if (ex.ok) {
            const actions = (tab.sourceActions ?? []).map((value) => ({ value, label: value }))
            const fallback: PermedAccount = {
              id: '',
              alias: ex.data.account ?? '',
              name: ex.data.account ?? '',
              username: ex.data.account ?? '',
              has_username: true,
              has_secret: true,
              actions
            }
            setPhase({ step: 'ready', detail, protocol, account: fallback, token: ex.data })
            return
          }
          setPhase({ step: 'choose', detail, protocol })
          updateTab(tab.id, { status: 'idle' })
        })
        return
      }
      const last = tab.chooseAccount
        ? undefined
        : useServerMeta.getState().byAsset[detail.id]?.lastAccount
      const preferred =
        accounts.find((a) => a.alias === last) ?? (accounts.length === 1 ? accounts[0] : undefined)
      if (preferred) begin(detail, protocol, preferred)
      else {
        setPhase({ step: 'choose', detail, protocol })
        updateTab(tab.id, { status: 'idle' })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, attempt])

  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const everConnected = useRef(false)

  const onTerminalState = useCallback(
    (state: KokoState, detail?: string) => {
      const current = phaseRef.current
      if (state === 'error' && current.step === 'ready' && !everConnected.current) {
        void forgetAccount(current.detail.id, current.account.alias)
      }
      if (state === 'connected') everConnected.current = true
      if (state === 'connected' && current.step === 'ready') {
        const graphical = !TERMINAL_PROTOCOLS.includes(current.protocol)
        const integrated =
          current.protocol === 'ssh' && osKind(current.detail.type?.value) === 'linux'
        if (graphical || !integrated) void resolveFallbackIp(current.detail)
        else setTimeout(() => void resolveFallbackIp(current.detail), 10_000)
      }
      setConn({ state, detail })
      updateTab(tab.id, {
        status: state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : state
      })
    },
    [tab.id, updateTab]
  )

  const reconnect = async (): Promise<void> => {
    if (phase.step !== 'ready') return
    setConn({ state: 'connecting' })
    updateTab(tab.id, { status: 'connecting' })
    const res = await jumpdesk.jms.exchangeToken(phase.token.id)
    if (res.ok) setPhase({ ...phase, token: res.data })
    else void requestToken(phase.detail, phase.protocol, phase.account)
  }

  const connectingLabel = t('{name} bağlanıyor…', { name: tab.title })
  if (phase.step === 'loading' || phase.step === 'token') {
    if (filesView) return <LoadingState label={t(FILES_LOADING_LABEL)} />
    return (
      <div className="flex min-h-0 flex-1 bg-terminal">
        <LoadingState boxed label={connectingLabel} />
      </div>
    )
  }
  if (phase.step === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-6 text-destructive" />
        <div className="selectable max-w-md text-sm">{phase.message}</div>
        <Button
          variant="outline"
          onClick={() => {
            setPhase({ step: 'loading' })
            setAttempt((a) => a + 1)
          }}
        >
          <RotateCw /> {t('Tekrar dene')}
        </Button>
      </div>
    )
  }
  if (phase.step === 'choose') {
    return (
      <AccountPicker
        detail={phase.detail}
        protocol={phase.protocol}
        files={filesView}
        onProtocol={(protocol) => setPhase({ ...phase, protocol })}
        onPick={(account) => begin(phase.detail, phase.protocol, account)}
      />
    )
  }
  if (phase.step === 'credentials') {
    return (
      <CredentialsForm
        account={phase.account}
        onBack={() => setPhase({ step: 'choose', detail: phase.detail, protocol: phase.protocol })}
        onSubmit={(username, secret) =>
          void requestToken(phase.detail, phase.protocol, phase.account, { username, secret })
        }
      />
    )
  }

  const overlays = (
    <>
      {conn.state === 'connecting' && (
        <div className="pointer-events-none absolute inset-0 flex bg-terminal">
          <LoadingState boxed label={connectingLabel} />
        </div>
      )}
      {(conn.state === 'closed' || conn.state === 'error') && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t bg-popover/95 px-4 py-2 text-xs backdrop-blur">
          <span
            className={cn(
              'size-2 rounded-full',
              conn.state === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
            )}
          />
          <span className="selectable flex-1 truncate text-muted-foreground">
            {conn.detail ?? t(conn.state === 'error' ? 'Bağlantı hatası' : 'Oturum kapandı')}
          </span>
          <Button size="sm" variant="outline" onClick={() => void reconnect()}>
            <RotateCw /> {t('Yeniden bağlan')}
          </Button>
        </div>
      )}
    </>
  )

  if (filesView) {
    return (
      <FilesTab
        tab={tab}
        server={server}
        tokenId={phase.token.id}
        actions={phase.account.actions.map((a) => a.value)}
      />
    )
  }

  if (!TERMINAL_PROTOCOLS.includes(phase.protocol)) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <RdpPane
          key={phase.token.id}
          tabId={tab.id}
          server={server}
          tokenId={phase.token.id}
          visible={visible}
          active={active}
          onState={(state: RdpState, detail?: string) => onTerminalState(state, detail)}
        />
        {overlays}
      </div>
    )
  }

  const integrate = phase.protocol === 'ssh' && osKind(phase.detail.type?.value) === 'linux'
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {integrate && <ServerStatusStrip tabId={tab.id} onReconnect={() => void reconnect()} />}
      <TerminalPane
        key={phase.token.id}
        tabId={tab.id}
        wsUrl={wsUrlFor(server, phase.token.id)}
        visible={visible}
        active={active}
        integrate={integrate}
        autoRunCommands={autoRunCommands}
        onIps={onIps}
        onActivity={onActivity}
        onState={onTerminalState}
      />
      {overlays}
    </div>
  )
}
