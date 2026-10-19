import { useEffect, useMemo, useRef, useState } from 'react'
import type { ISearchOptions, SearchAddon } from '@xterm/addon-search'
import { ArrowDown, ArrowUp, CaseSensitive, Regex, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useTheme } from '@/stores/theme'
import { SEARCH_DECORATIONS } from './search-decorations'

/**
 * Terminal geri kaydırma arabelleğinde arama: tüm eşleşmeler vurgulanır, etkin eşleşme görünür alana getirilir.
 * Enter sonraki, Shift+Enter önceki eşleşme; Esc kapatır ve odağı terminale geri verir.
 */
export function TerminalSearchBar({
  search,
  seed,
  onClose
}: {
  search: SearchAddon
  /** Açılışta kutuya yazılacak metin (ör. terminalde seçili metin). */
  seed: string
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState(seed)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [result, setResult] = useState<{ index: number; count: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resolved = useTheme((s) => s.info.resolved)
  const invalid = useMemo(() => {
    if (!regex || !query) return false
    try {
      new RegExp(query)
      return false
    } catch {
      return true
    }
  }, [query, regex])

  const options = (incremental = false): ISearchOptions => ({
    caseSensitive,
    regex,
    incremental,
    decorations: SEARCH_DECORATIONS[resolved]
  })

  useEffect(() => {
    const sub = search.onDidChangeResults((e) =>
      setResult({ index: e.resultIndex, count: e.resultCount })
    )
    return () => sub.dispose()
  }, [search])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [seed])

  useEffect(() => {
    if (!query || invalid) {
      search.clearDecorations()
      return
    }
    search.findNext(query, options(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex, resolved, invalid])

  useEffect(() => () => search.clearDecorations(), [search])

  const next = (): void => {
    if (query && !invalid) search.findNext(query, options())
  }
  const prev = (): void => {
    if (query && !invalid) search.findPrevious(query, options())
  }

  const toggle = (
    label: string,
    on: boolean,
    set: (v: boolean) => void,
    Icon: typeof Regex
  ): React.JSX.Element => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={() => set(!on)}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded',
        on
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="size-4" />
    </button>
  )

  return (
    <div
      role="search"
      aria-label={t('Terminalde Ara')}
      className="absolute top-2 right-2 left-2 z-20 flex flex-col gap-1 rounded-lg border bg-popover p-1 shadow-lg @min-[28rem]:left-auto @min-[28rem]:flex-row @min-[28rem]:items-center"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) prev()
            else next()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder={t('Terminalde ara')}
        spellCheck={false}
        className={cn(
          'h-6 w-full rounded border bg-background px-2 font-mono text-[12px] outline-none focus:border-ring/60 @min-[28rem]:w-56',
          invalid && 'border-destructive/70'
        )}
      />
      {/* Dar panelde giriş kutusu üst satırı kaplar, sayaç ve düğmeler alt satıra iner. */}
      <div className="flex items-center gap-1">
        <span className="min-w-8 flex-1 px-1 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums @min-[28rem]:flex-none @min-[28rem]:text-center">
          {invalid
            ? t('Geçersiz')
            : !query
              ? ''
              : result && result.count > 0
                ? `${result.index >= 0 ? result.index + 1 : '?'}/${result.count}`
                : t('Sonuç Yok')}
        </span>
        {toggle(t('Büyük/Küçük Harf Duyarlı'), caseSensitive, setCaseSensitive, CaseSensitive)}
        {toggle(t('Düzenli İfade'), regex, setRegex, Regex)}
        <button
          type="button"
          aria-label={t('Önceki Eşleşme')}
          title={t('Önceki Eşleşme (Shift+Enter)')}
          onClick={prev}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={t('Sonraki Eşleşme')}
          title={t('Sonraki Eşleşme (Enter)')}
          onClick={next}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowDown className="size-4" />
        </button>
        <button
          type="button"
          aria-label={t('Aramayı Kapat')}
          title={t('Aramayı Kapat (Esc)')}
          onClick={onClose}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
