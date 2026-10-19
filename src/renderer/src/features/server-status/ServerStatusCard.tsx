import { useEffect, useState } from 'react'
import { currentLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usageLevel, type ServerStats } from '@/stores/server-stats'
import { findTab, useWorkspace } from '@/stores/workspace'
import { LEVEL_CLASS, formatGb, formatPercent } from './format'

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

function Row({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

/** Uzun biçimli açık kalma süresi (gün ve saat). */
function longUptime(t: ReturnType<typeof useT>, seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days >= 1) return t('{d} gün {h} sa', { d: days, h: hours })
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours >= 1 ? t('{h} sa {m} dk', { h: hours, m: minutes }) : t('{n} dk', { n: minutes })
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
  const uptime = stats.uptimeSec !== null ? stats.uptimeSec + (now - stats.updatedAt) / 1000 : null
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
        </>
      )}

      {focus === 'disk' && (
        <div className="space-y-2">
          {[...stats.disks]
            .sort((a, b) => b.used / b.size - a.used / a.size)
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

      {focus === 'load' && stats.load && (
        <div className="space-y-1.5">
          {(['1', '5', '15'] as const).map((minutes, i) => {
            const value = stats.load![i]
            const perCore = stats.cores ? (value / stats.cores) * 100 : null
            return (
              <div key={minutes} className="space-y-0.5">
                <Row
                  label={t('{n} dk ortalaması', { n: minutes })}
                  value={
                    <>
                      {number.format(value)}
                      {perCore !== null && (
                        <span className={cn('ml-1.5', level(perCore))}>
                          {t('çekirdek başına {value}', { value: formatPercent(perCore) })}
                        </span>
                      )}
                    </>
                  }
                />
                {perCore !== null && <UsageBar percent={perCore} />}
              </div>
            )
          })}
          {stats.cores !== null && <Row label={t('Çekirdek')} value={stats.cores} />}
          {uptime !== null && <Row label={t('Açık kalma süresi')} value={longUptime(t, uptime)} />}
        </div>
      )}

      <div className="border-t pt-2 text-right text-[10.5px] text-muted-foreground">
        {t('Son güncelleme: {n} sn önce', { n: ago })}
      </div>
    </div>
  )
}
