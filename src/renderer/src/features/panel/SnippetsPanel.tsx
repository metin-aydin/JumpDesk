import { useMemo, useState } from 'react'
import {
  ChevronRight,
  ListChecks,
  Pencil,
  Play,
  Rocket,
  Search,
  SquarePen,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TransferContextMenu } from '@/features/transfer/TransferContextMenu'
import { useT } from '@/lib/i18n'
import { readUserJson, writeUserJson } from '@/lib/user-storage'
import { cn } from '@/lib/utils'
import { useDialogs } from '@/stores/dialogs'
import { useServerMeta } from '@/stores/server-meta'
import { groupSnippets, useSnippets, type Snippet } from '@/stores/snippets'
import { runCommand } from '@/features/terminal/dispatch'
import { useActiveTerminal } from './use-active-terminal'

const NO_IDS: string[] = []
const OPEN_KEY = 'snippetGroupsOpen'

function readOpenGroups(): Set<string> {
  const saved = readUserJson<string[]>(OPEN_KEY)
  return new Set(Array.isArray(saved) ? saved : [])
}

function matches(s: Snippet, q: string): boolean {
  const needle = q.toLocaleLowerCase('tr')
  return s.name.toLocaleLowerCase('tr').includes(needle) || s.command.toLowerCase().includes(needle)
}

export function SnippetsPanel(): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const { tab, handle } = useActiveTerminal()
  const assetId = tab?.asset?.id
  const autoRun =
    useServerMeta((s) => (assetId ? s.byAsset[assetId]?.autoRun : undefined)) ?? NO_IDS
  const snippets = useSnippets((s) => s.snippets)
  const [openGroups, setOpenGroups] = useState(readOpenGroups)
  /** Sağ tıklanan snippet; panelin sağ tık menüsünde onu düzenleme öğesi gösterilir. */
  const [menuTarget, setMenuTarget] = useState<Snippet | null>(null)
  const autoCount = autoRun.filter((id) => snippets.some((s) => s.id === id)).length
  const searching = query.trim().length > 0
  const groups = useMemo(() => {
    const list = searching
      ? snippets.filter(
          (s) =>
            matches(s, query.trim()) ||
            s.group.toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr'))
        )
      : snippets
    return groupSnippets(list)
  }, [query, searching, snippets])

  const toggleGroup = (group: string): void => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      writeUserJson(OPEN_KEY, [...next])
      return next
    })
  }

  const run = (snippet: Snippet): void => {
    if (!handle) {
      toast(t('Önce bir SSH oturumu seçin'), {
        description: t('Snippet etkin terminal sekmesinde çalışır.')
      })
      return
    }
    runCommand(handle.tabId, snippet.command)
    handle.focus()
  }

  const toggleAutoRun = (snippet: Snippet): void => {
    if (!assetId) return
    const next = autoRun.includes(snippet.id)
      ? autoRun.filter((id) => id !== snippet.id)
      : [...autoRun, snippet.id]
    void useServerMeta.getState().update(assetId, { autoRun: next })
  }

  const editor = useDialogs.getState().openSnippetEditor
  return (
    <TransferContextMenu
      section="snippets"
      className="flex min-h-0 flex-1 flex-col"
      items={
        <>
          {menuTarget && (
            <ContextMenuItem onClick={() => editor(menuTarget.id)}>
              <Pencil /> {t('“{name}” Snippetini Düzenle', { name: menuTarget.name })}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => editor()}>
            <SquarePen /> {t('Snippetleri Düzenle')}
          </ContextMenuItem>
        </>
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        onContextMenuCapture={() => setMenuTarget(null)}
      >
        <div className="px-2 pt-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2 focus-within:border-ring/60">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Snippet ara')}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        {tab?.asset && (
          <div className="px-3 pt-2 text-[11px] text-muted-foreground">
            <Zap className="mr-1 inline size-3 text-warning" />
            {autoCount > 0
              ? t('{name} bağlanınca {n} snippet çalışır', { name: tab.asset.name, n: autoCount })
              : t('{name} için bağlanınca çalışacak snippet seçilmedi', { name: tab.asset.name })}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {groups.map(([group, items]) => {
            const open = searching || openGroups.has(group)
            const groupAutoCount = items.filter((s) => autoRun.includes(s.id)).length
            return (
              <div key={group} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform',
                      open && 'rotate-90'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{group}</span>
                  {groupAutoCount > 0 && <Zap className="size-3 text-warning" />}
                  <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                    {items.length}
                  </span>
                </button>
                {open && (
                  <div className="space-y-px pl-3">
                    {items.map((snippet) => {
                      const isAuto = autoRun.includes(snippet.id)
                      return (
                        <div
                          key={snippet.id}
                          role="button"
                          tabIndex={0}
                          onContextMenu={() => setMenuTarget(snippet)}
                          onClick={() => run(snippet)}
                          onKeyDown={(e) => e.key === 'Enter' && run(snippet)}
                          className="group/snip flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent/70 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] text-sidebar-foreground">
                              {snippet.name}
                            </div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {snippet.command}
                            </div>
                          </div>
                          {assetId && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    aria-label={t('Bağlanınca Çalıştır')}
                                    aria-pressed={isAuto}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleAutoRun(snippet)
                                    }}
                                    className={cn(
                                      'inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-foreground/10',
                                      isAuto
                                        ? 'text-warning'
                                        : 'text-muted-foreground opacity-0 group-hover/snip:opacity-100'
                                    )}
                                  />
                                }
                              >
                                <Zap className="size-3.5" />
                              </TooltipTrigger>
                              <TooltipContent>
                                {isAuto
                                  ? t('Otomatik Çalıştırmadan Çıkar')
                                  : t('{name} Bağlanınca Çalıştır', {
                                      name: tab?.asset?.name ?? ''
                                    })}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Play className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/snip:opacity-100" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {groups.length === 0 &&
            (snippets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
                <Rocket className="size-5" />
                {t(
                  'Henüz snippet yok. Aşağıdaki düğmeyle ekleyin ya da bir JumpDesk dosyasından içe aktarın (sağ tık → İçe Aktar).'
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {t('Eşleşen snippet yok')}
              </div>
            ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 border-t border-sidebar-border p-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 bg-background shadow-sm hover:shadow"
            onClick={() => editor()}
          >
            <ListChecks /> {t('Snippetler')}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {t('{n} Snippet', { n: snippets.length })}
            </span>
          </Button>
        </div>
      </div>
    </TransferContextMenu>
  )
}
