import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Columns2, File, Grid2x2, Rows2, Search, X } from 'lucide-react'
import { OsBadge } from '@/components/OsBadge'
import { TabPreviewCard } from './TabPreviewCard'
import { closeTabSafely } from '@/features/layouts/guard'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/lib/i18n'
import { displayAddress } from '@/lib/os'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/stores/overlay'
import { TAB_SEARCH_SHORTCUT, useTabSearch } from '@/stores/tab-search'
import { useServerMeta } from '@/stores/server-meta'
import { groupOf, tabTitle, useWorkspace, type TileMode } from '@/stores/workspace'

const MODE_ICON: Record<TileMode, typeof Columns2> = {
  vertical: Columns2,
  horizontal: Rows2,
  grid: Grid2x2
}

const statusDot: Record<string, string> = {
  idle: 'bg-muted-foreground/40',
  connecting: 'bg-warning',
  connected: 'bg-success',
  closed: 'bg-muted-foreground/50',
  error: 'bg-destructive'
}

function TabSearchList({ onDone }: { onDone: () => void }): React.JSX.Element {
  const t = useT()
  const tabs = useWorkspace((s) => s.tabs)
  const groups = useWorkspace((s) => s.groups)
  const activeId = useWorkspace((s) => s.activeId)
  const meta = useServerMeta((s) => s.byAsset)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<{ tabId: string; rect: DOMRect } | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return tabs
      .map((tab) => {
        const m = tab.asset ? meta[tab.asset.id] : undefined
        const address = tab.asset ? displayAddress(m?.localIp, tab.asset.address)?.text : undefined
        const haystack = [tabTitle(tab, t), address, tab.asset?.address, ...(m?.tags ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('tr')
        return { tab, address, group: groupOf(groups, tab.id), match: !q || haystack.includes(q) }
      })
      .filter((r) => r.match)
  }, [tabs, groups, meta, query, t])

  const safeIndex = Math.min(index, Math.max(0, rows.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [safeIndex])

  const pick = (tabId: string): void => {
    useWorkspace.getState().activate(tabId)
    onDone()
  }

  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Search className="size-4 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIndex((i) => Math.min(rows.length - 1, i + 1))
            else if (e.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1))
            else if (e.key === 'Enter' && rows[safeIndex]) pick(rows[safeIndex].tab.id)
            else return
            e.preventDefault()
          }}
          placeholder={t('Sekmelerde ara')}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {t('Açık Sekmeler')} ({rows.length})
      </div>
      {hovered && tabs.some((t) => t.id === hovered.tabId) && (
        <TabPreviewCard
          tabs={tabs.filter((t) => t.id === hovered.tabId)}
          anchor={hovered.rect}
          placement="left"
        />
      )}
      <div
        ref={listRef}
        onPointerLeave={() => setHovered(null)}
        onScroll={() => setHovered(null)}
        role="listbox"
        aria-label={t('Açık sekmeler')}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5"
      >
        {rows.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t('Eşleşen sekme yok')}
          </div>
        )}
        {rows.map(({ tab, address, group }, i) => {
          const GroupIcon = group ? MODE_ICON[group.mode] : null
          return (
            <div
              key={tab.id}
              role="option"
              aria-selected={i === safeIndex}
              data-index={i}
              onPointerMove={() => i !== safeIndex && setIndex(i)}
              onPointerEnter={(e) =>
                setHovered({ tabId: tab.id, rect: e.currentTarget.getBoundingClientRect() })
              }
              onClick={() => pick(tab.id)}
              className={cn(
                'group/row flex h-11 items-center gap-2.5 rounded-md px-2 text-[13px]',
                i === safeIndex && 'bg-accent text-accent-foreground'
              )}
            >
              <span className="relative shrink-0">
                {tab.asset ? (
                  <OsBadge
                    platformType={tab.asset.platformType}
                    files={tab.view === 'files'}
                    size="sm"
                  />
                ) : (
                  <File className="size-4 text-muted-foreground" />
                )}
                {tab.asset && (
                  <span
                    className={cn(
                      'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-popover',
                      statusDot[tab.status]
                    )}
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className={cn('truncate', tab.id === activeId && 'font-medium')}>
                  {tabTitle(tab, t)}
                </span>
                {address && (
                  <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {address}
                  </span>
                )}
              </span>
              {GroupIcon && (
                <span title={t('Bölünmüş Görünümde')} className="shrink-0 text-muted-foreground">
                  <GroupIcon className="size-3.5" />
                </span>
              )}
              <button
                type="button"
                aria-label={t('{name} sekmesini kapat', { name: tabTitle(tab, t) })}
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTabSafely(tab.id)
                }}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Chrome'daki sekme arama: tüm açık sekmeler aranabilir bir listede; tıklayınca o sekmeye geçilir. */
export function TabSearch({ className }: { className: string }): React.JSX.Element {
  const t = useT()
  const open = useTabSearch((s) => s.open)
  const setOpen = useTabSearch((s) => s.setOpen)
  useEffect(() => {
    if (!open) return
    useOverlay.getState().setOpen(true)
    return () => useOverlay.getState().setOpen(false)
  }, [open])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={t('Sekmelerde Ara')}
                  className={cn(className, open && 'bg-foreground/8 text-foreground')}
                />
              }
            />
          }
        >
          <ChevronDown className="size-4" />
        </TooltipTrigger>
        <TooltipContent>
          {t('Sekmelerde Ara')} ({TAB_SEARCH_SHORTCUT})
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[22rem] gap-0 p-0">
        <TabSearchList onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
