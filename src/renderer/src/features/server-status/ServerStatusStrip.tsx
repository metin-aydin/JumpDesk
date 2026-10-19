import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buildStatsStartCommand } from '@/features/terminal/shell-integration'
import { terminalRegistry } from '@/features/terminal/registry'
import { currentLocale, useT } from '@/lib/i18n'
import { usePreferences } from '@/stores/preferences'
import {
  fullestDisk,
  markStatsRequested,
  usageLevel,
  useServerStats,
  type ServerStats
} from '@/stores/server-stats'
import { useSessionInfo } from '@/stores/session-info'
import { LEVEL_CLASS, formatPercent } from './format'
import { ServerStatusCard, type StatFocus } from './ServerStatusCard'

/** Şeritteki kısa açık kalma süresi: gün, saat ya da dakika. */
function shortUptime(t: ReturnType<typeof useT>, seconds: number): string {
  const days = Math.floor(seconds / 86400)
  if (days >= 1) return t('{n} gün', { n: days })
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return t('{n} sa', { n: hours })
  return t('{n} dk', { n: Math.max(1, Math.floor(seconds / 60)) })
}

const CHIP =
  'inline-flex h-[18px] shrink-0 items-center gap-1 rounded bg-muted px-1.5 text-[11px] text-foreground/90 transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:bg-accent'

/** Çip: tıklayınca ayrıntı kartı açılır (kart sayfaya çizilir; dar panelde kırpılmaz). */
function StatChip({
  tabId,
  stats,
  focus,
  children
}: {
  tabId: string
  stats: ServerStats
  focus: StatFocus
  children: React.ReactNode
}): React.JSX.Element {
  const t = useT()
  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" className={CHIP} title={t('Ayrıntıları Göster')} />}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-3">
        <ServerStatusCard tabId={tabId} stats={stats} focus={focus} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Yatay kaydırılan alan: tarayıcının kaydırma çubuğu gizlidir (yer kaplamaz), içerik taşınca altta ince bir gösterge
 * belirir; fare tekerleği alanı yatay kaydırır, gösterge sürüklenebilir.
 */
function ScrollRow({ children }: { children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const overflow = el.scrollWidth - el.clientWidth
      if (overflow <= 1) {
        setThumb(null)
        return
      }
      const width = Math.max(16, (el.clientWidth / el.scrollWidth) * el.clientWidth)
      const left = (el.scrollLeft / overflow) * (el.clientWidth - width)
      setThumb((prev) =>
        prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.width - width) < 0.5
          ? prev
          : { left, width }
      )
    }
    update()
    const wheel = (e: WheelEvent): void => {
      if (el.scrollWidth - el.clientWidth <= 1) return
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', wheel)
    }
  })

  const startDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = ref.current
    if (!el) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startLeft = el.scrollLeft
    const ratio = el.scrollWidth / el.clientWidth
    const move = (ev: PointerEvent): void => {
      el.scrollLeft = startLeft + (ev.clientX - startX) * ratio
    }
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  return (
    <div className="group/row relative min-w-0 flex-1 self-stretch">
      <div
        ref={ref}
        data-status-scroll
        className="flex h-full items-center gap-1 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {thumb && (
        <div
          aria-hidden
          onPointerDown={startDrag}
          className="absolute bottom-0 h-[3px] cursor-default rounded-full bg-foreground/20 transition-colors group-hover/row:bg-foreground/35 hover:bg-foreground/50"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
    </div>
  )
}

/**
 * Sunucu durumu şeridi (başlığın altında): CPU, bellek, en dolu disk ve yük çipleri; sağda açık kalma süresi. Ayar
 * kapalıysa, oturum Linux kabuk entegrasyonu taşımıyorsa ya da henüz veri gelmediyse çizilmez. Ayar açılmadan önce
 * bağlanan oturumda ölçümü başlatan bir düğme gösterilir.
 */
export function ServerStatusStrip({ tabId }: { tabId: string }): React.JSX.Element | null {
  const t = useT()
  const enabled = usePreferences((s) => s.serverStatus)
  const interval = usePreferences((s) => s.serverStatusInterval)
  const integration = useSessionInfo((s) => s.byTab[tabId]?.integration)
  const stats = useServerStats((s) => s.byTab[tabId])
  const requested = useServerStats((s) => s.requested[tabId] ?? false)
  const [now, setNow] = useState(() => Date.now())

  // Açık kalma süresi örnekler arasında da ilerler (dakikalık gösterim için dakikada bir yenilenir).
  useEffect(() => {
    if (!stats) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [stats])

  if (!enabled || integration !== 'ready') return null

  if (!stats) {
    if (requested) return null
    const start = (): void => {
      const handle = terminalRegistry.get(tabId)
      if (!handle?.live.atPrompt) {
        toast.info(t('Komut satırı boşken başlatılabilir'))
        return
      }
      markStatsRequested(tabId)
      handle.run(buildStatsStartCommand(interval))
    }
    return (
      <div className="flex h-6 shrink-0 items-center border-b bg-muted/30 px-1.5">
        <Tooltip>
          <TooltipTrigger render={<button type="button" className={CHIP} onClick={start} />}>
            <Activity className="size-3" /> {t('Durumu Göster')}
          </TooltipTrigger>
          <TooltipContent>{t('Bu Oturumda Sunucu Durumunu Başlat')}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  const memPercent = stats.memTotal > 0 ? (stats.memUsed / stats.memTotal) * 100 : null
  const disk = fullestDisk(stats.disks)
  const diskPercent = disk ? (disk.used / disk.size) * 100 : null
  const uptime =
    stats.uptimeSec !== null ? stats.uptimeSec + Math.max(0, now - stats.updatedAt) / 1000 : null
  const level = (value: number | null): string => LEVEL_CLASS[usageLevel(value)]

  return (
    <div
      data-server-status
      data-updated-at={stats.updatedAt}
      className="flex h-6 shrink-0 items-center border-b bg-muted/30 text-[11px]"
    >
      <ScrollRow>
        <StatChip tabId={tabId} stats={stats} focus="cpu">
          {t('CPU')} <span className={level(stats.cpu)}>{formatPercent(stats.cpu)}</span>
        </StatChip>
        <StatChip tabId={tabId} stats={stats} focus="mem">
          {t('RAM')} <span className={level(memPercent)}>{formatPercent(memPercent)}</span>
        </StatChip>
        {disk && (
          <StatChip tabId={tabId} stats={stats} focus="disk">
            {t('Disk')} <span className="text-muted-foreground">{disk.mount}</span>
            <span className={level(diskPercent)}>{formatPercent(diskPercent)}</span>
          </StatChip>
        )}
        {stats.load && (
          <StatChip tabId={tabId} stats={stats} focus="load">
            {t('Load')}{' '}
            <span className="text-muted-foreground">
              {new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(
                stats.load[0]
              )}
            </span>
          </StatChip>
        )}
      </ScrollRow>
      {uptime !== null && (
        <span
          title={t('Açık Kalma Süresi')}
          className="shrink-0 px-2 text-[10.5px] whitespace-nowrap text-muted-foreground"
        >
          {shortUptime(t, uptime)}
        </span>
      )}
    </div>
  )
}
