import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight, Folder, LayoutDashboard, Search } from 'lucide-react'
import type { TrayLayout } from '@shared/api'
import type { TrayPopupState } from '@shared/tray-popup'
import { currentLocale, useLanguage, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const api = window.jumpdeskTray!

function applyState(state: TrayPopupState): void {
  document.documentElement.classList.toggle('dark', state.dark)
  document.documentElement.style.colorScheme = state.dark ? 'dark' : 'light'
  document.documentElement.lang = state.language
  useLanguage.setState({ language: state.language })
}
applyState(api.initial)

type Row =
  | { type: 'folder'; name: string; count: number; open: boolean }
  | { type: 'layout'; layout: TrayLayout; nested: boolean; showFolder: boolean }

/**
 * Listedeki satırlar. Aramada eşleşen düzenler (adı ya da klasörünün adı eşleşen) klasör adıyla düz liste olarak; arama
 * yokken önce klasörler (açık olanların düzenleri altında girintili), sonra klasörsüz düzenler.
 */
function buildRows(
  state: TrayPopupState,
  needle: string,
  open: Set<string>,
  locale: string
): Row[] {
  const has = (text: string): boolean => text.toLocaleLowerCase(locale).includes(needle)
  if (needle)
    return state.layouts
      .filter((l) => has(l.name) || (l.folder !== undefined && has(l.folder)))
      .map((layout) => ({ type: 'layout', layout, nested: false, showFolder: true }))
  const rows: Row[] = []
  for (const name of state.folders) {
    const inside = state.layouts.filter((l) => l.folder === name)
    rows.push({ type: 'folder', name, count: inside.length, open: open.has(name) })
    if (open.has(name))
      for (const layout of inside)
        rows.push({ type: 'layout', layout, nested: true, showFolder: false })
  }
  for (const layout of state.layouts)
    if (!layout.folder || !state.folders.includes(layout.folder))
      rows.push({ type: 'layout', layout, nested: false, showFolder: false })
  return rows
}

/**
 * Sistem tepsisinden açılan kayıtlı düzen listesi (macOS ve Windows): klasörler tıklayınca, Enter ya da → ile açılır
 * (← kapatır); ara, ok tuşlarıyla seç, Enter ya da tıkla aç; Esc ve pencere dışına tıklamak kapatır. Linux'ta tepsi
 * yalnız masaüstünün kendi menüsünü gösterebildiği için kullanılmaz (orada klasörler alt menüdür).
 */
export function TrayPopup(): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState(api.initial)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(
    () =>
      api.onState((next) => {
        applyState(next)
        setState(next)
        setQuery('')
        setIndex(0)
        inputRef.current?.focus()
      }),
    []
  )

  useLayoutEffect(() => {
    const el = rootRef.current
    if (el) api.setHeight(Math.ceil(el.getBoundingClientRect().height))
  })

  const locale = currentLocale()
  const needle = query.trim().toLocaleLowerCase(locale)
  const rows = buildRows(state, needle, openFolders, locale)
  const active = Math.min(index, Math.max(0, rows.length - 1))

  const setFolderOpen = (name: string, open: boolean): void =>
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (open) next.add(name)
      else next.delete(name)
      return next
    })
  const activate = (row: Row | undefined): void => {
    if (!row) return
    if (row.type === 'folder') setFolderOpen(row.name, !row.open)
    else api.choose(row.layout.id)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const row = rows[active]
    if (e.key === 'ArrowDown') setIndex(Math.min(active + 1, rows.length - 1))
    else if (e.key === 'ArrowUp') setIndex(Math.max(active - 1, 0))
    else if (e.key === 'Enter') activate(row)
    else if (e.key === 'ArrowRight' && row?.type === 'folder' && !row.open)
      setFolderOpen(row.name, true)
    else if (e.key === 'ArrowLeft' && row?.type === 'folder' && row.open)
      setFolderOpen(row.name, false)
    else if (e.key === 'ArrowLeft' && row?.type === 'layout' && row.nested) {
      const parent = rows.findIndex((r) => r.type === 'folder' && r.name === row.layout.folder)
      if (parent >= 0) setIndex(parent)
    } else if (e.key === 'Escape') api.close()
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className="m-1 flex flex-col overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
    >
      <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-[13px] font-medium">
        <LayoutDashboard className="size-4 text-primary" />
        {t('JumpDesk Düzenleri')}
      </div>
      {state.layouts.length > 0 && (
        <label className="mx-1 mb-1.5 flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-[12px] focus-within:border-ring/60">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            placeholder={t('Düzen ara')}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}
      <div role="listbox" aria-label={t('Kayıtlı Düzenler')} className="max-h-80 overflow-y-auto">
        {rows.map((row, i) =>
          row.type === 'folder' ? (
            <button
              key={`folder:${row.name}`}
              type="button"
              role="option"
              aria-selected={i === active}
              aria-expanded={row.open}
              onMouseEnter={() => setIndex(i)}
              onClick={() => activate(row)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                i === active && 'bg-accent text-accent-foreground'
              )}
            >
              <ChevronRight
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform',
                  row.open && 'rotate-90'
                )}
              />
              <Folder className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {row.count}
              </span>
            </button>
          ) : (
            <button
              key={row.layout.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setIndex(i)}
              onClick={() => api.choose(row.layout.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md py-1.5 pr-2.5 text-left text-[13px]',
                row.nested ? 'pl-[2.125rem]' : 'pl-2.5',
                i === active && 'bg-accent text-accent-foreground'
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {row.showFolder && row.layout.folder && (
                  <span className="text-muted-foreground">{row.layout.folder} › </span>
                )}
                {row.layout.name}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {t('{n} sunucu', { n: row.layout.servers })}
              </span>
            </button>
          )
        )}
        {state.layouts.length === 0 && state.folders.length === 0 && (
          <p className="px-2.5 py-3 text-[12px] text-muted-foreground">
            {t('Kayıtlı düzen yok. Sekmeye sağ tıklayıp “Düzeni Kaydet…” ile kaydedebilirsiniz.')}
          </p>
        )}
        {needle && rows.length === 0 && (
          <p className="px-2.5 py-3 text-[12px] text-muted-foreground">{t('Eşleşen düzen yok')}</p>
        )}
      </div>
      <div className="mt-1.5 border-t pt-1.5">
        <button
          type="button"
          onClick={() => api.showApp()}
          className="w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {t("JumpDesk'i Göster")}
        </button>
      </div>
    </div>
  )
}
