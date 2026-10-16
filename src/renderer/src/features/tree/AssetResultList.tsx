import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, SearchX } from 'lucide-react'
import { OsBadge } from '@/components/OsBadge'
import { TagChip } from '@/components/TagChip'
import { useT } from '@/lib/i18n'
import { displayAddress } from '@/lib/os'
import { isMac } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useServerMeta } from '@/stores/server-meta'
import { useTreeScale } from '@/stores/font-sizes'
import { AssetContextMenu } from './AssetContextMenu'
import type { TreeItemData } from './tree-data'

function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  const q = query.trim().toLowerCase()
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-primary/20 text-inherit">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** Çoklu seçim tuşu: Ctrl (macOS'ta ⌘). */
const isMultiKey = (e: { ctrlKey: boolean; metaKey: boolean }): boolean =>
  isMac ? e.metaKey : e.ctrlKey
const MULTI_KEY = isMac ? 'Meta' : 'Control'
const MULTI_LABEL = isMac ? '⌘' : 'Ctrl'

function ResultRow({
  item,
  query,
  active,
  picked,
  dense,
  onPick,
  onToggle,
  onHover
}: {
  item: TreeItemData
  query: string
  active: boolean
  picked: boolean
  dense: boolean
  onPick: () => void
  /** Verilmezse çoklu seçim kapalıdır. */
  onToggle?: () => void
  onHover: () => void
}): React.JSX.Element {
  const localIp = useServerMeta((s) =>
    item.assetId ? s.byAsset[item.assetId]?.localIp : undefined
  )
  const tags = useServerMeta((s) => (item.assetId ? s.byAsset[item.assetId]?.tags : undefined))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <AssetContextMenu item={item}>
      <div
        ref={ref}
        role="option"
        aria-selected={active}
        aria-checked={onToggle ? picked : undefined}
        onMouseMove={onHover}
        onDoubleClick={(e) => {
          if (!(onToggle && isMultiKey(e))) onPick()
        }}
        onClick={(e) => {
          if (onToggle && isMultiKey(e)) {
            e.preventDefault()
            onToggle()
          } else if (!dense) onPick()
        }}
        className={cn(
          'flex items-center gap-2.5 overflow-hidden rounded-md px-2',
          dense ? 'h-7 text-[13px]' : 'h-11',
          picked
            ? 'bg-primary/12 text-foreground ring-1 ring-primary/40 ring-inset'
            : active
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
        )}
      >
        {picked ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground',
              dense ? 'size-4' : 'size-8'
            )}
          >
            <Check className={dense ? 'size-3' : 'size-4'} />
          </span>
        ) : (
          <OsBadge platformType={item.platformType} size={dense ? 'xs' : 'md'} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">
              <Highlight text={item.name} query={query} />
            </span>
            {tags?.slice(0, dense ? 2 : 4).map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
          {!dense && (
            <div className="truncate text-xs text-muted-foreground">
              <Highlight text={item.address ?? ''} query={query} />
              {item.comment && <span> · {item.comment}</span>}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          {localIp ? (
            <Highlight text={localIp} query={query} />
          ) : dense && displayAddress(undefined, item.address) ? (
            <Highlight text={item.address!} query={query} />
          ) : null}
        </span>
      </div>
    </AssetContextMenu>
  )
}

/**
 * Ctrl (⌘) basılıyken tıklanan sonuçlar seçilir; tuş bırakılınca seçilenlerin hepsine bağlanılır. Pencere odağı
 * kaybedilirse ya da Esc'e basılırsa seçim iptal edilir.
 */
function useMultiPick(
  results: TreeItemData[],
  onPickMany?: (items: TreeItemData[]) => void
): { picked: string[]; toggle: (id: string) => void } {
  const [picked, setPicked] = useState<string[]>([])
  const state = useRef({ picked, results, onPickMany })
  useEffect(() => {
    state.current = { picked, results, onPickMany }
  })
  const enabled = Boolean(onPickMany)
  useEffect(() => {
    if (!enabled) return
    const onKeyUp = (e: KeyboardEvent): void => {
      const { picked: ids, results: all, onPickMany: commit } = state.current
      if (e.key !== MULTI_KEY || ids.length === 0) return
      const items = ids
        .map((id) => all.find((r) => r.id === id))
        .filter((r): r is TreeItemData => Boolean(r))
      setPicked([])
      if (items.length) commit?.(items)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && state.current.picked.length) setPicked([])
    }
    const cancel = (): void => setPicked([])
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', cancel)
    }
  }, [enabled])
  const toggle = (id: string): void =>
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  return { picked, toggle }
}

export function AssetResultList({
  results,
  loading,
  error,
  query,
  activeIndex,
  onActiveChange,
  onPick,
  onPickMany,
  dense = false
}: {
  results: TreeItemData[]
  loading: boolean
  error?: string
  query: string
  activeIndex: number
  onActiveChange: (i: number) => void
  onPick: (item: TreeItemData) => void
  /** Ctrl ile seçilen sunucular; verilirse çoklu seçim açılır. */
  onPickMany?: (items: TreeItemData[]) => void
  dense?: boolean
}): React.JSX.Element {
  const t = useT()
  const { picked, toggle } = useMultiPick(results, onPickMany)
  /** Kenar çubuğundaki sonuçlar sunucu ağacının yerini aldığından ağaç yazı boyutuyla çizilir. */
  const treeScale = useTreeScale()
  if (loading && results.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {t('Aranıyor…')}
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <SearchX className="size-5" />
        {error ?? t('"{query}" için sunucu bulunamadı', { query: query.trim() })}
      </div>
    )
  }
  return (
    <div
      className="flex flex-col"
      style={dense && treeScale !== 1 ? { zoom: treeScale } : undefined}
    >
      <div
        role="listbox"
        aria-multiselectable={onPickMany ? true : undefined}
        className="flex flex-col gap-px"
      >
        {results.map((item, i) => (
          <ResultRow
            key={item.id}
            item={item}
            query={query}
            dense={dense}
            active={i === activeIndex}
            picked={picked.includes(item.id)}
            onHover={() => onActiveChange(i)}
            onPick={() => onPick(item)}
            onToggle={onPickMany ? () => toggle(item.id) : undefined}
          />
        ))}
      </div>
      {onPickMany && results.length > 1 && (
        <div
          aria-live="polite"
          className={cn(
            'sticky bottom-0 mt-1 rounded-md px-2 py-1.5 text-[11px]',
            picked.length
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-popover/90 text-muted-foreground backdrop-blur'
          )}
        >
          {picked.length
            ? t("{n} Sunucu Seçildi · {key}'yi Bırakınca Bağlanılır", {
                n: picked.length,
                key: MULTI_LABEL
              })
            : t('{key} + Tık İle Birden Çok Sunucu Seçin', { key: MULTI_LABEL })}
        </div>
      )}
    </div>
  )
}
