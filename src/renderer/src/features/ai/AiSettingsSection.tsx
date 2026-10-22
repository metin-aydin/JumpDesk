import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, RotateCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  aiConfigured,
  AI_PROVIDERS,
  aiProviderInfo,
  type AiField,
  type AiProvider
} from '@shared/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { useAi } from '@/stores/ai'

/** Düz alan: yazılan değer odak dışına çıkınca ya da Enter'da kaydedilir. */
function TextField({
  provider,
  field,
  value
}: {
  provider: AiProvider
  field: AiField
  value: string
}): React.JSX.Element {
  const t = useT()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const listId = `ai-${provider}-${field.key}`
  const save = async (): Promise<void> => {
    if (draft.trim() === value) return
    try {
      setError(null)
      await useAi.getState().setField(provider, field.key, draft)
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err))
    }
  }
  return (
    <div className="space-y-1">
      {field.label && (
        <label htmlFor={listId} className="text-[12.5px] font-medium">
          {t(field.label)}
        </label>
      )}
      <Input
        id={listId}
        value={draft}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && void save()}
        className="h-8 font-mono text-[12.5px]"
      />
      {field.hint && <div className="text-[11.5px] text-muted-foreground">{t(field.hint)}</div>}
      {error && <div className="text-[11.5px] text-destructive">{error}</div>}
    </div>
  )
}

/**
 * Model alanı: sağlayıcının, kayıtlı anahtarla kullanılabilen modelleri sağlayıcıdan alınıp yalnız listeden seçilir.
 * Anahtar (OpenAI uyumlu sunucuda adres) kaydedilmeden liste istenmez ve alan pasif kalır; model adı elle yazılmaz.
 */
function ModelField({
  provider,
  field,
  value,
  ready,
  sourceKey
}: {
  provider: AiProvider
  field: AiField
  value: string
  /** Liste istenebilir mi (anahtar ya da adres kayıtlı). */
  ready: boolean
  /** Liste bu değer değişince yeniden alınır (anahtar, adres, çalışma alanı). */
  sourceKey: string
}): React.JSX.Element {
  const t = useT()
  const [nonce, setNonce] = useState(0)
  /** Son alınan liste; anahtarı şimdiki istekle aynı değilse liste yükleniyor demektir. */
  const [result, setResult] = useState<{
    key: string
    models: { id: string; label: string }[]
    error: string | null
  } | null>(null)
  const requestKey = `${provider}|${sourceKey}|${nonce}`
  const loading = ready && result?.key !== requestKey
  const current = ready && result?.key === requestKey ? result : null
  const error = current?.error ?? null

  useEffect(() => {
    if (!ready) return
    let alive = true
    void jumpdesk.ai.listModels(provider).then((res) => {
      if (!alive) return
      setResult(
        res.ok
          ? { key: requestKey, models: res.models, error: null }
          : { key: requestKey, models: [], error: res.error }
      )
    })
    return () => {
      alive = false
    }
  }, [provider, requestKey, ready])

  const items = current?.models ?? []
  const list =
    value && !items.some((m) => m.id === value) ? [{ id: value, label: value }, ...items] : items
  const usable = items.length > 0
  const id = `ai-${provider}-${field.key}`
  const hint = !ready
    ? provider === 'compatible'
      ? t('Model listesi için önce adresi girin.')
      : t('Model listesi için önce API anahtarını kaydedin.')
    : loading
      ? t('Model listesi yükleniyor…')
      : (error ?? (usable ? null : t('Sağlayıcı kullanılabilir model döndürmedi.')))
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[12.5px] font-medium">
          {t(field.label)}
        </label>
        {ready && (
          <button
            type="button"
            title={t('Model Listesini Yenile')}
            aria-label={t('Model Listesini Yenile')}
            onClick={() => setNonce((n) => n + 1)}
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RotateCw className={cn('size-3', loading && 'animate-spin')} />
          </button>
        )}
        {usable && (
          <span className="text-[11px] text-muted-foreground">
            {t('{n} model', { n: items.length })}
          </span>
        )}
      </div>
      <Select
        value={value || null}
        disabled={!usable}
        items={list.map((m) => ({ value: m.id, label: m.label }))}
        onValueChange={(v) => {
          if (typeof v === 'string' && v) void useAi.getState().setField(provider, field.key, v)
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={t(field.label)}
          className="h-8 w-full font-mono text-[12.5px]"
        >
          <SelectValue placeholder={t('Model seçin')} />
        </SelectTrigger>
        <SelectContent>
          {list.map((m) => (
            <SelectItem key={m.id} value={m.id} className="font-mono text-[12.5px]">
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && (
        <div className={cn('text-[11.5px]', error ? 'text-destructive' : 'text-muted-foreground')}>
          {hint}
        </div>
      )}
    </div>
  )
}

/** Gizli alan: değer hiçbir zaman gösterilmez; kayıtlıysa yalnız "kayıtlı" bilgisi ve değiştir/kaldır düğmeleri. */
function SecretField({
  provider,
  field,
  saved,
  hint
}: {
  provider: AiProvider
  field: AiField
  saved: boolean
  /** Alanın altındaki açıklama (anahtarın nereden alınacağı). */
  hint?: string
}): React.JSX.Element {
  const t = useT()
  const [editing, setEditing] = useState(!saved)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = `ai-${provider}-${field.key}`
  const save = async (): Promise<void> => {
    if (!draft.trim()) return
    try {
      setError(null)
      await useAi.getState().setSecret(provider, field.key, draft)
      setDraft('')
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err))
    }
  }
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[12.5px] font-medium">
        {t(field.label)}
      </label>
      {saved && !editing ? (
        <div className="flex h-8 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-[12.5px]">
          <KeyRound className="size-3.5 text-success" />
          <span className="flex-1 text-muted-foreground">{t('Kayıtlı (gizli)')}</span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t('Değiştir')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => void useAi.getState().setSecret(provider, field.key, null)}
          >
            {t('Kaldır')}
          </Button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <Input
            id={id}
            type="password"
            value={draft}
            placeholder={field.placeholder ? t(field.placeholder) : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            className="h-8 font-mono text-[12.5px]"
          />
          <Button size="sm" className="h-8" disabled={!draft.trim()} onClick={() => void save()}>
            {t('Kaydet')}
          </Button>
          {saved && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(false)}>
              {t('Vazgeç')}
            </Button>
          )}
        </div>
      )}
      {hint && <div className="text-[11.5px] text-muted-foreground">{hint}</div>}
      {error && <div className="text-[11.5px] text-destructive">{error}</div>}
    </div>
  )
}

/** Sağlayıcı alanları: önce gizli alanlar (API anahtarı), sonra diğerleri tanım sırasıyla. */
const orderedFields = (fields: AiField[]): AiField[] => [
  ...fields.filter((f) => f.secret),
  ...fields.filter((f) => !f.secret)
]

const NO_PROVIDER = 'none'

/**
 * Ayarlar → Yapay Zeka: üstte yapay zeka ile açılıp kapatılan özellikler, altta sağlayıcı (açılır liste), API anahtarı
 * (gizli tutulur), model ve sağlayıcının diğer alanları. Bu bölümdeki bilgiler dışa aktarılmaz.
 */
export function AiSettingsSection(): React.JSX.Element {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const config = useAi((s) => s.config)
  const [test, setTest] = useState<{ ok: boolean; text: string } | 'running' | null>(null)

  useEffect(() => {
    void useAi.getState().load()
  }, [])

  if (!config)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t('Yükleniyor…')}
      </div>
    )

  const provider = config.provider
  const info = provider ? aiProviderInfo(provider) : null
  const ready = aiConfigured(config)

  const runTest = async (): Promise<void> => {
    setTest('running')
    const result = await jumpdesk.ai.test(language)
    setTest(
      result.ok
        ? {
            ok: true,
            text: t('Bağlantı çalışıyor: {n} komut önerisi alındı.', {
              n: result.suggestions.length
            })
          }
        : { ok: false, text: result.error }
    )
  }

  const fieldsOf = (p: AiProvider): Record<string, string> => config.fields[p] ?? {}
  const secretsOf = (p: AiProvider): string[] => config.secretsSet[p] ?? []
  const providerItems = [
    { value: NO_PROVIDER, label: t('Kullanma') },
    ...AI_PROVIDERS.map((p) => ({ value: p.id, label: t(p.label) }))
  ]

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Yapay Zeka Özellikleri')}
        </div>
        <div className="divide-y rounded-lg border">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t('Yapay Zeka ile Autocomplete')}</div>
              <div className="text-xs text-muted-foreground">
                {t(
                  'Terminalde Ctrl+Space ile açılan önerilerde yapay zekaya sorabilirsiniz (iki kez Ctrl+Space). Yanıt, seçip komut satırına yazabileceğiniz komut seçenekleri olarak gelir; komut siz Enter’a basmadan çalışmaz.'
                )}
              </div>
              {config.features.autocomplete && !ready && (
                <div className="mt-1 text-[11.5px] text-warning">
                  {t('Kullanmak için önce aşağıda bir sağlayıcı seçip alanlarını doldurun.')}
                </div>
              )}
            </div>
            <Switch
              checked={config.features.autocomplete}
              onCheckedChange={(v) => void useAi.getState().setFeatures({ autocomplete: v })}
              aria-label={t('Yapay Zeka ile Autocomplete')}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Yapay Zeka Sağlayıcısı')}
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <label htmlFor="ai-provider" className="text-[12.5px] font-medium">
              {t('Sağlayıcı')}
            </label>
            <Select
              value={provider ?? NO_PROVIDER}
              items={providerItems}
              onValueChange={(v) => {
                if (typeof v !== 'string') return
                setTest(null)
                void useAi.getState().setProvider(v === NO_PROVIDER ? null : (v as AiProvider))
              }}
            >
              <SelectTrigger
                id="ai-provider"
                aria-label={t('Sağlayıcı')}
                className="h-8 w-full text-[12.5px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-[12.5px]">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!provider && (
              <div className="text-[11.5px] text-muted-foreground">
                {t('Yapay zeka özellikleri kapalı.')}
              </div>
            )}
          </div>

          {info &&
            provider &&
            orderedFields(info.fields).map((field) =>
              field.secret ? (
                <SecretField
                  key={`${provider}:${field.key}`}
                  provider={provider}
                  field={field}
                  saved={secretsOf(provider).includes(field.key)}
                  hint={t(info.description)}
                />
              ) : field.key === 'model' && provider !== 'azure' ? (
                <ModelField
                  key={`${provider}:${field.key}`}
                  provider={provider}
                  field={field}
                  value={fieldsOf(provider)[field.key] ?? ''}
                  ready={
                    provider === 'compatible'
                      ? Boolean(fieldsOf(provider)['baseUrl']?.trim())
                      : secretsOf(provider).includes('apiKey')
                  }
                  sourceKey={[
                    secretsOf(provider).join(','),
                    fieldsOf(provider)['baseUrl'] ?? '',
                    fieldsOf(provider)['workspaceId'] ?? ''
                  ].join('|')}
                />
              ) : (
                <TextField
                  key={`${provider}:${field.key}`}
                  provider={provider}
                  field={field}
                  value={fieldsOf(provider)[field.key] ?? ''}
                />
              )
            )}

          {provider && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!ready || test === 'running'}
                onClick={() => void runTest()}
              >
                {test === 'running' && <Loader2 className="animate-spin" />}
                {t('Bağlantıyı Dene')}
              </Button>
              {test && test !== 'running' && (
                <span
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 text-[12px]',
                    test.ok ? 'text-success' : 'text-destructive'
                  )}
                >
                  {test.ok ? (
                    <CheckCircle2 className="size-3.5 shrink-0" />
                  ) : (
                    <ShieldAlert className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0">{test.text}</span>
                </span>
              )}
            </div>
          )}
          {provider && !config.encryption && (
            <p className="text-[11.5px] text-warning">
              {t(
                'Bu sistemde işletim sisteminin anahtar deposu bulunamadı; API anahtarı yalnız zayıf şifrelemeyle saklanır.'
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-[11.5px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          {t(
            'Bu bölümdeki bilgiler dışa aktarılmaz. API anahtarı işletim sisteminin anahtar deposuyla şifrelenip yalnız sizin kullanıcınıza kaydedilir ve ekrana geri getirilmez. Yapay zekaya sunucudan hiçbir veri gönderilmez; yalnız sorunuz, bu oturumdaki önceki sorularınız ve sunucunun türü (ör. Linux) gider.'
          )}
        </span>
      </div>
    </div>
  )
}
