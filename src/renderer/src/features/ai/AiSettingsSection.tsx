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
        list={field.options ? `${listId}-options` : undefined}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && void save()}
        className="h-8 font-mono text-[12.5px]"
      />
      {field.options && (
        <datalist id={`${listId}-options`}>
          {field.options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {field.hint && <div className="text-[11.5px] text-muted-foreground">{t(field.hint)}</div>}
      {error && <div className="text-[11.5px] text-destructive">{error}</div>}
    </div>
  )
}

/**
 * Model alanı: sağlayıcının, kayıtlı anahtarla kullanılabilen modelleri sağlayıcıdan alınıp listeden seçilir. Liste
 * alınamazsa (anahtar yok, ağ hatası) model adı elle yazılır.
 */
function ModelField({
  provider,
  field,
  value,
  sourceKey
}: {
  provider: AiProvider
  field: AiField
  value: string
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
  const loading = result?.key !== requestKey
  const models = result?.models ?? null
  const error = result?.error ?? null

  useEffect(() => {
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
  }, [provider, requestKey])

  const items = models ?? []
  const list =
    value && !items.some((m) => m.id === value) ? [{ id: value, label: value }, ...items] : items
  const id = `ai-${provider}-${field.key}`
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[12.5px] font-medium">
          {t(field.label)}
        </label>
        <button
          type="button"
          title={t('Model Listesini Yenile')}
          aria-label={t('Model Listesini Yenile')}
          onClick={() => setNonce((n) => n + 1)}
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCw className={cn('size-3', loading && 'animate-spin')} />
        </button>
        {items.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {t('{n} model', { n: items.length })}
          </span>
        )}
      </div>
      {items.length > 0 ? (
        <Select
          value={value || null}
          items={list.map((m) => ({ value: m.id, label: m.label }))}
          onValueChange={(v) => {
            if (typeof v === 'string' && v) void useAi.getState().setField(provider, field.key, v)
          }}
        >
          <SelectTrigger id={id} className="h-8 w-full font-mono text-[12.5px]">
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
      ) : (
        <>
          <TextField provider={provider} field={{ ...field, label: '' }} value={value} />
          {!loading && (
            <div
              className={cn('text-[11.5px]', error ? 'text-destructive' : 'text-muted-foreground')}
            >
              {error ??
                (provider === 'compatible'
                  ? t('Model listesi için önce adresi girin.')
                  : t('Model listesi için önce API anahtarını kaydedin.'))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Gizli alan: değer hiçbir zaman gösterilmez; kayıtlıysa yalnız "kayıtlı" bilgisi ve değiştir/kaldır düğmeleri. */
function SecretField({
  provider,
  field,
  saved
}: {
  provider: AiProvider
  field: AiField
  saved: boolean
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
      {error && <div className="text-[11.5px] text-destructive">{error}</div>}
    </div>
  )
}

/**
 * Ayarlar → Yapay Zeka: sağlayıcı seçimi, sağlayıcının istediği alanlar (API anahtarı gizli tutulur) ve yapay zeka ile
 * açılıp kapatılan özellikler. Bu bölümdeki bilgiler dışa aktarılmaz.
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

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('Sağlayıcı')}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[null, ...AI_PROVIDERS.map((p) => p.id)].map((id) => {
            const p = id ? aiProviderInfo(id) : null
            const selected = provider === id
            return (
              <button
                key={id ?? 'none'}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setTest(null)
                  void useAi.getState().setProvider(id)
                }}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors hover:border-foreground/20',
                  selected && 'border-primary/60 bg-primary/[0.05] ring-1 ring-primary/40'
                )}
              >
                <div className="text-[13px] font-medium">{p ? t(p.label) : t('Kullanma')}</div>
                <div className="text-[11.5px] leading-snug text-muted-foreground">
                  {p ? t(p.description) : t('Yapay zeka özellikleri kapalı.')}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {info && provider && (
        <div key={provider} className="space-y-3 rounded-lg border p-4">
          {info.fields.map((field) =>
            field.secret ? (
              <SecretField
                key={field.key}
                provider={provider}
                field={field}
                saved={(config.secretsSet[provider] ?? []).includes(field.key)}
              />
            ) : field.key === 'model' && provider !== 'azure' ? (
              <ModelField
                key={field.key}
                provider={provider}
                field={field}
                value={config.fields[provider]?.[field.key] ?? ''}
                sourceKey={[
                  (config.secretsSet[provider] ?? []).join(','),
                  config.fields[provider]?.['baseUrl'] ?? '',
                  config.fields[provider]?.['workspaceId'] ?? ''
                ].join('|')}
              />
            ) : (
              <TextField
                key={field.key}
                provider={provider}
                field={field}
                value={config.fields[provider]?.[field.key] ?? ''}
              />
            )
          )}
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
          {!config.encryption && (
            <p className="text-[11.5px] text-warning">
              {t(
                'Bu sistemde işletim sisteminin anahtar deposu bulunamadı; API anahtarı yalnız zayıf şifrelemeyle saklanır.'
              )}
            </p>
          )}
        </div>
      )}

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
                  {t('Kullanmak için önce bir sağlayıcı seçip alanlarını doldurun.')}
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
