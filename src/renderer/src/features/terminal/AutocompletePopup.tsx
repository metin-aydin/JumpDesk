import { FileText, Folder, History, Rocket, Sparkles, SquareTerminal } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Suggestion, SuggestionKind } from './autocomplete'
import { CursorPopup, type CursorAnchor } from './CursorPopup'

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
  return (
    <CursorPopup
      anchor={state.anchor}
      className="w-max max-w-[min(560px,calc(100vw-16px))] min-w-64 rounded-lg border bg-popover text-popover-foreground shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {onAi && (
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
      <div className="py-1">
        {state.items.length === 0 && (
          <div className="px-2.5 py-1.5 text-[12px] text-muted-foreground">{t('Öneri yok')}</div>
        )}
        {state.items.map((item, i) => {
          const Icon = ICONS[item.kind]
          const typed = item.label.length - item.insert.trimEnd().length
          return (
            <div
              key={`${item.kind}:${item.label}`}
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
        {t('Tab / → kabul · ↑↓ seç · Esc kapat · Ctrl+Space aç')}
      </div>
    </CursorPopup>
  )
}
