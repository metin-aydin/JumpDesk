import { useMemo } from 'react'
import {
  AppWindow,
  Bell,
  Columns2,
  Download,
  FolderOpen,
  Grid2x2,
  Highlighter,
  History,
  Keyboard,
  LayoutDashboard,
  Maximize2,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  PanelTopOpen,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Rows2,
  Search,
  Settings,
  SquarePen,
  SquareTerminal,
  Sun,
  Ungroup,
  Upload,
  X,
  XSquare,
  Zap
} from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import { useSnippets } from '@/stores/snippets'
import { openExport, openImport } from '@/features/transfer/actions'
import { runCommand } from '@/features/terminal/dispatch'
import { terminalRegistry } from '@/features/terminal/registry'
import { useT } from '@/lib/i18n'
import { SETTINGS_SHORTCUT, isMac, shortcutLabel } from '@/lib/shortcuts'
import { useDialogs } from '@/stores/dialogs'
import { jumpdesk } from '@/lib/jumpdesk'
import { openLayout, useLayoutDialog, useLayouts } from '@/stores/layouts'
import { closeAllSafely, closeTabSafely, ungroupSafely } from '@/features/layouts/guard'
import { useRightPanel } from '@/stores/right-panel'
import {
  dockWindow,
  openGroupInNewWindow,
  openInNewWindow
} from '@/features/windows/detached-windows'
import { useTabSearch } from '@/stores/tab-search'
import { useTheme } from '@/stores/theme'
import { useTreeCommands } from '@/stores/tree-commands'
import { groupOf, tabTitle, useWorkspace, windowIdOf } from '@/stores/workspace'

interface PaletteCommand {
  id: string
  label: string
  Icon: typeof Plus
  shortcut?: string
  keywords?: string[]
  run: () => void
}

interface PaletteGroup {
  heading: string
  items: PaletteCommand[]
}

/** Paletin açıldığı andaki duruma göre (etkin sekme, grup, terminal, düzenler) komutları geçerli dilde üretir. */
function buildCommands(
  t: ReturnType<typeof useT>,
  setTheme: (p: 'system' | 'light' | 'dark') => void
): PaletteGroup[] {
  const ws = useWorkspace.getState()
  const group = groupOf(ws.groups, ws.activeId)
  const terminal = terminalRegistry.get(ws.activeId)
  const panel = useRightPanel.getState()
  const groups: PaletteGroup[] = [
    {
      heading: t('Genel'),
      items: [
        {
          id: 'new',
          label: t('Yeni Bağlantı'),
          Icon: Plus,
          shortcut: shortcutLabel('T'),
          run: () => ws.openConnectTab()
        },
        {
          id: 'server-search',
          label: t('Sunucu Ara'),
          Icon: Search,
          shortcut: shortcutLabel('F'),
          run: () => useTreeCommands.getState().focusSearch()
        },
        {
          id: 'shortcuts',
          label: t('Klavye Kısayolları'),
          Icon: Keyboard,
          shortcut: shortcutLabel('K'),
          run: () => useDialogs.getState().setShortcuts(true)
        },
        {
          id: 'settings',
          label: t('Ayarlar'),
          Icon: Settings,
          shortcut: SETTINGS_SHORTCUT,
          run: () => useDialogs.getState().setSettings(true)
        },
        {
          id: 'check-updates',
          label: t('Güncellemeleri Denetle'),
          Icon: RefreshCw,
          keywords: ['update', t('sürüm'), 'version'],
          run: () => {
            useDialogs.getState().openSettings('updates')
            void jumpdesk.update.check()
          }
        },
        {
          id: 'snippet-editor',
          label: t('Snippetleri Düzenle'),
          Icon: SquarePen,
          run: () => useDialogs.getState().openSnippetEditor()
        },
        {
          id: 'export',
          label: t('Dışa Aktar…'),
          Icon: Upload,
          keywords: [t('yedek'), 'export', 'snippet', 'alarm', t('vurgu'), t('düzen'), t('ayar')],
          run: () => openExport()
        },
        {
          id: 'import',
          label: t('İçe Aktar…'),
          Icon: Download,
          keywords: [
            t('yedek'),
            'import',
            t('geri yükle'),
            'snippet',
            'alarm',
            t('vurgu'),
            t('düzen'),
            t('ayar')
          ],
          run: () => void openImport()
        }
      ]
    },
    {
      heading: t('Sekmeler'),
      items: [
        {
          id: 'tab-search',
          label: t('Sekmelerde Ara'),
          Icon: Search,
          shortcut: isMac ? '⌘⇧A' : 'Ctrl+Shift+A',
          run: () => useTabSearch.getState().setOpen(true)
        },
        {
          id: 'close',
          label: t('Sekmeyi Kapat'),
          Icon: X,
          shortcut: shortcutLabel('W'),
          run: () => void closeTabSafely(ws.activeId)
        },
        ...(group
          ? [
              {
                id: 'group-new-window',
                label: t('Grubu Yeni Pencerede Aç'),
                Icon: AppWindow,
                keywords: [t('pencere'), t('ayır'), 'window'],
                run: () => openGroupInNewWindow(group.id)
              }
            ]
          : ws.tabs.find((tab) => tab.id === ws.activeId)?.kind === 'session'
            ? [
                {
                  id: 'new-window',
                  label: t('Sekmeyi Yeni Pencerede Aç'),
                  Icon: AppWindow,
                  keywords: [t('pencere'), t('ayır'), 'window'],
                  run: () => void openInNewWindow(ws.activeId)
                }
              ]
            : []),
        ...[...new Set(ws.detached.map(windowIdOf))].map((windowId) => {
          const members = ws.detached.filter((tab) => windowIdOf(tab) === windowId)
          const detachedGroup = groupOf(ws.groups, members[0].id)
          return {
            id: `dock-${windowId}`,
            label: t('Ana Pencereye Geri Al: {name}', {
              name: detachedGroup?.name ?? members.map((tab) => tabTitle(tab, t)).join(', ')
            }),
            Icon: PanelTopOpen,
            run: () => dockWindow(windowId)
          }
        }),
        {
          id: 'close-all',
          label: t('Tümünü Kapat'),
          Icon: XSquare,
          run: () => void closeAllSafely()
        },
        ...ws.tabs.map((tab) => ({
          id: `go-${tab.id}`,
          label: t('Sekmeye Geç: {title}', { title: tabTitle(tab, t) }),
          Icon: SquareTerminal,
          keywords: [tab.asset?.address ?? ''],
          run: () => ws.activate(tab.id)
        }))
      ]
    },
    {
      heading: t('Görünüm'),
      items: [
        {
          id: 'left',
          label: t('Sunucu Ağacını Aç/Kapat'),
          Icon: PanelLeft,
          shortcut: shortcutLabel('E'),
          run: () => ws.toggleLeftPanel()
        },
        {
          id: 'right',
          label: t('Sağ Paneli Aç/Kapat'),
          Icon: PanelRight,
          shortcut: shortcutLabel('B'),
          run: () => ws.toggleRightPanel()
        },
        {
          id: 'p-snippets',
          label: t('Snippetler Panelini Aç'),
          Icon: Rocket,
          run: () => panel.show('snippets')
        },
        {
          id: 'p-history',
          label: t('Geçmiş Panelini Aç'),
          Icon: History,
          run: () => panel.show('history')
        },
        {
          id: 'p-files',
          label: t('Dosyalar Panelini Aç'),
          Icon: FolderOpen,
          run: () => panel.show('files')
        },
        {
          id: 'p-alarms',
          label: t('Alarmlar Panelini Aç'),
          Icon: Bell,
          keywords: ['alarm', t('kural')],
          run: () => panel.show('alarms')
        },
        {
          id: 'p-highlights',
          label: t('Vurgular Panelini Aç'),
          Icon: Highlighter,
          keywords: [t('vurgu'), t('renk'), 'highlight'],
          run: () => panel.show('highlights')
        },
        {
          id: 'theme-system',
          label: t('Tema: Sistem'),
          Icon: Monitor,
          run: () => setTheme('system')
        },
        { id: 'theme-light', label: t('Tema: Açık'), Icon: Sun, run: () => setTheme('light') },
        { id: 'theme-dark', label: t('Tema: Koyu'), Icon: Moon, run: () => setTheme('dark') }
      ]
    },
    {
      heading: t('Bölünmüş Görünüm'),
      items: [
        {
          id: 'arr-v',
          label: t('Yan Yana Yerleştir'),
          Icon: Columns2,
          run: () => ws.arrange('vertical')
        },
        {
          id: 'arr-h',
          label: t('Alt Alta Yerleştir'),
          Icon: Rows2,
          run: () => ws.arrange('horizontal')
        },
        {
          id: 'arr-g',
          label: t('Izgara Olarak Yerleştir'),
          Icon: Grid2x2,
          run: () => ws.arrange('grid')
        },
        ...(group
          ? [
              {
                id: 'zoom',
                label: t('Paneli Büyüt/Küçült'),
                Icon: Maximize2,
                shortcut: shortcutLabel('Enter'),
                run: () => ws.toggleZoom()
              },
              {
                id: 'broadcast',
                label: group.broadcast
                  ? t('Yayını Kapat')
                  : t('Girdiyi Tüm Panellere Gönder (Yayın)'),
                Icon: Radio,
                run: () => ws.toggleBroadcast(group.id)
              },
              {
                id: 'ungroup',
                label: t('Grubu Ayır'),
                Icon: Ungroup,
                run: () => void ungroupSafely(group.id)
              }
            ]
          : [])
      ]
    },
    {
      heading: t('Çalışma Düzenleri'),
      items: [
        {
          id: 'layout-save',
          label: t('Düzeni Kaydet…'),
          Icon: LayoutDashboard,
          run: () => useLayoutDialog.getState().openSave()
        },
        ...useLayouts.getState().layouts.map((layout) => ({
          id: `layout-${layout.id}`,
          label: t('Düzeni Aç: {name}', { name: layout.name }),
          Icon: LayoutDashboard,
          run: () => openLayout(layout)
        }))
      ]
    }
  ]
  if (terminal) {
    groups.push({
      heading: t('Terminal'),
      items: [
        {
          id: 'term-search',
          label: t('Terminalde Ara'),
          Icon: Search,
          shortcut: isMac ? '⌘F' : 'Ctrl+F',
          run: () => terminal.openSearch()
        },
        ...useSnippets.getState().snippets.map((snippet) => ({
          id: `snippet-${snippet.id}`,
          label: t('Snippet Çalıştır: {name}', { name: snippet.name }),
          Icon: Zap,
          keywords: [snippet.command, snippet.group ?? ''],
          run: () => runCommand(terminal.tabId, snippet.command)
        }))
      ]
    })
  }
  return groups
}

/** Komut paleti (Ctrl+Shift+P): uygulamadaki eylemleri, sekmeleri, düzenleri ve snippetleri aranabilir listede sunar. */
export function CommandPalette(): React.JSX.Element {
  const open = useDialogs((s) => s.palette)
  const setOpen = useDialogs((s) => s.setPalette)
  const setPreference = useTheme((s) => s.setPreference)
  const t = useT()
  const groups = useMemo(
    () => (open ? buildCommands(t, (p) => void setPreference(p)) : []),
    [open, setPreference, t]
  )
  const run = (cmd: PaletteCommand): void => {
    setOpen(false)
    setTimeout(cmd.run, 0)
  }
  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('Komut Paleti')}
      description={t('Bir komut arayın')}
      className="top-[12vh] sm:max-w-xl"
    >
      <Command>
        <CommandInput placeholder={t('Komut, sekme, düzen ya da snippet ara…')} />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>{t('Eşleşen komut yok')}</CommandEmpty>
          {groups.map((group) =>
            group.items.length ? (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.label} ${cmd.id}`}
                    keywords={cmd.keywords}
                    onSelect={() => run(cmd)}
                  >
                    <cmd.Icon />
                    <span className="truncate">{cmd.label}</span>
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
