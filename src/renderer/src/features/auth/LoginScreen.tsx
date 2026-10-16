import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Globe,
  Languages,
  Loader2,
  LogIn,
  ShieldAlert
} from 'lucide-react'
import type { AuthState } from '@shared/types'
import { Button } from '@/components/ui/button'
import appIcon from '@/assets/app-icon.svg'
import jumpServerIcon from '@/assets/jumpserver-icon.svg'
import { LANGUAGES, setLanguage, useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/stores/overlay'

function hostOf(server: string): string {
  try {
    return new URL(server).host
  } catch {
    return server
  }
}

/** Adres kutusunda gösterilen biçim: https şeması yazılmaz, http olduğu gibi kalır. */
function displayAddress(server: string): string {
  return server.replace(/^https:\/\//i, '').replace(/\/+$/, '')
}

/** JumpServer giriş sayfasını gösteren WebContentsView bu kutunun konumuna yerleştirilir. */
function LoginViewHost(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (): void => {
      if (useOverlay.getState().open > 0) {
        jumpdesk.auth.setViewBounds(null)
        return
      }
      // Pencere yakınlaştırılmışsa CSS pikselleri pencere koordinatına çevrilir.
      const r = el.getBoundingClientRect()
      const z = jumpdesk.ui.getZoom()
      jumpdesk.auth.setViewBounds({
        x: Math.round(r.left * z),
        y: Math.round(r.top * z),
        width: Math.round(r.width * z),
        height: Math.round(r.height * z)
      })
    }
    report()
    const unsubscribe = useOverlay.subscribe(report)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => {
      unsubscribe()
      ro.disconnect()
      window.removeEventListener('resize', report)
      jumpdesk.auth.setViewBounds(null)
    }
  }, [])

  return (
    <div ref={ref} className="relative flex-1 bg-background">
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    </div>
  )
}

/** Uygulama karosu: rıhtımdaki simge gibi gölgeli ve kabarık. */
function BrandTile({ src, label }: { src: string; label: string }): React.JSX.Element {
  return (
    <figure className="flex flex-col items-center gap-2">
      <img
        src={src}
        alt=""
        draggable={false}
        className="size-[72px] [filter:drop-shadow(0_1.5px_1.5px_rgb(0_0_0/0.16))_drop-shadow(0_8px_14px_rgb(0_0_0/0.22))]"
      />
      <figcaption className="text-[12px] font-medium text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

/** JumpDesk ve JumpServer karoları, aralarında bağlantı simgesiyle. */
function BrandPair(): React.JSX.Element {
  return (
    <div className="flex items-start justify-center gap-3">
      <BrandTile src={appIcon} label="JumpDesk" />
      <div className="flex h-[72px] items-center gap-1.5" aria-hidden>
        <span className="h-px w-5 bg-gradient-to-r from-transparent to-border" />
        <span className="inline-flex size-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
          <ArrowLeftRight className="size-4" />
        </span>
        <span className="h-px w-5 bg-gradient-to-l from-transparent to-border" />
      </div>
      <BrandTile src={jumpServerIcon} label="JumpServer" />
    </div>
  )
}

/** Arayüz dili seçimi; dil ortam değişkeniyle sabitlenmişse gösterilmez. */
function LanguageSwitch(): React.JSX.Element | null {
  const t = useT()
  const language = useLanguage((s) => s.language)
  if (jumpdesk.languageForced) return null
  return (
    <div
      role="group"
      aria-label={t('Dil')}
      className="flex items-center justify-center gap-1 text-[11.5px] text-muted-foreground"
    >
      <Languages className="mr-0.5 size-3.5" />
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          aria-pressed={language === l.id}
          onClick={() => setLanguage(l.id)}
          className={cn(
            'rounded-md px-2 py-0.5 hover:bg-accent hover:text-foreground',
            language === l.id && 'bg-accent font-medium text-foreground'
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** Her girişte önce JumpServer adresi sorulur; son kullanılan adres hazır gelir. */
function ServerForm({
  state
}: {
  state: Extract<AuthState, { status: 'logged-out' }>
}): React.JSX.Element {
  const t = useT()
  const [value, setValue] = useState(() => displayAddress(state.server))
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void jumpdesk.settings.get().then((s) => alive && setRecent(s.recentServers ?? []))
    inputRef.current?.select()
    return () => {
      alive = false
    }
  }, [])

  const submit = (address: string): void => {
    if (address.trim()) void jumpdesk.auth.login(address.trim())
  }
  const others = recent.map(displayAddress).filter((r) => r !== value.trim())

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit(value)
      }}
    >
      <label htmlFor="server-address" className="text-left text-[12.5px] font-medium">
        {t('Sunucu Adresi')}
      </label>
      <div className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <Globe className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          id="server-address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('jump.ornek.com')}
          spellCheck={false}
          autoComplete="off"
          className="selectable min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-left">
          <span className="text-[11.5px] text-muted-foreground">{t('Son kullanılanlar:')}</span>
          {others.map((r) => (
            <button
              key={r}
              type="button"
              title={t('Bu Sunucuya Bağlan')}
              onClick={() => {
                setValue(r)
                submit(r)
              }}
              className="rounded-full border bg-background px-2.5 py-0.5 text-[11.5px] hover:bg-accent"
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {state.error && (
        <div className="flex w-full items-start gap-2 rounded-lg bg-destructive/10 p-3 text-left text-xs text-destructive">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span className="selectable">{state.error}</span>
        </div>
      )}
      <Button type="submit" size="lg" className="mt-1 h-9 w-full" disabled={!value.trim()}>
        {t('Devam')} <ArrowRight />
      </Button>
    </form>
  )
}

function Card({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-muted)_0%,transparent_60%)] p-6">
      <div
        className={cn(
          'flex w-[400px] flex-col items-center gap-5 rounded-2xl border bg-card p-8 text-center shadow-sm',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function LoginScreen({ state }: { state: AuthState }): React.JSX.Element {
  const t = useT()
  if (state.status === 'checking') {
    return (
      <Card>
        <BrandPair />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{t('{host} kontrol ediliyor…', { host: hostOf(state.server) })}</span>
        </div>
      </Card>
    )
  }

  if (state.status === 'logging-in') {
    const [beforeHost, afterHost] = t('{host} hesabınızla giriş yapın').split('{host}')
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 bg-sidebar px-2 text-xs text-muted-foreground">
          <button
            type="button"
            title={t('Sunucu Adresini Değiştir')}
            onClick={() => void jumpdesk.auth.cancel()}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {t('Sunucuyu Değiştir')}
          </button>
          <span className="h-4 w-px bg-border" />
          <LogIn className="size-3.5" />
          <span>
            {beforeHost}
            <span className="text-foreground">{hostOf(state.server)}</span>
            {afterHost}
          </span>
        </div>
        <LoginViewHost />
      </div>
    )
  }

  if (state.status === 'logged-in') return <div className="flex-1" />

  return (
    <Card>
      <BrandPair />
      <div className="space-y-1">
        <h1 className="text-base font-semibold">{t("JumpServer'a Bağlan")}</h1>
        <p className="text-[12.5px] text-muted-foreground">
          {t('Giriş yapacağınız JumpServer sunucusunun adresini girin.')}
        </p>
      </div>
      <ServerForm key={state.server} state={state} />
      <LanguageSwitch />
    </Card>
  )
}
