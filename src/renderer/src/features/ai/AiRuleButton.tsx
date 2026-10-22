import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import type { AiRuleOption } from '@shared/ai'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { aiFeatureReady, ensureAiLoaded, useAi } from '@/stores/ai'
import { compileRule } from '@/stores/alarms'

const FIELD_CLASS =
  'w-full rounded-md border bg-background px-2.5 text-[12px] outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/20'

const matchesSample = (option: AiRuleOption, sample: string): boolean =>
  compileRule({ id: '', enabled: true, ...option })?.test(sample) ?? false

function RuleForm({ onPick }: { onPick: (rule: AiRuleOption) => void }): React.JSX.Element {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const [description, setDescription] = useState('')
  const [sample, setSample] = useState('')
  const [state, setState] = useState<
    | { step: 'idle' }
    | { step: 'loading' }
    | { step: 'done'; options: AiRuleOption[]; note: string; sample: string }
    | { step: 'error'; error: string }
  >({ step: 'idle' })

  const ask = async (): Promise<void> => {
    if (!description.trim()) return
    setState({ step: 'loading' })
    const result = await jumpdesk.ai.rule({ description, sample, language })
    setState(
      result.ok
        ? { step: 'done', options: result.options, note: result.note, sample: sample.trim() }
        : { step: 'error', error: result.error }
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
        <Sparkles className="size-3.5 text-primary" /> {t('Yapay Zekayla Kural Oluştur')}
      </div>
      <textarea
        autoFocus
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void ask()
          }
        }}
        rows={2}
        placeholder={t('Neyi yakalamak istiyorsunuz? ör. Java bellek hataları ve bağlantı reddi')}
        aria-label={t('Yakalanacak Şeyin Tarifi')}
        className={cn(FIELD_CLASS, 'resize-none py-1.5')}
      />
      <input
        value={sample}
        onChange={(e) => setSample(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void ask()}
        placeholder={t('Örnek satır (isteğe bağlı)')}
        aria-label={t('Örnek Satır')}
        spellCheck={false}
        className={cn(FIELD_CLASS, 'h-7 font-mono')}
      />
      <Button
        size="sm"
        className="w-full"
        disabled={!description.trim() || state.step === 'loading'}
        onClick={() => void ask()}
      >
        {state.step === 'loading' ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {t('Kural Öner')}
      </Button>
      {state.step === 'error' && <p className="text-[11.5px] text-destructive">{state.error}</p>}
      {state.step === 'done' && state.options.length === 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          {state.note || t('Bu tarif için kural önerisi yok.')}
        </p>
      )}
      {state.step === 'done' && state.options.length > 0 && (
        <div className="space-y-1.5" role="list" aria-label={t('Önerilen Kurallar')}>
          {state.options.map((option) => {
            const hit = state.sample ? matchesSample(option, state.sample) : null
            return (
              <div
                key={`${option.regex}|${option.caseSensitive}|${option.pattern}`}
                role="listitem"
                className="rounded-md border px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px]">
                    {option.pattern}
                  </code>
                  {option.caseSensitive && (
                    <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      Aa
                    </span>
                  )}
                  {option.regex && (
                    <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      .*
                    </span>
                  )}
                  <Button size="xs" variant="outline" onClick={() => onPick(option)}>
                    {t('Kullan')}
                  </Button>
                </div>
                {option.description && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {option.description}
                  </div>
                )}
                {hit !== null && (
                  <div
                    className={cn(
                      'mt-0.5 flex items-center gap-1 text-[11px]',
                      hit ? 'text-success' : 'text-destructive'
                    )}
                  >
                    {hit ? <Check className="size-3" /> : <X className="size-3" />}
                    {hit ? t('Örnek satırda eşleşiyor') : t('Örnek satırda eşleşmiyor')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Kural formlarının (alarm ve vurgu) yanındaki yapay zeka düğmesi: tariften (ve isteğe bağlı örnek satırdan) kural
 * önerileri alınır; "Kullan" önerinin metnini ve seçeneklerini forma koyar, kuralı ekleme kullanıcıdadır. Özellik
 * kapalıysa ya da sağlayıcı ayarlı değilse düğme görünmez.
 */
export function AiRuleButton({
  onPick
}: {
  onPick: (rule: AiRuleOption) => void
}): React.JSX.Element | null {
  const t = useT()
  const ready = useAi((s) => aiFeatureReady(s.config, 'rules'))
  const [open, setOpen] = useState(false)
  useEffect(ensureAiLoaded, [])
  if (!ready) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t('Yapay Zekayla Kural Oluştur')}
            title={t('Yapay Zekayla Kural Oluştur')}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10"
          />
        }
      >
        <Sparkles className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-0 p-3">
        <RuleForm
          onPick={(rule) => {
            onPick(rule)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
