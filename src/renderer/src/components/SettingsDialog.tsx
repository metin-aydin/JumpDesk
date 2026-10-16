import { useState } from 'react'
import {
  ArchiveRestore,
  Bell,
  Check,
  Download,
  Languages,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Type,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { OsBadge } from '@/components/OsBadge'
import { AiSettingsSection } from '@/features/ai/AiSettingsSection'
import { openExport, openImport } from '@/features/transfer/actions'
import { SECTION_IDS } from '@/features/transfer/bundle'
import { SECTION_META } from '@/features/transfer/sections'
import { LANGUAGES, setLanguage, useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { TERMINAL_FONT } from '@/features/terminal/TerminalPane'
import { terminalTheme } from '@/features/terminal/themes'
import { cn } from '@/lib/utils'
import { useDialogs } from '@/stores/dialogs'
import {
  FONT_SIZE_DEFAULTS,
  FONT_SIZE_LIMITS,
  terminalFontSize,
  useFontSizes,
  useTreeScale,
  type FontSizeKey
} from '@/stores/font-sizes'
import {
  NOTIFICATION_DEFAULTS,
  useNotificationSettings,
  WAIT_LIMITS,
  type NotificationSettings
} from '@/stores/notification-settings'
import { useTheme } from '@/stores/theme'

type SectionId = 'language' | 'fonts' | 'notifications' | 'ai' | 'backup'

/** Ayar grupları; adlar Türkçe kaynak metindir, ekranda `t()` ile çevrilir. */
const SECTIONS: { id: SectionId; label: string; Icon: typeof Type }[] = [
  { id: 'language', label: 'Dil', Icon: Languages },
  { id: 'fonts', label: 'Yazı Boyutu', Icon: Type },
  { id: 'notifications', label: 'Bildirimler', Icon: Bell },
  { id: 'ai', label: 'Yapay Zeka', Icon: Sparkles },
  { id: 'backup', label: 'Dışa / İçe Aktarma', Icon: ArchiveRestore }
]

const FONT_ROWS: { key: FontSizeKey; label: string; description: string }[] = [
  {
    key: 'ui',
    label: 'Yazılım Geneli',
    description:
      'Sekmeler, menüler, paneller ve pencereler. Simgeler ve boşluklar da aynı oranda büyür.'
  },
  {
    key: 'tree',
    label: 'Sunucu Ağacı',
    description: 'Soldaki sunucu ağacı ve sunucu arama sonuçları.'
  },
  {
    key: 'terminal',
    label: 'Terminal (SSH)',
    description: 'SSH ve Telnet oturumlarındaki terminal yazısı.'
  }
]

/** Arayüz dili: diller kendi adlarıyla listelenir; ortam değişkeniyle sabitlenmişse seçim kapalıdır. */
function LanguageSection(): React.JSX.Element {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const forced = jumpdesk.languageForced
  return (
    <div className="space-y-2">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {LANGUAGES.map((option) => {
          const active = option.id === language
          return (
            <button
              key={option.id}
              type="button"
              lang={option.id}
              aria-pressed={active}
              disabled={forced}
              onClick={() => setLanguage(option.id)}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-all',
                'hover:border-foreground/20 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
                active && 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40',
                forced && 'cursor-default opacity-55 hover:border-border hover:shadow-none'
              )}
            >
              <span className="min-w-0 flex-1 text-[13px] font-medium">{option.label}</span>
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background'
                )}
              >
                {active && <Check className="size-3" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
      {forced && (
        <p className="text-[11.5px] text-warning">
          {t('Dil şu an ortam değişkeninden geliyor (JUMPDESK_LANGUAGE); seçim uygulanmaz.')}
        </p>
      )}
    </div>
  )
}

const stepButton =
  'inline-flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

function SizeControl({
  sizeKey,
  label
}: {
  sizeKey: FontSizeKey
  label: string
}): React.JSX.Element {
  const t = useT()
  const value = useFontSizes((s) => s[sizeKey])
  const setSize = useFontSizes((s) => s.set)
  const { min, max } = FONT_SIZE_LIMITS[sizeKey]
  const isDefault = value === FONT_SIZE_DEFAULTS[sizeKey]
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={t('{label} Yazısını Küçült', { label })}
        title={t('Küçült', { ctx: 'size' })}
        disabled={value <= min}
        onClick={() => setSize(sizeKey, value - 1)}
        className={stepButton}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={t('{label} Yazı Boyutu', { label })}
        onChange={(e) => setSize(sizeKey, Number(e.target.value))}
        className="w-28 accent-primary"
      />
      <button
        type="button"
        aria-label={t('{label} Yazısını Büyüt', { label })}
        title={t('Büyüt', { ctx: 'size' })}
        disabled={value >= max}
        onClick={() => setSize(sizeKey, value + 1)}
        className={stepButton}
      >
        <Plus className="size-3.5" />
      </button>
      <span className="w-12 text-right text-[13px] font-medium tabular-nums">{value} px</span>
      <button
        type="button"
        aria-label={t('{label} Boyutunu Varsayılana Döndür', { label })}
        title={t('Varsayılana Döndür')}
        onClick={() => setSize(sizeKey, FONT_SIZE_DEFAULTS[sizeKey])}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
          isDefault && 'invisible'
        )}
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  )
}

/** Ağaç satırı ve terminal yazısının seçilen boyutlardaki görünümü. */
function FontPreview(): React.JSX.Element {
  const t = useT()
  const treeScale = useTreeScale()
  const terminalSize = useFontSizes((s) => terminalFontSize(s))
  const theme = terminalTheme(useTheme((s) => s.info.resolved))
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Sunucu Ağacı')}
        </div>
        <div className="rounded-lg border bg-sidebar p-1.5">
          {['web-01', 'app-02'].map((name, i) => (
            <div key={name} style={treeScale === 1 ? undefined : { zoom: treeScale }}>
              <div
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-sidebar-foreground',
                  i === 0 && 'bg-sidebar-accent'
                )}
              >
                <OsBadge platformType="linux" size="xs" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  10.0.0.{11 + i}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Terminal')}
        </div>
        <div
          className="overflow-hidden rounded-lg border px-3 py-2 leading-[1.15] whitespace-pre"
          style={{
            fontFamily: TERMINAL_FONT,
            fontSize: terminalSize,
            background: theme.background,
            color: theme.foreground
          }}
        >
          {/* Örnek komut ve çıktısı her dilde aynıdır. */}
          <span style={{ color: theme.green }}>{'user@server'}</span>:
          <span style={{ color: theme.blue }}>~</span>
          {'$ ls -l /var/log\n'}
          <span style={{ color: theme.brightBlack }}>{'-rw-r--r-- 1 root root 4096'}</span>
          {' app.log'}
        </div>
      </div>
    </div>
  )
}

function FontsSection(): React.JSX.Element {
  const t = useT()
  const reset = useFontSizes((s) => s.reset)
  return (
    <div className="space-y-5">
      <div className="divide-y rounded-lg border">
        {FONT_ROWS.map((row) => (
          <div key={row.key} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t(row.label)}</div>
              <div className="text-xs text-muted-foreground">{t(row.description)}</div>
            </div>
            <SizeControl sizeKey={row.key} label={t(row.label)} />
          </div>
        ))}
      </div>
      <FontPreview />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="size-3.5" /> {t('Tümünü Varsayılana Döndür')}
        </button>
      </div>
    </div>
  )
}

function SettingRow({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  )
}

/** Saniye girişi: −/+ düğmeleri ve elle yazılabilen sayı. */
function SecondsInput({
  settingKey,
  label
}: {
  settingKey: 'connectWaitSec' | 'snippetWaitSec'
  label: string
}): React.JSX.Element {
  const t = useT()
  const value = useNotificationSettings((s) => s[settingKey])
  const set = useNotificationSettings((s) => s.set)
  const change = (v: number): void => set({ [settingKey]: v } as Partial<NotificationSettings>)
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={t('{label} Süresini Azalt', { label })}
        title={t('Azalt')}
        disabled={value <= WAIT_LIMITS.min}
        onClick={() => change(value - 5)}
        className={stepButton}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        min={WAIT_LIMITS.min}
        max={WAIT_LIMITS.max}
        value={value}
        aria-label={t('{label} (Saniye)', { label })}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) change(v)
        }}
        className="h-7 w-14 rounded-md border bg-background px-2 text-right text-[13px] tabular-nums outline-none focus:border-ring/60"
      />
      <button
        type="button"
        aria-label={t('{label} Süresini Artır', { label })}
        title={t('Artır')}
        disabled={value >= WAIT_LIMITS.max}
        onClick={() => change(value + 5)}
        className={stepButton}
      >
        <Plus className="size-3.5" />
      </button>
      <span className="w-6 text-[12px] text-muted-foreground">{t('sn')}</span>
      <button
        type="button"
        aria-label={t('{label} Süresini Varsayılana Döndür', { label })}
        title={t('Varsayılana Döndür')}
        onClick={() => change(NOTIFICATION_DEFAULTS[settingKey])}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
          value === NOTIFICATION_DEFAULTS[settingKey] && 'invisible'
        )}
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  )
}

function NotificationsSection(): React.JSX.Element {
  const t = useT()
  const alarmDesktop = useNotificationSettings((s) => s.alarmDesktop)
  const set = useNotificationSettings((s) => s.set)
  const fromEnv = jumpdesk.alarmWarmupMs !== null || jumpdesk.alarmSnippetWaitMs !== null
  return (
    <div className="space-y-5">
      <div className="divide-y rounded-lg border">
        <SettingRow
          title={t('Alarm Bildirimleri')}
          description={t(
            'Alarm yakalanınca, oturum ekranda değilse masaüstü bildirimi gösterilir. Kapalıyken alarmlar yine Alarmlar panelinde listelenir ve sekmede rozet görünür.'
          )}
        >
          <Switch
            checked={alarmDesktop}
            onCheckedChange={(v) => set({ alarmDesktop: v })}
            aria-label={t('Alarm Bildirimleri')}
          />
        </SettingRow>
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Bağlantıdan Sonra Alarm Bekletme')}
        </div>
        <div className="divide-y rounded-lg border">
          <SettingRow
            title={t('Bağlantıdan Sonra')}
            description={t(
              'Bağlantı kurulduktan sonra bu süre boyunca alarm yakalanmaz (karşılama mesajları, giriş betikleri).'
            )}
          >
            <SecondsInput settingKey="connectWaitSec" label={t('Bağlantıdan Sonra Bekleme')} />
          </SettingRow>
          <SettingRow
            title={t('Otomatik Snippetlerden Sonra')}
            description={t(
              'Sunucuya bağlanınca çalışan snippetler varsa hepsi gönderilene kadar ve gönderildikten sonra bu süre boyunca alarm yakalanmaz.'
            )}
          >
            <SecondsInput settingKey="snippetWaitSec" label={t('Snippetlerden Sonra Bekleme')} />
          </SettingRow>
        </div>
        {fromEnv && (
          <p className="text-[11.5px] text-warning">
            {t(
              'Bekleme süreleri şu an ortam değişkeninden geliyor (JUMPDESK_ALARM_WARMUP_MS, JUMPDESK_ALARM_SNIPPET_WAIT_MS); bu ayarlar uygulanmaz.'
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function BackupSection(): React.JSX.Element {
  const t = useT()
  const close = (): void => useDialogs.getState().setSettings(false)
  // Dosya uzantısı çeviride {file} yer tutucusuyla belirtilir ve eş aralıklı yazıyla gösterilir.
  const [exportBefore, exportAfter] = t(
    'Seçtiğiniz bölümleri şifreli bir {file} dosyasına yazar. Dosya adı kullanıcı adınız ve tarih-saatten oluşur.'
  ).split('{file}')
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Upload className="size-4 text-primary" /> {t('Dışa Aktar')}
          </div>
          <p className="flex-1 text-xs text-muted-foreground">
            {exportBefore}
            <span className="font-mono">{'.jumpdesk'}</span>
            {exportAfter}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              close()
              openExport()
            }}
          >
            <Upload /> {t('Dışa Aktar…')}
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Download className="size-4 text-primary" /> {t('İçe Aktar')}
          </div>
          <p className="flex-1 text-xs text-muted-foreground">
            {t(
              'Bir JumpDesk dosyasını doğrular, içindekileri gösterir; seçtiğiniz bölümler mevcut kayıtlarınızın yerine geçer.'
            )}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              close()
              void openImport()
            }}
          >
            <Download /> {t('İçe Aktar…')}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Aktarılabilen Bölümler')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SECTION_IDS.map((id) => {
            const meta = SECTION_META[id]
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
              >
                <meta.Icon className="size-3.5 text-muted-foreground" /> {t(meta.label)}
              </span>
            )
          })}
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          {t(
            'Ayarlar, snippetler ve kurallar yalnız sizin kullanıcınıza kaydedilir; aynı bilgisayarda başka bir kullanıcı giriş yaptığında bunları görmez.'
          )}
        </p>
      </div>
    </div>
  )
}

const SECTION_INFO: Record<SectionId, { title: string; description: string }> = {
  language: {
    title: 'Dil',
    description:
      'Arayüz dili. Seçim yalnız sizin kullanıcınıza kaydedilir; giriş ekranı son seçilen dilde açılır.'
  },
  fonts: {
    title: 'Yazı Boyutu',
    description: 'Arayüz, sunucu ağacı ve terminal yazı boyutları birbirinden bağımsız ayarlanır.'
  },
  notifications: {
    title: 'Bildirimler',
    description: 'Alarm bildirimleri ve bağlantıdan sonra alarmların bekletildiği süreler.'
  },
  ai: {
    title: 'Yapay Zeka',
    description: 'Yapay zeka sağlayıcısı ve yapay zeka ile çalışan özellikler.'
  },
  backup: {
    title: 'Dışa / İçe Aktarma',
    description:
      'Snippetler, alarm kuralları, vurgular, düzen kayıtları ve uygulama ayarları dosyaya aktarılır.'
  }
}

/** Ayarlar: solda ayar grupları, sağda seçili grubun içeriği. */
export function SettingsDialog(): React.JSX.Element {
  const open = useDialogs((s) => s.settings)
  const setOpen = useDialogs((s) => s.setSettings)
  const t = useT()
  const [section, setSection] = useState<SectionId>('fonts')
  const info = SECTION_INFO[section]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(36rem,85vh)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <nav
          aria-label={t('Ayar Grupları')}
          className="flex w-52 shrink-0 flex-col gap-0.5 border-r bg-muted/40 p-2"
        >
          <DialogTitle className="flex items-center gap-2 px-2 pt-1.5 pb-3 text-sm font-semibold">
            <Settings className="size-4" /> {t('Ayarlar')}
          </DialogTitle>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
                section === id
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <Icon className="size-4" /> {t(label)}
            </button>
          ))}
        </nav>
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <h2 className="text-base font-semibold">{t(info.title)}</h2>
          <DialogDescription className="mt-1 mb-5">{t(info.description)}</DialogDescription>
          {section === 'language' && <LanguageSection />}
          {section === 'fonts' && <FontsSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'ai' && <AiSettingsSection />}
          {section === 'backup' && <BackupSection />}
        </section>
      </DialogContent>
    </Dialog>
  )
}
