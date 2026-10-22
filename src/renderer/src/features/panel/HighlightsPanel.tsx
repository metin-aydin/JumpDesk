import { useState } from 'react'
import { CaseSensitive, Highlighter, Plus, Regex, Trash2 } from 'lucide-react'
import { ColorPicker } from '@/components/ColorPicker'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { compileHighlight, useHighlights, type HighlightRule } from '@/stores/highlights'
import { TransferContextMenu } from '@/features/transfer/TransferContextMenu'
import { FlagToggle } from './AlarmsPanel'
import { AiRuleButton } from '@/features/ai/AiRuleButton'

/** Desenin seçilen renklerle nasıl görüneceği; şeffaf renkte terminalin kendi rengi kalır. */
function Preview({
  text,
  fg,
  bg,
  dim,
  className
}: {
  text: string
  fg: string | null
  bg: string | null
  dim?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'min-w-0 truncate rounded-[4px] px-1.5 py-0.5 font-mono text-[12px] leading-4',
        !fg && 'text-sidebar-foreground',
        dim && 'opacity-50',
        className
      )}
      style={{ color: fg ?? undefined, background: bg ?? undefined }}
    >
      {text}
    </span>
  )
}

/** Kuralın metni ve seçenekleri satırın içinde düzenlenir; Enter ya da satırdan çıkmak kaydeder, Esc vazgeçer. */
function PatternEditor({
  rule,
  onDone
}: {
  rule: HighlightRule
  onDone: () => void
}): React.JSX.Element {
  const t = useT()
  const [pattern, setPattern] = useState(rule.pattern)
  const [regex, setRegex] = useState(rule.regex)
  const [caseSensitive, setCaseSensitive] = useState(rule.caseSensitive)
  const invalid = !pattern.trim() || compileHighlight({ pattern, regex, caseSensitive }) === null
  const commit = (): void => {
    if (!invalid)
      useHighlights.getState().update(rule.id, { pattern: pattern.trim(), regex, caseSensitive })
    onDone()
  }
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit()
      }}
    >
      <input
        value={pattern}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setPattern(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            e.stopPropagation()
            onDone()
          }
        }}
        spellCheck={false}
        aria-label={t('Vurgu Metnini Düzenle')}
        aria-invalid={invalid}
        className={cn(
          'h-6 min-w-0 flex-1 rounded-md border border-sidebar-border bg-background px-1.5 font-mono text-[12px] outline-none focus:border-ring/60',
          invalid && 'border-destructive/70'
        )}
      />
      <FlagToggle
        label={t('Büyük/Küçük Harf Duyarlı')}
        on={caseSensitive}
        onChange={setCaseSensitive}
        Icon={CaseSensitive}
      />
      <FlagToggle label={t('Düzenli İfade')} on={regex} onChange={setRegex} Icon={Regex} />
    </span>
  )
}

function RuleRow({ rule }: { rule: HighlightRule }): React.JSX.Element {
  const t = useT()
  const { update, remove } = useHighlights.getState()
  const [editing, setEditing] = useState(false)
  return (
    <div className="group/rule flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-sidebar-accent/50">
      <Switch
        size="sm"
        checked={rule.enabled}
        onCheckedChange={(enabled) => update(rule.id, { enabled })}
        aria-label={t('{pattern} Vurgusunu Aç/Kapat', { pattern: rule.pattern })}
      />
      {editing ? (
        <PatternEditor rule={rule} onDone={() => setEditing(false)} />
      ) : (
        <span
          className="flex min-w-0 flex-1 cursor-text items-center gap-1"
          title={t('Düzenlemek İçin Çift Tıklayın')}
          onDoubleClick={() => setEditing(true)}
        >
          <Preview text={rule.pattern} fg={rule.fg} bg={rule.bg} dim={!rule.enabled} />
          {rule.caseSensitive && (
            <span
              title={t('Büyük/Küçük Harf Duyarlı')}
              className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
            >
              Aa
            </span>
          )}
          {rule.regex && (
            <span
              title={t('Düzenli İfade')}
              className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground"
            >
              .*
            </span>
          )}
        </span>
      )}
      <ColorPicker
        label={t('Yazı Rengi')}
        value={rule.fg}
        onChange={(fg) => update(rule.id, { fg })}
        className="size-6"
      />
      <ColorPicker
        label={t('Arka Plan Rengi')}
        value={rule.bg}
        onChange={(bg) => update(rule.id, { bg })}
        className="size-6"
      />
      <button
        type="button"
        aria-label={t('{pattern} Vurgusunu Sil', { pattern: rule.pattern })}
        title={t('Kuralı Sil')}
        onClick={() => remove(rule.id)}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/rule:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function AddRuleForm(): React.JSX.Element {
  const t = useT()
  const [pattern, setPattern] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [fg, setFg] = useState<string | null>('#000000')
  const [bg, setBg] = useState<string | null>('#facc15')
  const invalid = Boolean(pattern) && compileHighlight({ pattern, regex, caseSensitive }) === null
  const noColor = !fg && !bg
  const disabled = !pattern.trim() || invalid || noColor
  const add = (): void => {
    if (disabled) return
    useHighlights.getState().add({ pattern: pattern.trim(), regex, caseSensitive, fg, bg })
    setPattern('')
  }
  return (
    <div className="space-y-1.5 border-t border-sidebar-border p-2">
      <div className="flex items-center gap-1">
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t('Kelime ya da düzenli ifade')}
          spellCheck={false}
          aria-label={t('Vurgulanacak Metin')}
          aria-invalid={invalid}
          className={cn(
            'h-7 min-w-0 flex-1 rounded-md border border-sidebar-border bg-background/60 px-2 font-mono text-[12px] outline-none focus:border-ring/60',
            invalid && 'border-destructive/70'
          )}
        />
        <FlagToggle
          label={t('Büyük/Küçük Harf Duyarlı')}
          on={caseSensitive}
          onChange={setCaseSensitive}
          Icon={CaseSensitive}
        />
        <FlagToggle label={t('Düzenli İfade')} on={regex} onChange={setRegex} Icon={Regex} />
        <AiRuleButton
          onPick={(rule) => {
            setPattern(rule.pattern)
            setRegex(rule.regex)
            setCaseSensitive(rule.caseSensitive)
          }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{t('Yazı')}</span>
        <ColorPicker label={t('Yazı Rengi')} value={fg} onChange={setFg} />
        <span className="ml-1 text-[11px] text-muted-foreground">{t('Arka Plan')}</span>
        <ColorPicker label={t('Arka Plan Rengi')} value={bg} onChange={setBg} />
        <span className="flex min-w-0 flex-1 justify-center">
          <Preview text={pattern.trim() || t('Örnek')} fg={fg} bg={bg} />
        </span>
        <button
          type="button"
          aria-label={t('Vurgu Ekle')}
          title={noColor ? t('Yazı Ya Da Arka Plan Rengi Seçin') : t('Vurgu Ekle')}
          disabled={disabled}
          onClick={add}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40"
        >
          <Plus className="size-3.5" /> {t('Ekle')}
        </button>
      </div>
    </div>
  )
}

/**
 * Vurgular: terminal çıktısında eşleşen metin (kelime ya da düzenli ifade) seçilen yazı ve arka plan rengiyle
 * gösterilir. Kurallar tüm açık terminallere hemen uygulanır.
 */
export function HighlightsPanel(): React.JSX.Element {
  const t = useT()
  const rules = useHighlights((s) => s.rules)
  return (
    <TransferContextMenu section="highlights" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            <Highlighter className="size-5" />
            {t(
              'Henüz vurgu yok. Bir kelime ya da düzenli ifade ekleyin; terminalde eşleşen metin seçtiğiniz renklerle gösterilir.'
            )}
          </div>
        ) : (
          rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)
        )}
      </div>
      <AddRuleForm />
    </TransferContextMenu>
  )
}
