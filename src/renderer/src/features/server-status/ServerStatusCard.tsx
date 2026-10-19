import { useEffect, useState } from 'react'
import { currentLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usageLevel, type ProcessUsage, type ServerStats } from '@/stores/server-stats'
import { findTab, useWorkspace } from '@/stores/workspace'
import { LEVEL_CLASS, formatGb, formatMemory, formatPercent } from './format'

/** Kartın hangi çipten açıldığı; kart o bilginin ayrıntısını gösterir. */
export type StatFocus = 'cpu' | 'mem' | 'disk' | 'load'

const BAR_CLASS = {
  ok: 'bg-success',
  warn: 'bg-warning',
  critical: 'bg-destructive'
} as const

function UsageBar({ percent }: { percent: number | null }): React.JSX.Element {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-[width]', BAR_CLASS[usageLevel(percent)])}
        style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
      />
    </div>
  )
}

/** Son değerlerin (0–100) alan grafiği; yatay çizgiler %50 ve %80'i gösterir. */
function HistoryChart({ values, label }: { values: number[]; label: string }): React.JSX.Element {
  const t = useT()
  if (values.length < 2)
    return (
      <div className="flex h-16 items-center justify-center rounded-md bg-muted/40 text-[11px] text-muted-foreground">
        {t('Geçmiş birikiyor…')}
      </div>
    )
  const w = 100
  const h = 48
  const step = w / (values.length - 1)
  const y = (v: number): number => h - (Math.min(100, Math.max(0, v)) / 100) * (h - 2) - 1
  const line = values.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const average = values.reduce((a, b) => a + b, 0) / values.length
  const peak = Math.max(...values)
  return (
    <div className="space-y-1">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-16 w-full rounded-md bg-muted/40 text-primary"
      >
        {[50, 80].map((g) => (
          <line
            key={g}
            x1={0}
            x2={w}
            y1={y(g)}
            y2={y(g)}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon points={`0,${h} ${line} ${w},${h}`} fill="currentColor" fillOpacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[10.5px] text-muted-foreground tabular-nums">
        <span>{t('Ortalama {value}', { value: formatPercent(average) })}</span>
        <span>{t('En yüksek {value}', { value: formatPercent(peak) })}</span>
      </div>
    </div>
  )
}

/** Satır içi küçük çizgi grafik (0–100); tek değer varken boş kalır. */
function Sparkline({ values, label }: { values: number[]; label: string }): React.JSX.Element {
  const w = 100
  const h = 16
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const y = (v: number): number => h - (Math.min(100, Math.max(0, v)) / 100) * (h - 2) - 1
  const line = values.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-4 min-w-0 flex-1 rounded-sm bg-muted/40 text-primary"
    >
      {values.length > 1 && (
        <>
          <polygon points={`0,${h} ${line} ${w},${h}`} fill="currentColor" fillOpacity={0.12} />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}

/** En çok kaynak kullanan işlemler: ad, PID ve değer. */
function ProcessList({
  title,
  items,
  format
}: {
  title: string
  items: ProcessUsage[]
  format: (value: number) => string
}): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="text-[10.5px] text-muted-foreground">{title}</div>
      <ul aria-label={title} className="space-y-0.5">
        {items.map((p) => (
          <li key={p.pid} data-process={p.pid} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={p.name}>
              {p.name}
            </span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
              {p.pid}
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

const TITLES: Record<StatFocus, string> = {
  cpu: 'CPU',
  mem: 'Bellek',
  disk: 'Diskler',
  load: 'Yük'
}

/** Ayrıntı kartı: tıklanan çipin bilgisi (CPU geçmişi, bellek, diskler ya da yük). */
export function ServerStatusCard({
  tabId,
  stats,
  focus
}: {
  tabId: string
  stats: ServerStats
  focus: StatFocus
}): React.JSX.Element {
  const t = useT()
  const name = useWorkspace((s) => {
    const tab = findTab(s, tabId)
    return tab?.asset?.name ?? tab?.title ?? ''
  })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const number = new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 })
  const memPercent = stats.memTotal > 0 ? (stats.memUsed / stats.memTotal) * 100 : null
  const ago = Math.max(0, Math.round((now - stats.updatedAt) / 1000))
  const level = (v: number | null): string => LEVEL_CLASS[usageLevel(v)]

  return (
    <div className="space-y-3 text-xs" data-server-status-card={focus}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="font-medium">{t(TITLES[focus])}</span>
          <span className="text-muted-foreground"> · {name}</span>
        </span>
        <span className="shrink-0 truncate text-[11px] text-muted-foreground">{stats.os}</span>
      </div>

      {focus === 'cpu' && (
        <>
          <div className="flex items-baseline justify-between">
            <span className={cn('text-xl font-medium tabular-nums', level(stats.cpu))}>
              {formatPercent(stats.cpu)}
            </span>
            {stats.cores !== null && (
              <span className="text-muted-foreground">{t('{n} çekirdek', { n: stats.cores })}</span>
            )}
          </div>
          <HistoryChart values={stats.cpuHistory} label={t('CPU Geçmişi')} />
          {stats.load && (
            <Row
              label={t('Yük (1 / 5 / 15 dk)')}
              value={stats.load.map((v) => number.format(v)).join(' · ')}
            />
          )}
          <ProcessList
            title={t('En çok CPU kullananlar')}
            items={stats.topCpu}
            format={(v) =>
              `${new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 1 }).format(v)}%`
            }
          />
        </>
      )}

      {focus === 'mem' && (
        <>
          <div className="flex items-baseline justify-between">
            <span className={cn('text-xl font-medium tabular-nums', level(memPercent))}>
              {formatPercent(memPercent)}
            </span>
            <span className="tabular-nums">
              {formatGb(stats.memUsed)} / {formatGb(stats.memTotal)} GB
            </span>
          </div>
          <UsageBar percent={memPercent} />
          <HistoryChart values={stats.memHistory} label={t('Bellek Geçmişi')} />
          {stats.swapTotal > 0 && (
            <Row
              label={t('Swap')}
              value={`${formatGb(stats.swapUsed)} / ${formatGb(stats.swapTotal)} GB`}
            />
          )}
          <ProcessList
            title={t('En çok bellek kullananlar')}
            items={stats.topMem}
            format={formatMemory}
          />
        </>
      )}

      {focus === 'disk' && (
        <div className="space-y-2">
          {[...stats.disks]
            .sort((a, b) => b.size - a.size)
            .map((d) => {
              const percent = (d.used / d.size) * 100
              return (
                <div key={d.mount} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[11px]" title={d.mount}>
                      {d.mount}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-muted-foreground">
                        {formatGb(d.used)} / {formatGb(d.size)} GB{' '}
                      </span>
                      <span className={level(percent)}>{formatPercent(percent)}</span>
                    </span>
                  </div>
                  <UsageBar percent={percent} />
                </div>
              )
            })}
        </div>
      )}

      {focus === 'load' && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-muted-foreground">
            <span>{t('Çekirdek başına kullanım')}</span>
            {stats.cores !== null && <span>{t('{n} çekirdek', { n: stats.cores })}</span>}
          </div>
          {stats.coreHistory.length === 0 ? (
            <div className="flex h-16 items-center justify-center rounded-md bg-muted/40 text-[11px] text-muted-foreground">
              {t('Geçmiş birikiyor…')}
            </div>
          ) : (
            <ul
              aria-label={t('Çekirdek başına kullanım')}
              className="max-h-72 space-y-1 overflow-y-auto"
            >
              {stats.coreHistory.map((values, i) => {
                const current = stats.coreUsage[i] ?? values[values.length - 1] ?? null
                return (
                  <li key={i} data-core={i} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {`cpu${i}`}
                    </span>
                    <Sparkline values={values} label={t('cpu{n} Geçmişi', { n: i })} />
                    <span className={cn('w-9 shrink-0 text-right tabular-nums', level(current))}>
                      {formatPercent(current)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className="border-t pt-2 text-right text-[10.5px] text-muted-foreground">
        {t('Son güncelleme: {n} sn önce', { n: ago })}
      </div>
    </div>
  )
}
