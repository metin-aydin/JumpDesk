import { useEffect, useRef } from 'react'
import {
  FileText,
  Folder,
  FolderOpen,
  History,
  Loader2,
  Rocket,
  Sparkles,
  SquareTerminal
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { isMac } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import type { Suggestion, SuggestionKind } from './autocomplete'
import { CursorPopup, type CursorAnchor } from './CursorPopup'
import type { GhostAnchor } from './GhostText'

const ICONS: Record<SuggestionKind, typeof History> = {
  history: History,
  snippet: Rocket,
  command: SquareTerminal,
  directory: Folder,
  file: FileText
}

export interface AutocompleteState {
  items: Suggestion[]
  index: number
  anchor: CursorAnchor
  /** İmleç satır sonundaysa seçili önerinin devamı komut satırında soluk gösterilir. */
  ghost?: GhostAnchor
  /** Dosya kipi (çift Tab): listelenen klasör; liste kabuktan bekleniyorsa `loading`. */
  folder?: string
  loading?: boolean
}

export function AutocompletePopup({
  state,
  onPick,
  onAi
}: {
  state: AutocompleteState
  onPick: (index: number) => void
  /** Yapay zeka kullanılabiliyorsa en üstte "Yapay zekaya sor" satırı gösterilir. */
  onAi?: () => void
}): React.JSX.Element {
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  // Klavyeyle seçilen öneri uzun listede görünür alana kaydırılır.
  useEffect(() => {
    void listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [state.index, state.items])
  return (
    <CursorPopup
      anchor={state.anchor}
      className="w-max max-w-[min(560px,calc(100vw-16px))] min-w-64 rounded-lg border bg-popover text-popover-foreground shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {state.folder && (
        <div className="flex items-center gap-1.5 border-b px-2.5 py-1 text-[11px] text-muted-foreground">
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate font-mono">{state.folder}</span>
        </div>
      )}
      {onAi && !state.folder && (
        <div
          role="button"
          onClick={onAi}
          className="flex cursor-pointer items-center gap-2 border-b px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{t('Yapay zekaya sor…')}</span>
          <kbd className="shrink-0 font-mono text-[10.5px]">Ctrl+Space</kbd>
        </div>
      )}
      <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
        {state.items.length === 0 && state.loading && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t('Klasör okunuyor…')}
          </div>
        )}
        {state.items.length === 0 && !state.loading && (
          <div className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
            {state.folder ? t('Klasörde eşleşen girdi yok') : t('Öneri yok')}
          </div>
        )}
        {state.items.map((item, i) => {
          const Icon = ICONS[item.kind]
          const typed = item.label.length - item.insert.trimEnd().length
          return (
            <div
              key={`${item.kind}:${item.label}`}
              role="option"
              aria-selected={i === state.index}
              onClick={() => onPick(i)}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1',
                i === state.index ? 'bg-accent text-accent-foreground' : ''
              )}
            >
              <Icon
                className={cn(
                  'size-3.5 shrink-0',
                  item.kind === 'snippet' ? 'text-warning' : 'text-muted-foreground'
                )}
              />
              <span className="min-w-0 truncate font-mono text-[12px]">
                <span className="text-muted-foreground">
                  {item.label.slice(0, Math.max(0, typed))}
                </span>
                {item.label.slice(Math.max(0, typed))}
              </span>
              {item.detail && (
                <span className="ml-auto shrink-0 pl-3 text-[11px] text-muted-foreground">
                  {item.detail}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t px-2.5 py-1 text-[10.5px] text-muted-foreground">
        {t('→ kabul · {partial} / işaretine kadar · ↑↓ seç · Esc kapat · Ctrl+Space aç', {
          partial: isMac ? '⌥→' : 'Ctrl+→'
        })}
      </div>
    </CursorPopup>
  )
}
