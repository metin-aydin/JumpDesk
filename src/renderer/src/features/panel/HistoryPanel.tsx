import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ClipboardPaste, Copy, Loader2, Play, Search } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useT } from '@/lib/i18n'
import { useSessionInfo } from '@/stores/session-info'
import { runCommand, sendInput } from '@/features/terminal/dispatch'
import { useActiveTerminal } from './use-active-terminal'

const EMPTY: string[] = []
const ROW_HEIGHT = 28

/**
 * Oturumun komut geçmişi. Liste sanal çizilir ve tek bir sağ tık menüsü paylaşılır; sekme açılınca önce yükleniyor
 * simgesi görünür, uzun geçmiş arka planda (ertelenmiş) hazırlanır, böylece sekmeye geçişte arayüz donmaz.
 */
export function HistoryPanel(): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const { tab, handle } = useActiveTerminal()
  const info = useSessionInfo((s) => (tab ? s.byTab[tab.id] : undefined))
  const history = info?.history ?? EMPTY
  const deferredHistory = useDeferredValue(history, EMPTY)
  const deferredQuery = useDeferredValue(query)
  const preparing = deferredHistory !== history && history.length > 0
  const scrollRef = useRef<HTMLDivElement>(null)
  const menuCmd = useRef<string | null>(null)
  const [menuTarget, setMenuTarget] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const seen = new Set<string>()
    const out: string[] = []
    for (let i = deferredHistory.length - 1; i >= 0; i--) {
      const cmd = deferredHistory[i]
      if (seen.has(cmd)) continue
      seen.add(cmd)
      if (!q || cmd.toLowerCase().includes(q)) out.push(cmd)
    }
    return out
  }, [deferredHistory, deferredQuery])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  if (!tab) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {t('Geçmişi görmek için bir SSH oturumu seçin.')}
      </div>
    )
  }

  const run = (cmd: string): void => {
    if (!handle) return
    runCommand(handle.tabId, cmd)
    handle.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pt-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2 focus-within:border-ring/60">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('{title} geçmişinde ara', { title: tab.title })}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      {(info?.integration === 'pending' || preparing) && (
        <div className="flex items-center gap-2 px-3 pt-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />{' '}
          {info?.integration === 'pending' ? t('Geçmiş okunuyor…') : t('Geçmiş hazırlanıyor…')}
        </div>
      )}
      {info?.integration === 'failed' && (
        <div className="px-3 pt-3 text-xs text-muted-foreground">
          {t('Bu sunucudan geçmiş okunamadı (bash ya da zsh gerekir).')}
        </div>
      )}
      <ContextMenu
        open={menuOpen}
        onOpenChange={(open) => setMenuOpen(open && menuCmd.current !== null)}
      >
        <ContextMenuTrigger
          render={
            <div
              ref={scrollRef}
              onContextMenuCapture={() => {
                menuCmd.current = null
              }}
              className="min-h-0 flex-1 overflow-y-auto p-1.5"
            />
          }
        >
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((v) => {
              const cmd = rows[v.index]
              return (
                <div
                  key={v.key}
                  className="absolute inset-x-0"
                  style={{ top: v.start, height: ROW_HEIGHT }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    title={cmd}
                    onClick={() => run(cmd)}
                    onContextMenu={() => {
                      menuCmd.current = cmd
                      setMenuTarget(cmd)
                    }}
                    className="group/h flex h-full items-center gap-2 rounded-md px-2 hover:bg-sidebar-accent/70"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-sidebar-foreground">
                      {cmd}
                    </span>
                    <Play className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/h:opacity-100" />
                  </div>
                </div>
              )
            })}
          </div>
          {info?.integration === 'ready' && !preparing && rows.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {query ? t('Eşleşen komut yok') : t('Geçmiş boş')}
            </div>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <ContextMenuItem onClick={() => menuTarget && run(menuTarget)}>
            <Play /> {t('Çalıştır')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (!handle || !menuTarget) return
              sendInput(handle.tabId, menuTarget)
              handle.focus()
            }}
          >
            <ClipboardPaste /> {t('Terminale Yaz (Çalıştırmadan)')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => menuTarget && void navigator.clipboard.writeText(menuTarget)}
          >
            <Copy /> {t('Kopyala')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
