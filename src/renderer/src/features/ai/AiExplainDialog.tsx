import { useLayoutEffect, useRef, useState } from 'react'
import { Loader2, Send, Sparkles, SquareTerminal } from 'lucide-react'
import {
  AI_EXPLAIN_MAX_CONTEXT,
  AI_EXPLAIN_MAX_TEXT,
  aiProviderInfo,
  type AiExplanation
} from '@shared/ai'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { terminalRegistry } from '@/features/terminal/registry'
import { useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { useAi } from '@/stores/ai'
import { useAiExplain, type ExplainTarget } from '@/stores/ai-explain'
import { MAIN_WINDOW, useWorkspace, windowIdOf } from '@/stores/workspace'
import { platformOf, writeCommand } from './ai-actions'
import { RiskBadge } from './RiskBadge'

type Stage =
  | { step: 'confirm' }
  | { step: 'loading' }
  | { step: 'result'; answer: AiExplanation }
  | { step: 'error'; error: string }

/** Gönderilen metin: sınırı aşan kısım atılır (pencerede de yalnız gönderilen kısım gösterilir). */
const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)
/** Bağlamın en yakın (son) satırları tutulur. */
const clipTail = (text: string, max: number): string =>
  text.length > max ? text.slice(text.length - max) : text

function ExplainBody({ target }: { target: ExplainTarget }): React.JSX.Element {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const provider = useAi((s) => s.config?.provider ?? null)
  const close = useAiExplain((s) => s.close)
  const [stage, setStage] = useState<Stage>({ step: 'confirm' })
  const [question, setQuestion] = useState('')
  const text = clip(target.text, AI_EXPLAIN_MAX_TEXT)
  const context = clipTail(target.context ?? '', AI_EXPLAIN_MAX_CONTEXT)
  const truncated = text.length < target.text.length
  const lines = (context ? context.split('\n').length : 0) + text.split('\n').length
  const canWrite = Boolean(target.tabId && terminalRegistry.get(target.tabId))
  const previewRef = useRef<HTMLPreElement>(null)
  // Alarmda asıl satır en sondadır (önceki satırlardan sonra); önizleme oraya kaydırılır.
  useLayoutEffect(() => {
    const el = previewRef.current
    if (el && target.subject === 'alarm' && stage.step === 'confirm') el.scrollTop = el.scrollHeight
  }, [target.subject, stage.step])

  const send = async (): Promise<void> => {
    setStage({ step: 'loading' })
    const result = await jumpdesk.ai.explain({
      subject: target.subject,
      text,
      context,
      question,
      platform: platformOf(target.tabId),
      language
    })
    setStage(
      result.ok ? { step: 'result', answer: result } : { step: 'error', error: result.error }
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {target.subject === 'alarm' ? t('Alarmı Yapay Zekaya Sor') : t('Seçimi Yapay Zekaya Sor')}
        </DialogTitle>
        <DialogDescription>
          {stage.step === 'confirm'
            ? t(
                'Aşağıdaki metin {provider} sağlayıcısına gönderilecek. Göndermeden önce parola, anahtar gibi gizli bilgi içermediğinden emin olun.',
                { provider: provider ? t(aiProviderInfo(provider).label) : '' }
              )
            : target.source
              ? t('{source} oturumundaki metnin açıklaması.', { source: target.source })
              : t('Seçili metnin açıklaması.')}
        </DialogDescription>
      </DialogHeader>

      {stage.step === 'confirm' && (
        <div className="space-y-2">
          <pre
            ref={previewRef}
            aria-label={t('Gönderilecek Metin')}
            className="selectable max-h-56 overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"
          >
            {context && <span className="text-muted-foreground">{`${context}\n`}</span>}
            {text}
          </pre>
          <div className="text-[11px] text-muted-foreground">
            {t('{lines} satır · {chars} karakter', {
              lines,
              chars: text.length + context.length
            })}
            {truncated && (
              <> · {t('Yalnız ilk {n} karakter gönderilir.', { n: AI_EXPLAIN_MAX_TEXT })}</>
            )}
          </div>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder={t('Ek soru (isteğe bağlı), ör. Bu hatayı nasıl düzeltirim?')}
            aria-label={t('Ek Soru')}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/20"
          />
        </div>
      )}

      {stage.step === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t('Yapay zeka düşünüyor…')}
        </div>
      )}

      {stage.step === 'error' && (
        <p className="selectable rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          {stage.error}
        </p>
      )}

      {stage.step === 'result' && (
        <div data-ai-explanation className="selectable max-h-[55vh] space-y-3 overflow-y-auto">
          {stage.answer.summary ? (
            <p className="text-[13px] leading-relaxed">{stage.answer.summary}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {stage.answer.note || t('Bu metin için açıklama gelmedi.')}
            </p>
          )}
          {stage.answer.points.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted-foreground">
              {stage.answer.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          )}
          {stage.answer.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {t('Önerilen Komutlar')}
              </div>
              {stage.answer.suggestions.map((s) => (
                <div key={s.command} className="rounded-md border px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px]">
                      {s.command}
                    </code>
                    <RiskBadge risk={s.risk} />
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        title={t('Komut Satırına Yaz (Çalıştırmaz)')}
                        onClick={() =>
                          void writeCommand(target.tabId!, s.command, s.risk).then(
                            (ok) => ok && close()
                          )
                        }
                      >
                        <SquareTerminal /> {t('Komut Satırına Yaz')}
                      </Button>
                    )}
                  </div>
                  {s.description && (
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {s.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        {stage.step === 'confirm' ? (
          <>
            <Button variant="ghost" onClick={close}>
              {t('Vazgeç')}
            </Button>
            <Button onClick={() => void send()}>
              <Send /> {t('Gönder')}
            </Button>
          </>
        ) : (
          <>
            {(stage.step === 'error' || stage.step === 'result') && (
              <Button variant="ghost" onClick={() => setStage({ step: 'confirm' })}>
                {t('Yeniden Sor')}
              </Button>
            )}
            <Button variant="outline" onClick={close}>
              {t('Kapat')}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}

/**
 * Seçili çıktıyı ya da alarm olayını yapay zekaya açıklatma: önce gönderilecek metin gösterilir ve onay istenir; onay
 * gelmeden hiçbir şey gönderilmez. Yanıtta özet, maddeler ve oturumun komut satırına yazılabilen komutlar gelir.
 */
export function AiExplainDialog({
  windowId = MAIN_WINDOW
}: {
  /** Pencere, metnin geldiği oturum bu penceredeyse açılır (oturumsuz istek ana pencerede). */
  windowId?: string
}): React.JSX.Element | null {
  const target = useAiExplain((s) => s.target)
  const close = useAiExplain((s) => s.close)
  const here = useWorkspace((s) => {
    const tab = s.detached.find((d) => d.id === target?.tabId)
    return (tab ? windowIdOf(tab) : MAIN_WINDOW) === windowId
  })
  // Ayrı pencerede kapalı bir pencere kökü o penceredeki menüleri bozduğu için yalnız açıkken bağlanır.
  if (windowId !== MAIN_WINDOW && !(target && here)) return null
  return (
    <Dialog open={target !== null && here} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-xl">
        {target && <ExplainBody key={`${target.subject}:${target.text}`} target={target} />}
      </DialogContent>
    </Dialog>
  )
}
