import { useEffect, useState } from 'react'
import { currentLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usageLevel, type ServerStats } from '@/stores/server-stats'
import { findTab, useWorkspace } from '@/stores/workspace'
import { LEVEL_CLASS, formatGb, formatPercent } from './format'

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

/** Son CPU değerlerinin çizgi grafiği (0–100). */
function Sparkline({ values }: { values: number[] }): React.JSX.Element | null {
  if (values.length < 2) return null
  const w = 100
  const h = 22
  const step = w / (values.length - 1)
  const points = values
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(h - (Math.min(100, v) / 100) * (h - 2) - 1).toFixed(1)}`
    )
    .join(' ')
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-1 h-[22px] w-full text-primary"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </svg>
  )
}

function Section({
  title,
  value,
  children
}: {
  title: string
  value?: React.ReactNode
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{title}</span>
        {value !== undefined && <span className="tabular-nums">{value}</span>}
      </div>
      {children}
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

/** Ayrıntı kartı (çipe tıklayınca): CPU, bellek, diskler, yük ve açık kalma süresi. */
export function ServerStatusCard({
  tabId,
  stats
}: {
  tabId: string
  stats: ServerStats
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
  const disks = [...stats.disks].sort((a, b) => b.used / b.size - a.used / a.size)
  const ago = Math.max(0, Math.round((now - stats.updatedAt) / 1000))
  const uptime = stats.uptimeSec !== null ? stats.uptimeSec + (now - stats.updatedAt) / 1000 : null

  return (
    <div className="space-y-3 text-xs" data-server-status-card>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{name}</span>
        <span className="shrink-0 truncate text-[11px] text-muted-foreground">
          {[stats.os, stats.cores ? t('{n} çekirdek', { n: stats.cores }) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <Section
        title={t('CPU')}
        value={
          <span className={LEVEL_CLASS[usageLevel(stats.cpu)]}>{formatPercent(stats.cpu)}</span>
        }
      >
        <UsageBar percent={stats.cpu} />
        <Sparkline values={stats.cpuHistory} />
      </Section>

      <Section
        title={t('Bellek')}
        value={
          <span>
            {formatGb(stats.memUsed)} / {formatGb(stats.memTotal)} GB{' '}
            <span className={LEVEL_CLASS[usageLevel(memPercent)]}>{formatPercent(memPercent)}</span>
          </span>
        }
      >
        <UsageBar percent={memPercent} />
        {stats.swapTotal > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {t('Swap {used} / {total} GB', {
              used: formatGb(stats.swapUsed),
              total: formatGb(stats.swapTotal)
            })}
          </div>
        )}
      </Section>

      {disks.length > 0 && (
        <Section title={t('Diskler')}>
          <div className="space-y-1.5">
            {disks.map((d) => {
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
                      <span className={LEVEL_CLASS[usageLevel(percent)]}>
                        {formatPercent(percent)}
                      </span>
                    </span>
                  </div>
                  <UsageBar percent={percent} />
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <div className="space-y-1 border-t pt-2">
        {stats.load && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t('Yük (1 / 5 / 15 dk)')}</span>
            <span className="tabular-nums">
              {stats.load.map((v) => number.format(v)).join(' · ')}
            </span>
          </div>
        )}
        {uptime !== null && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t('Açık kalma süresi')}</span>
            <span>{longUptime(t, uptime)}</span>
          </div>
        )}
        <div className="text-right text-[10.5px] text-muted-foreground">
          {t('Son güncelleme: {n} sn önce', { n: ago })}
        </div>
      </div>
    </div>
  )
}
