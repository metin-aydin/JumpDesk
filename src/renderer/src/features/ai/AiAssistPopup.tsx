import { useEffect, useRef, useState } from 'react'
import { Loader2, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react'
import type { AiSuggestion } from '@shared/ai'
import { useLanguage, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/stores/confirm'
import { useDialogs } from '@/stores/dialogs'
import { CursorPopup, type CursorAnchor } from '@/features/terminal/CursorPopup'
import { conversation } from './conversation'

/** Yapay zeka penceresinin açıldığı imleç hücresi. */
export type AiAnchor = CursorAnchor

interface Answer {
  question: string
  suggestions: AiSuggestion[]
  note: string
  /** Bu soruyla birlikte bağlam olarak gönderilen önceki soru sayısı. */
  context: number
}

/**
 * Autocomplete'in yapay zeka kipi: soru yazılır, yanıt autocomplete seçenekleri gibi komut listesi olarak gelir.
 * Seçilen komut komut satırına yazılır ama çalıştırılmaz; kullanıcı Enter'a basınca çalışır. Yapay zekaya yalnız soru,
 * bu oturumdaki önceki sorular ve sunucunun türü gider; sunucudaki hiçbir veri gönderilmez.
 */
export function AiAssistPopup({
  tabId,
  platform,
  anchor,
  onInsert,
  onClose
}: {
  tabId: string
  /** Sunucunun türü (ör. linux). */
  platform: string
  anchor: AiAnchor
  onInsert: (command: string) => void
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  /** Yanıtı beklenen soru; kutu temizlenir, soru sohbet balonunda görünür. */
  const [pending, setPending] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [hasHistory, setHasHistory] = useState(() => conversation.get(tabId).length > 0)
  const listRef = useRef<HTMLDivElement>(null)

  // Klavyeyle seçilen öneri listede görünür alana kaydırılır.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index, answer])

  const ask = async (): Promise<void> => {
    const q = question.trim()
    if (!q || loading) return
    const history = conversation.get(tabId)
    setLoading(true)
    setError(null)
    setPending(q)
    setQuestion('')
    const result = await jumpdesk.ai.suggest({ question: q, history, platform, language })
    setLoading(false)
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      // Soru yeniden denenebilsin diye kutuya geri konur.
      setQuestion((current) => current || q)
      return
    }
    conversation.add(tabId, { question: q, commands: result.suggestions.map((s) => s.command) })
    setHasHistory(true)
    setAnswer({
      question: q,
      suggestions: result.suggestions,
      note: result.note,
      context: history.length
    })
    setIndex(0)
  }

  const pick = async (i: number): Promise<void> => {
    const s = answer?.suggestions[i]
    if (!s) return
    if (s.risk === 'dangerous') {
      const ok = await useConfirm.getState().ask({
        title: t('Riskli Komut'),
        description: t(
          'Bu komut sunucuda geri alınamaz değişiklikler yapabilir ya da güvenliği etkileyebilir: {command}. Komut yalnız komut satırına yazılır; çalıştırmak için ayrıca Enter gerekir.',
          { command: s.command }
        ),
        confirmLabel: t('Yine de Yaz')
      })
      if (!ok) return
    }
    onInsert(s.command)
  }

  const results = loading ? null : answer
  const count = results?.suggestions.length ?? 0
  const shownQuestion = pending ?? results?.question ?? null

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!count) return
      e.preventDefault()
      setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + count) % count)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (count) void pick(index)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Kutuda yazı varsa yeni (devam) soru sorulur; boşsa seçili öneri yazılır.
      if (question.trim()) void ask()
      else if (count) void pick(index)
    }
  }

  return (
    <CursorPopup anchor={anchor} className="w-[min(560px,calc(100vw-16px))]">
      <div
        role="dialog"
        aria-label={t('Yapay Zekaya Sor')}
        className="overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      >
        <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              answer
                ? t('Devam sorusu yazın ya da ↑↓ ile seçip Enter’a basın')
                : t('Ne yapmak istiyorsunuz? (ör. kalan disk alanını göster)')
            }
            aria-label={t('Yapay Zekaya Sorulacak Metin')}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        {shownQuestion && (
          <div className="flex items-end justify-end gap-2 px-2.5 pt-2 pb-1">
            {results && results.context > 0 && (
              <span className="mb-0.5 shrink-0 text-[10.5px] text-muted-foreground">
                {t('+{n} önceki soru bağlamda', { n: results.context })}
              </span>
            )}
            <span className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[12.5px] leading-snug break-words text-primary-foreground shadow-sm">
              {shownQuestion}
            </span>
          </div>
        )}
        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto py-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {loading && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted-foreground">
              <span className="flex gap-1" aria-hidden>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-1.5 animate-bounce rounded-full bg-primary/70"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
              {t('Yapay zeka düşünüyor…')}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 px-2.5 py-1.5 text-[12px] text-destructive">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                className="shrink-0 rounded px-1.5 text-[11.5px] text-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  onClose()
                  useDialogs.getState().setSettings(true)
                }}
              >
                {t('Ayarları Aç')}
              </button>
            </div>
          )}
          {results?.suggestions.map((s, i) => (
            <div
              key={s.command}
              role="option"
              data-index={i}
              aria-selected={i === index}
              onClick={() => void pick(i)}
              onMouseMove={() => setIndex(i)}
              className={cn(
                'cursor-pointer px-2.5 py-1.5',
                i === index ? 'bg-accent text-accent-foreground' : ''
              )}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{s.command}</span>
                {s.risk !== 'safe' && (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-medium',
                      s.risk === 'dangerous'
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-warning/15 text-warning'
                    )}
                  >
                    <TriangleAlert className="size-3" />
                    {s.risk === 'dangerous' ? t('Riskli') : t('Dikkat')}
                  </span>
                )}
              </div>
              {s.description && (
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{s.description}</div>
              )}
            </div>
          ))}
          {results && count === 0 && (
            <div className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
              {results.note || t('Bu soru için komut önerisi yok.')}
            </div>
          )}
          {!loading && !error && !results && !shownQuestion && (
            <div className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
              {t('Sorunuzu yazıp Enter’a basın; yanıt komut seçenekleri olarak gelir.')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t px-2.5 py-1 text-[10.5px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {t('Enter sor · ↑↓ seç · Enter / Tab yaz · Esc kapat · Sunucudan veri gönderilmez')}
          </span>
          {hasHistory && (
            <button
              type="button"
              className="shrink-0 hover:text-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                conversation.clear(tabId)
                setHasHistory(false)
                setAnswer(null)
              }}
            >
              {t('Sohbeti Temizle')}
            </button>
          )}
        </div>
      </div>
    </CursorPopup>
  )
}
