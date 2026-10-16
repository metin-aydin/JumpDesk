import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Folder, FolderTree } from 'lucide-react'
import type { JmsTreeNode } from '@shared/types'
import { LoadingState } from '@/components/LoadingState'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { FolderContextMenu } from '@/features/tree/FolderContextMenu'
import { toItem, type TreeItemData } from '@/features/tree/tree-data'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/stores/overlay'
import { AssetCard, type SelectModifiers } from './AssetCard'
import { CARD_CLASS, SELECTED_CARD_CLASS } from './card-styles'

interface Level {
  /** Düğüm anahtarı; `''` kök listesidir. */
  key: string
  name: string
}

const ROOT: Level = { key: '', name: 'Tümü' }
/** Bu kadar seviyeyi aşan yolun ortası "…" menüsüne toplanır. */
const MAX_VISIBLE_CRUMBS = 4
const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' })

function sortItems(items: TreeItemData[]): TreeItemData[] {
  return items.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'node' ? -1 : 1) : collator.compare(a.name, b.name)
  )
}

/** Bir seviyenin doğrudan çocukları; kökte Favoriler (ayrı bölümde gösterildiği için) atlanır. */
function childrenOf(raw: JmsTreeNode[], key: string): TreeItemData[] {
  return sortItems(
    raw
      .filter((n) => n.pId === key && !(key === '' && n.id === 'favorite'))
      .map(toItem)
      .filter((i) => !i.disabled)
  )
}

/** Yol çubuğu: kök ve son seviyeler görünür, sığmayan ara seviyeler "…" menüsünde; her ad gerekirse kısalır. */
function Breadcrumb({
  path,
  onGo
}: {
  path: Level[]
  onGo: (index: number) => void
}): React.JSX.Element {
  const t = useT()
  const collapse = path.length > MAX_VISIBLE_CRUMBS
  const hidden = collapse ? path.slice(1, path.length - (MAX_VISIBLE_CRUMBS - 2)) : []
  const visible = collapse ? [path[0], ...path.slice(path.length - (MAX_VISIBLE_CRUMBS - 2))] : path
  const indexOf = (level: Level): number => path.indexOf(level)
  /** Kök seviyenin adı geçerli dile çevrilir; klasör adları olduğu gibi gösterilir. */
  const nameOf = (level: Level): string => (level.key === ROOT.key ? t(level.name) : level.name)
  return (
    <nav
      aria-label={t('Klasör Yolu')}
      className="flex min-w-0 flex-1 items-center gap-0.5 text-[12px] tracking-normal normal-case"
    >
      {visible.map((level, i) => {
        const index = indexOf(level)
        const last = index === path.length - 1
        return (
          <span
            key={`${level.key}-${index}`}
            className={cn('flex min-w-0 items-center', last ? 'shrink-[0.3]' : 'shrink')}
          >
            {i > 0 && <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/60" />}
            {collapse && i === 1 && (
              <>
                <DropdownMenu onOpenChange={(open) => useOverlay.getState().setOpen(open)}>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={t('Gizli Klasörler')}
                        className="shrink-0 rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      />
                    }
                  >
                    …
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-44">
                    {hidden.map((h) => (
                      <DropdownMenuItem key={h.key} onClick={() => onGo(indexOf(h))}>
                        <Folder /> {nameOf(h)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/60" />
              </>
            )}
            <button
              type="button"
              title={nameOf(level)}
              disabled={last}
              onClick={() => onGo(index)}
              className={cn(
                'min-w-0 truncate rounded px-1 py-0.5',
                last
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {nameOf(level)}
            </button>
          </span>
        )
      })}
    </nav>
  )
}

function FolderCard({
  item,
  selected,
  onSelect,
  onOpen
}: {
  item: TreeItemData
  selected: boolean
  onSelect: (mods: SelectModifiers) => void
  onOpen: () => void
}): React.JSX.Element {
  const t = useT()
  return (
    <FolderContextMenu folderKey={item.key} onOpen={onOpen}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={(e) => onSelect({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
        data-nav-card
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          onOpen()
        }}
        onContextMenu={() => !selected && onSelect({ ctrl: false, shift: false })}
        className={cn(CARD_CLASS, selected && SELECTED_CARD_CLASS)}
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Folder className="size-4" fill="currentColor" fillOpacity={0.2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.count !== undefined ? t('{n} sunucu', { n: item.count }) : t('Klasör')}
          </span>
        </span>
      </button>
    </FolderContextMenu>
  )
}

/**
 * "Yeni Bağlantı" ekranındaki klasör gezgini: ağaçtaki klasörler ızgara olarak listelenir, çift tıklanan klasörün alt
 * klasörleri ve doğrudan altındaki sunucular gösterilir; başlığın yanında bulunulan klasörün yolu durur. Tek kök
 * klasör varsa (ör. Default) doğrudan onun içinden başlanır. Ağaçtaki gibi tıklama seçer (Ctrl/Shift ile çoklu),
 * sağ tık menüleri ağaçtakilerle aynıdır; Enter seçili sunucuların hepsine bağlanır.
 */
export function FolderBrowser({
  onPick
}: {
  /** Sunuculara bağlanır (ilki bu sekmede açılır). */
  onPick: (items: TreeItemData[]) => void
}): React.JSX.Element {
  const t = useT()
  const [path, setPath] = useState<Level[] | null>(null)
  const [items, setItems] = useState<TreeItemData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = path ? path[path.length - 1].key : null
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  /** Kökten tek klasöre inildiğinde o klasörün çocukları aynı yanıtta gelir; ikinci istek atlanır. */
  const prefilled = useRef<string | null>(null)

  useEffect(() => {
    if (key !== null && prefilled.current === key) {
      prefilled.current = null
      return
    }
    let cancelled = false
    void jumpdesk.jms.treeChildren(key || undefined).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      if (key === null) {
        const roots = childrenOf(res.data, '')
        const single = roots.length === 1 && roots[0].kind === 'node' ? roots[0] : null
        if (single?.key) {
          prefilled.current = single.key
          setPath([{ key: single.key, name: single.name }])
          setItems(childrenOf(res.data, single.key))
        } else {
          setPath([ROOT])
          setItems(roots)
        }
        return
      }
      setItems(childrenOf(res.data, key))
    })
    return () => {
      cancelled = true
    }
  }, [key])

  const clearSelection = (): void => {
    setSelected(new Set())
    setAnchor(null)
  }

  const sectionRef = useRef<HTMLElement>(null)
  /** Klavyeyle gezinirken klasör değişince yeni listenin ilk kartına odaklanılır. */
  const focusFirst = useRef(false)
  const rememberFocus = (): void => {
    focusFirst.current = Boolean(sectionRef.current?.contains(document.activeElement))
  }

  useEffect(() => {
    if (!items?.length || !focusFirst.current) return
    focusFirst.current = false
    sectionRef.current?.querySelector<HTMLElement>('[data-nav-card]')?.focus()
  }, [items])

  const open = (item: TreeItemData): void => {
    if (!path || !item.key) return
    rememberFocus()
    setItems(null)
    clearSelection()
    setPath([...path, { key: item.key, name: item.name }])
  }

  const go = (index: number): void => {
    if (!path || index === path.length - 1) return
    rememberFocus()
    setItems(null)
    clearSelection()
    setPath(path.slice(0, index + 1))
  }

  /**
   * Izgarada klavyeyle gezinme: oklar kartlar arasında (yukarı/aşağı bir satır) dolaşır ve kartı seçer, Shift ile
   * seçim genişler; Home/End ilk/son kart; Backspace üst klasöre çıkar. Enter kartın kendisinde işlenir.
   */
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Backspace') {
      if (path && path.length > 1) {
        e.preventDefault()
        go(path.length - 2)
      }
      return
    }
    const list = items ?? []
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-card]')]
    if (
      !cards.length ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
    )
      return
    e.preventDefault()
    const cols =
      getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length || 1
    const current = cards.findIndex((c) => c === document.activeElement)
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -cols,
      ArrowDown: cols
    }
    const target =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? cards.length - 1
          : current < 0
            ? 0
            : Math.max(0, Math.min(cards.length - 1, current + step[e.key]))
    cards[target].focus()
    if (list[target]) select(list[target], { ctrl: false, shift: e.shiftKey })
  }

  const select = (item: TreeItemData, mods: SelectModifiers): void => {
    const list = items ?? []
    if (mods.shift && anchor) {
      const a = list.findIndex((i) => i.id === anchor)
      const b = list.findIndex((i) => i.id === item.id)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        setSelected(new Set(list.slice(from, to + 1).map((i) => i.id)))
        return
      }
    }
    if (mods.ctrl) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
    } else setSelected(new Set([item.id]))
    setAnchor(item.id)
  }

  /** Sağ tıklanan sunucu seçimdeyse seçili tüm sunucular, değilse yalnız o sunucu. */
  const targetsFor = (item: TreeItemData): TreeItemData[] => {
    const sel = selectedRef.current
    if (!sel.has(item.id)) return [item]
    return (items ?? []).filter((i) => i.kind === 'asset' && sel.has(i.id))
  }

  const pickFrom = (item: TreeItemData): void => {
    const targets = targetsFor(item)
    onPick(targets.length > 1 ? targets : [item])
  }

  return (
    <section ref={sectionRef} className="space-y-2.5">
      <h3 className="flex min-w-0 items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <FolderTree className="size-3.5 shrink-0" />{' '}
        <span className="shrink-0">{t('Klasörler')}</span>
        {path && (
          <>
            <span className="h-3.5 w-px shrink-0 bg-border" />
            <Breadcrumb path={path} onGo={go} />
          </>
        )}
      </h3>
      {error ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-destructive">
          {error}
        </div>
      ) : items === null ? (
        <div className="flex h-[66px] rounded-lg border border-dashed">
          <LoadingState label={t('Klasörler okunuyor…')} className="p-0" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t('Bu klasör boş')}
        </div>
      ) : (
        <div
          onClick={(e) => e.target === e.currentTarget && clearSelection()}
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2"
        >
          {items.map((item) =>
            item.kind === 'node' ? (
              <FolderCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onSelect={(mods) => select(item, mods)}
                onOpen={() => open(item)}
              />
            ) : (
              <AssetCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onSelect={(mods) => select(item, mods)}
                onPick={pickFrom}
                resolveTargets={() => targetsFor(item)}
              />
            )
          )}
        </div>
      )}
    </section>
  )
}
