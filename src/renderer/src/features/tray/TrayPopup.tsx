import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LayoutDashboard, Search } from 'lucide-react'
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

/**
 * Sistem tepsisinden açılan kayıtlı düzen listesi (macOS ve Windows): ara, ok tuşlarıyla seç, Enter ya da tıkla aç;
 * Esc ve pencere dışına tıklamak kapatır. Linux'ta tepsi yalnız masaüstünün kendi menüsünü gösterebildiği için
 * kullanılmaz.
 */
export function TrayPopup(): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState(api.initial)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
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
  const shown = state.layouts.filter((l) => l.name.toLocaleLowerCase(locale).includes(needle))
  const active = Math.min(index, Math.max(0, shown.length - 1))

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') setIndex(Math.min(active + 1, shown.length - 1))
    else if (e.key === 'ArrowUp') setIndex(Math.max(active - 1, 0))
    else if (e.key === 'Enter' && shown[active]) api.choose(shown[active].id)
    else if (e.key === 'Escape') api.close()
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
        {shown.map((layout, i) => (
          <button
            key={layout.id}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setIndex(i)}
            onClick={() => api.choose(layout.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px]',
              i === active && 'bg-accent text-accent-foreground'
            )}
          >
            <span className="min-w-0 flex-1 truncate">{layout.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {t('{n} sunucu', { n: layout.servers })}
            </span>
          </button>
        ))}
        {state.layouts.length === 0 && (
          <p className="px-2.5 py-3 text-[12px] text-muted-foreground">
            {t('Kayıtlı düzen yok. Sekmeye sağ tıklayıp “Düzeni Kaydet…” ile kaydedebilirsiniz.')}
          </p>
        )}
        {state.layouts.length > 0 && shown.length === 0 && (
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
