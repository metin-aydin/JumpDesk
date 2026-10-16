import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw
} from 'lucide-react'
import type { UpdateState } from '@shared/update'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { currentLocale, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { startUpdate, useUpdate } from '@/stores/update'

/** Kurulum türüne göre güncellemenin nasıl kurulduğu. */
const INSTALLER_NOTE: Record<string, string> = {
  appimage: 'AppImage dosyası yeni sürümle değiştirilir ve JumpDesk yeniden açılır.',
  deb: 'Kurulum sırasında sistem parolanız sorulur (paket dpkg ile kurulur) ve JumpDesk yeniden açılır.',
  nsis: 'Windows kurulum programı çalışır ve JumpDesk yeniden açılır.',
  none: 'Bu sürüm kendini güncelleyemez (taşınabilir ya da geliştirme sürümü); yeni sürüm yayın sayfasından indirilir.'
}

function StatusLine({ state }: { state: UpdateState }): React.JSX.Element {
  const t = useT()
  const time = state.checkedAt
    ? new Date(state.checkedAt).toLocaleTimeString(currentLocale(), {
        hour: '2-digit',
        minute: '2-digit'
      })
    : null
  switch (state.status) {
    case 'checking':
      return (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {t('Denetleniyor…')}
        </span>
      )
    case 'up-to-date':
      return (
        <span className="flex items-center gap-1.5 text-success">
          <CheckCircle2 className="size-3.5" /> {t('JumpDesk güncel.')}
          {time && (
            <span className="text-muted-foreground">{t('Son denetim: {time}', { time })}</span>
          )}
        </span>
      )
    case 'available':
      return (
        <span className="font-medium text-primary">
          {t('Yeni sürüm: {version}', { version: state.version ?? '' })}
        </span>
      )
    case 'downloading':
      return (
        <span className="text-muted-foreground">
          {t('İndiriliyor… %{percent}', { percent: state.percent ?? 0 })}
        </span>
      )
    case 'downloaded':
      return (
        <span className="font-medium text-success">
          {t('Sürüm {version} indirildi; kurmak için JumpDesk yeniden başlatılır.', {
            version: state.version ?? ''
          })}
        </span>
      )
    case 'error':
      return <span className="text-destructive">{t('Denetlenemedi.')}</span>
    default:
      return <span className="text-muted-foreground">{t('Henüz denetlenmedi.')}</span>
  }
}

/** Ayarlar → Güncellemeler: sürüm, denetim, indirme ilerlemesi ve kurulum. */
export function UpdatesSection(): React.JSX.Element {
  const t = useT()
  const state = useUpdate((s) => s.state)
  if (!state) return <></>
  const busy = state.status === 'checking' || state.status === 'downloading'
  const releaseUrl = state.releaseUrl
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border px-4 py-3.5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">
              {t('JumpDesk {version}', { version: state.currentVersion })}
            </div>
            <div className="mt-0.5 text-xs">
              <StatusLine state={state} />
            </div>
          </div>
          {(state.status === 'available' || state.status === 'downloading') && (
            <Button size="sm" disabled={busy} onClick={() => startUpdate(state)}>
              {state.installer ? <Download /> : <ExternalLink />}
              {state.installer ? t('İndir ve Kur') : t('İndirme Sayfasını Aç')}
            </Button>
          )}
          {state.status === 'downloaded' && (
            <Button size="sm" onClick={() => jumpdesk.update.install()}>
              <RotateCcw /> {t('Yeniden Başlat ve Kur')}
            </Button>
          )}
          {!['available', 'downloading', 'downloaded'].includes(state.status) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void jumpdesk.update.check()}
            >
              <RefreshCw className={busy ? 'animate-spin' : undefined} />
              {t('Güncellemeleri Denetle')}
            </Button>
          )}
        </div>
        {state.status === 'downloading' && (
          <div
            role="progressbar"
            aria-label={t('İndirme İlerlemesi')}
            aria-valuenow={state.percent ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${state.percent ?? 0}%` }}
            />
          </div>
        )}
        {state.error && (
          <p className="flex items-start gap-1.5 text-[11.5px] break-words text-destructive">
            <AlertTriangle className="mt-px size-3.5 shrink-0" /> {state.error}
          </p>
        )}
        {releaseUrl && state.status !== 'up-to-date' && (
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" /> {t('Sürüm Notları')}
          </a>
        )}
      </div>
      <div className="divide-y rounded-lg border">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{t('Otomatik Denetle')}</div>
            <div className="text-xs text-muted-foreground">
              {t(
                'Açılıştan kısa süre sonra ve altı saatte bir yeni sürüm aranır; bulununca bildirim gösterilir. Hiçbir şey sormadan indirilmez ya da kurulmaz.'
              )}
            </div>
          </div>
          <Switch
            checked={state.autoCheck}
            onCheckedChange={(v) => void jumpdesk.update.setAutoCheck(v)}
            aria-label={t('Otomatik Denetle')}
          />
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        {t(INSTALLER_NOTE[state.installer ?? 'none'])}
      </p>
    </div>
  )
}
