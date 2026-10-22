import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { AiSnippetOption } from '@shared/ai'
import { Button } from '@/components/ui/button'
import { useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { confirmRisk } from './ai-actions'
import { RiskBadge } from './RiskBadge'

/**
 * Snippet düzenleyicinin üstündeki tarif kutusu: ne yapması istendiği yazılır, yapay zeka ad ve komut seçenekleri
 * önerir; "Kullan" seçeneği forma koyar (kaydetme kullanıcıdadır). Yalnız yazılan tarif gönderilir.
 */
export function AiSnippetAssist({
  onPick
}: {
  onPick: (option: AiSnippetOption) => void
}): React.JSX.Element {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const [description, setDescription] = useState('')
  const [state, setState] = useState<
    | { step: 'idle' }
    | { step: 'loading' }
    | { step: 'done'; options: AiSnippetOption[]; note: string }
    | { step: 'error'; error: string }
  >({ step: 'idle' })

  const ask = async (): Promise<void> => {
    if (!description.trim()) return
    setState({ step: 'loading' })
    const result = await jumpdesk.ai.snippet({ description, language })
    setState(
      result.ok
        ? { step: 'done', options: result.options, note: result.note }
        : { step: 'error', error: result.error }
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void ask()
            }
          }}
          placeholder={t('Yapay zekaya tarif edin: ör. nginx hata logunu canlı izle')}
          aria-label={t('Snippet Tarifi')}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-[12.5px] outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/20"
        />
        <Button
          type="button"
          size="sm"
          disabled={!description.trim() || state.step === 'loading'}
          onClick={() => void ask()}
        >
          {state.step === 'loading' && <Loader2 className="animate-spin" />}
          {t('Öner')}
        </Button>
      </div>
      {state.step === 'error' && <p className="text-[11.5px] text-destructive">{state.error}</p>}
      {state.step === 'done' && state.options.length === 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          {state.note || t('Bu tarif için snippet önerisi yok.')}
        </p>
      )}
      {state.step === 'done' && state.options.length > 0 && (
        <div className="space-y-1.5" role="list" aria-label={t('Önerilen Snippetler')}>
          {state.options.map((option) => (
            <div
              key={option.command}
              role="listitem"
              className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12.5px] font-medium">{option.name}</span>
                  <RiskBadge risk={option.risk} />
                </div>
                <code className="block truncate font-mono text-[11.5px]">{option.command}</code>
                {option.description && (
                  <div className="text-[11px] text-muted-foreground">{option.description}</div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void confirmRisk(option.command, option.risk).then((ok) => ok && onPick(option))
                }
              >
                {t('Kullan')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
