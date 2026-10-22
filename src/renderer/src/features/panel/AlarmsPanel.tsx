import { useEffect, useState } from 'react'
import { revealAlarm } from '@/features/alarms/reveal'
import {
  Bell,
  BellOff,
  CaseSensitive,
  Copy,
  Download,
  Eraser,
  ListChecks,
  Plus,
  Regex,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenuItem } from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { AiRuleButton } from '@/features/ai/AiRuleButton'
import { openExport, openImport } from '@/features/transfer/actions'
import { TransferContextMenu } from '@/features/transfer/TransferContextMenu'
import { currentLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { aiFeatureReady, ensureAiLoaded, useAi } from '@/stores/ai'
import { useAiExplain } from '@/stores/ai-explain'
import { compileRule, useAlarms, type AlarmEvent } from '@/stores/alarms'
import { useWorkspace } from '@/stores/workspace'

/** Olay saati geçerli dilin biçimiyle yazılır; biçimleyici her dil için bir kez oluşturulur. */
const timeFormats = new Map<string, Intl.DateTimeFormat>()
function formatTime(ms: number): string {
  const locale = currentLocale()
  let format = timeFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    timeFormats.set(locale, format)
  }
  return format.format(ms)
}

export function FlagToggle({
  label,
  on,
  onChange,
  Icon
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
  Icon: typeof Regex
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
        on
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

function RuleEditor(): React.JSX.Element {
  const t = useT()
  const rules = useAlarms((s) => s.rules)
  const { addRule, updateRule, removeRule } = useAlarms.getState()
  const [pattern, setPattern] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const invalid =
    Boolean(pattern) &&
    compileRule({ id: '', pattern, regex, caseSensitive, enabled: true }) === null
  const add = (): void => {
    if (!pattern.trim() || invalid) return
    addRule({ pattern: pattern.trim(), regex, caseSensitive })
    setPattern('')
  }
  return (
    <div className="space-y-1.5">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="group/rule flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sidebar-accent/50"
        >
          <Switch
            size="sm"
            checked={rule.enabled}
            onCheckedChange={(enabled) => updateRule(rule.id, { enabled })}
            aria-label={t('{pattern} Kuralını Aç/Kapat', { pattern: rule.pattern })}
          />
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-[12px]',
              !rule.enabled && 'text-muted-foreground line-through'
            )}
          >
            {rule.pattern}
          </span>
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
          <button
            type="button"
            aria-label={t('{pattern} Kuralını Sil', { pattern: rule.pattern })}
            title={t('Kuralı Sil')}
            onClick={() => removeRule(rule.id)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/rule:opacity-100 hover:bg-foreground/10 hover:text-foreground"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1 pt-1">
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t('Kelime ya da düzenli ifade')}
          spellCheck={false}
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
        <button
          type="button"
          aria-label={t('Kural Ekle')}
          title={t('Kural Ekle')}
          disabled={!pattern.trim() || invalid}
          onClick={add}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** Olayın geldiği oturuma geçer, oturumu öne çıkarır ve terminalde o satırı aratır. */
function revealEvent(event: AlarmEvent): void {
  revealAlarm(event.tabId, event.line)
}

function EventRow({
  event,
  exists,
  explain
}: {
  event: AlarmEvent
  exists: boolean
  /** Yapay zekaya açıklatma açık. */
  explain: boolean
}): React.JSX.Element {
  const t = useT()
  return (
    <div
      role="button"
      tabIndex={0}
      title={exists ? t('Oturuma Git Ve Satırı Bul') : t('Oturum Kapandı')}
      onClick={() => exists && revealEvent(event)}
      onKeyDown={(e) => e.key === 'Enter' && exists && revealEvent(event)}
      className={cn(
        'group/ev rounded-md px-2 py-1.5 hover:bg-sidebar-accent/60',
        !exists && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span
          title={event.read ? t('Okundu') : t('Okunmadı')}
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            event.read ? 'bg-muted-foreground/40' : 'bg-destructive'
          )}
        />
        <span className="min-w-0 truncate font-medium">{event.source}</span>
        <span className="shrink-0 rounded bg-destructive/10 px-1 font-mono text-[10.5px] text-destructive">
          {event.pattern}
        </span>
        {event.count > 1 && (
          <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
            ×{event.count}
          </span>
        )}
        {/* Düğmeler saatin üstüne bindirilir; görünmeleri satırın yüksekliğini ve diğer öğelerin yerini değiştirmez. */}
        <span className="relative ml-auto flex shrink-0 items-center">
          {explain && (
            <button
              type="button"
              aria-label={t('Yapay Zekaya Sor')}
              title={t('Alarmı Yapay Zekaya Sor')}
              onClick={(e) => {
                e.stopPropagation()
                useAiExplain.getState().open({
                  subject: 'alarm',
                  text: event.line,
                  context: event.context?.join('\n'),
                  tabId: exists ? event.tabId : undefined,
                  source: event.source
                })
              }}
              className="absolute top-1/2 right-6 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-primary opacity-0 group-hover/ev:opacity-100 hover:bg-primary/10 focus-visible:opacity-100"
            >
              <Sparkles className="size-3" />
            </button>
          )}
          <span className="text-[10.5px] text-muted-foreground tabular-nums group-hover/ev:invisible group-focus-within/ev:invisible">
            {formatTime(event.firstAt)}
          </span>
          <button
            type="button"
            aria-label={t('Satırı Kopyala')}
            title={t('Satırı Kopyala')}
            onClick={(e) => {
              e.stopPropagation()
              void navigator.clipboard.writeText(event.line)
            }}
            className="absolute top-1/2 right-0 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/ev:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100"
          >
            <Copy className="size-3" />
          </button>
        </span>
      </div>
      <div className="mt-0.5 line-clamp-2 font-mono text-[11px] break-all text-sidebar-foreground/80">
        {event.line}
      </div>
    </div>
  )
}

/**
 * Alarm kelimeleri: kurallar (kelime ya da düzenli ifade) ve açık terminallerde yakalanan olaylar. Kısa aralıklarla
 * aynı oturumdan aynı kurala gelen satırlar (ör. bir yığın izi) tek olayda sayılır.
 */
export function AlarmsPanel(): React.JSX.Element {
  const t = useT()
  const events = useAlarms((s) => s.events)
  const unread = useAlarms((s) => s.unread)
  const tabIds = useWorkspace((s) => [...s.tabs, ...s.detached].map((t) => t.id).join('|'))
  const ruleCount = useAlarms((s) => s.rules.filter((r) => r.enabled).length)
  const [rulesOpen, setRulesOpen] = useState(false)
  const explain = useAi((s) => aiFeatureReady(s.config, 'explainAlarm'))
  useEffect(ensureAiLoaded, [])

  useEffect(() => {
    if (unread) useAlarms.getState().markRead()
  }, [unread])

  return (
    <TransferContextMenu
      section="alarms"
      className="flex min-h-0 flex-1 flex-col"
      items={
        <ContextMenuItem onClick={() => setRulesOpen(true)}>
          <ListChecks /> {t('Kuralları Düzenle')}
        </ContextMenuItem>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            <BellOff className="size-5" />
            {t('Henüz alarm yok. Açık terminallerde kurallardan biri geçince burada listelenir.')}
          </div>
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              exists={tabIds.split('|').includes(event.tabId)}
              explain={explain}
            />
          ))
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 border-t border-sidebar-border p-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 bg-background shadow-sm hover:shadow"
          onClick={() => setRulesOpen(true)}
        >
          <ListChecks /> {t('Kurallar')}
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {t('{n} Aktif', { n: ruleCount })}
          </span>
        </Button>
        {events.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            title={t('Tüm Alarmları Listeden Kaldır')}
            onClick={() => useAlarms.getState().clearEvents()}
          >
            <Eraser /> {t('Alarmları Temizle')}
          </Button>
        )}
      </div>
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="size-4" /> {t('Alarm Kuralları')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Açık terminallerde bu kelimelerden ya da düzenli ifadelerden biri geçen satırlar alarm olarak yakalanır.'
              )}
            </DialogDescription>
          </DialogHeader>
          <RuleEditor />
          <DialogFooter className="sm:justify-start">
            <Button variant="outline" size="sm" onClick={() => void openImport(['alarms'])}>
              <Download /> {t('İçe Aktar…')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => openExport(['alarms'])}>
              <Upload /> {t('Dışa Aktar…')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TransferContextMenu>
  )
}
