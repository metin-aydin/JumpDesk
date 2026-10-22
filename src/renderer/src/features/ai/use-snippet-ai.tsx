import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { AiExplanation } from '@shared/ai'
import { Button } from '@/components/ui/button'
import { useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { aiFeatureReady, ensureAiLoaded, useAi } from '@/stores/ai'
import { confirmRisk } from './ai-actions'
import { RevealOnMount } from './RevealOnMount'
import { RiskBadge } from './RiskBadge'

/** Snippet özelliği kullanılabilir mi (açık ve sağlayıcı ayarlı). */
export function useSnippetAi(): boolean {
  useEffect(ensureAiLoaded, [])
  return useAi((s) => aiFeatureReady(s.config, 'snippets'))
}

/**
 * Komut alanındaki "Açıkla": yazılan komutu yapay zekaya açıklatır (yalnız komut gider). Düğme komut başlığının
 * yanında, açıklama komut alanının altında gösterilir. Önerilen daha güvenli ya da daha kullanışlı biçimler "Kullan"
 * ile komutun yerine konabilir. Komut değişince açıklama kalkar.
 */
export function useCommandExplain(
  command: string,
  onUse: (command: string) => void
): { button: React.ReactNode; panel: React.ReactNode } {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const [state, setState] = useState<
    | { step: 'idle' }
    | { step: 'loading'; command: string }
    | { step: 'done'; command: string; answer: AiExplanation }
    | { step: 'error'; command: string; error: string }
  >({ step: 'idle' })
  const current = state.step !== 'idle' && state.command === command ? state : null

  const ask = async (): Promise<void> => {
    const text = command.trim()
    if (!text) return
    setState({ step: 'loading', command })
    const result = await jumpdesk.ai.explain({
      subject: 'command',
      text,
      context: '',
      question: '',
      platform: 'linux',
      language
    })
    setState(
      result.ok
        ? { step: 'done', command, answer: result }
        : { step: 'error', command, error: result.error }
    )
  }

  const button = (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      className="text-primary"
      disabled={!command.trim() || current?.step === 'loading'}
      title={t('Komutu Yapay Zekaya Açıklat')}
      onClick={() => void ask()}
    >
      {current?.step === 'loading' ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {t('Açıkla')}
    </Button>
  )

  const panel =
    current?.step === 'error' ? (
      <p className="text-[11.5px] text-destructive">{current.error}</p>
    ) : current?.step === 'done' ? (
      <RevealOnMount
        data-ai-explanation
        className="selectable max-h-48 shrink-0 space-y-1.5 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-[12px]"
      >
        <p>{current.answer.summary || current.answer.note}</p>
        {current.answer.points.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {current.answer.points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        )}
        {current.answer.suggestions.map((s) => (
          <div key={s.command} className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{s.command}</code>
            <RiskBadge risk={s.risk} />
            <Button
              type="button"
              size="xs"
              variant="outline"
              title={s.description}
              onClick={() =>
                void confirmRisk(s.command, s.risk).then((ok) => ok && onUse(s.command))
              }
            >
              {t('Kullan')}
            </Button>
          </div>
        ))}
      </RevealOnMount>
    ) : null

  return { button, panel }
}
