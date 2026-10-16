import { Check } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { SectionId, SectionSummary } from './bundle'
import { SECTION_META } from './sections'

/**
 * Seçilebilir bölüm kartı: simge, ad, kayıt sayısı ve ayrıntılar. `note` kartın altında ek bilgi (içe aktarımda
 * silinecek mevcut kayıtlar) gösterir. Açıklama kesilmez; yan yana kartlar hizalı kalsın diye iki satırlık yer ayrılır.
 * Seçilemeyen kart soluk görünür, imleç değişmez.
 */
export function SectionCard({
  id,
  summary,
  checked,
  disabled,
  disabledText,
  note,
  onToggle
}: {
  id: SectionId
  summary: SectionSummary | null
  checked: boolean
  disabled?: boolean
  disabledText?: string
  note?: React.ReactNode
  onToggle: () => void
}): React.JSX.Element {
  const t = useT()
  const meta = SECTION_META[id]
  const off = disabled || !summary
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={t(meta.label)}
      disabled={off}
      onClick={onToggle}
      className={cn(
        'group/card relative flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3.5 text-left transition-all',
        'hover:border-foreground/20 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        checked && 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40',
        off && 'cursor-default opacity-55 hover:border-border hover:shadow-none'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-3 right-3 inline-flex size-4.5 items-center justify-center rounded-[5px] border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background'
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex items-start gap-2.5 pr-6">
        <span
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
            meta.tone
          )}
        >
          <meta.Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{t(meta.label)}</span>
          <span className="block min-h-[2lh] text-[11.5px] leading-snug text-muted-foreground">
            {t(meta.description)}
          </span>
        </span>
      </span>
      {summary ? (
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[22px] leading-none font-semibold tabular-nums">
            {summary.count}
          </span>
          <span className="text-[12px] text-muted-foreground">{summary.unit}</span>
          {summary.details.map((d) => (
            <span
              key={d}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {d}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[12px] text-muted-foreground">{disabledText}</span>
      )}
      {note && <span className="text-[11.5px]">{note}</span>}
    </button>
  )
}
