import { useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FolderPlus, LayoutDashboard } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useT } from '@/lib/i18n'
import { readUserJson, writeUserJson } from '@/lib/user-storage'
import { cn } from '@/lib/utils'
import {
  groupByFolder,
  layoutSummary,
  openLayout,
  useLayoutDialog,
  useLayouts,
  type SavedLayout
} from '@/stores/layouts'
import { layoutDragProps, useDropTarget } from './layout-dnd'
import { FolderMenuItems, LayoutMenuItems } from './LayoutMenus'

/** Sunucu ağacının satırlarıyla aynı ölçüler (ServerTree). */
const INDENT = 14
const OPEN_KEY = 'layoutTreeOpen'
const ROW_CLASS =
  'group/row flex h-7 w-full items-center gap-1.5 overflow-hidden rounded-md pr-2 text-left text-[13px] text-sidebar-foreground outline-none hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-sidebar-ring'
const DROP_CLASS = 'bg-sidebar-accent ring-1 ring-sidebar-ring/60'

interface OpenState {
  root: boolean
  folders: string[]
}

function readOpen(): OpenState {
  const saved = readUserJson<Partial<OpenState>>(OPEN_KEY)
  return {
    root: saved?.root === true,
    folders: Array.isArray(saved?.folders) ? saved.folders.filter((f) => typeof f === 'string') : []
  }
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <ChevronRight
      className={cn(
        'size-3.5 shrink-0 text-muted-foreground transition-transform duration-100',
        open && 'rotate-90'
      )}
    />
  )
}

function LayoutRow({ layout, level }: { layout: SavedLayout; level: number }): React.JSX.Element {
  const t = useT()
  const drop = useDropTarget(layout.folder ?? null)
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            {...layoutDragProps(layout)}
            {...drop.props}
            data-layout-row={layout.id}
            title={t('Açmak İçin Çift Tıklayın')}
            onDoubleClick={() => openLayout(layout)}
            onKeyDown={(e) => e.key === 'Enter' && openLayout(layout)}
            className={cn(ROW_CLASS, drop.over && DROP_CLASS)}
            style={{ paddingLeft: 6 + level * INDENT }}
          />
        }
      >
        <span className="w-3.5 shrink-0" />
        <LayoutDashboard className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{layout.name}</span>
        <span className="shrink-0 pl-2 text-[11px] whitespace-nowrap text-muted-foreground/70">
          {layoutSummary(layout)}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <LayoutMenuItems layout={layout} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FolderRow({
  name,
  layouts,
  open,
  onToggle
}: {
  name: string
  layouts: SavedLayout[]
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  const t = useT()
  const drop = useDropTarget(name)
  const Icon = open ? FolderOpen : Folder
  return (
    <div {...drop.props} data-layout-tree-folder={name}>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              aria-expanded={open}
              onClick={onToggle}
              className={cn(ROW_CLASS, drop.over && DROP_CLASS)}
              style={{ paddingLeft: 6 + INDENT }}
            />
          }
        >
          <Chevron open={open} />
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="shrink-0 pl-2 text-[11px] text-muted-foreground tabular-nums">
            {layouts.length}
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <FolderMenuItems name={name} count={layouts.length} />
        </ContextMenuContent>
      </ContextMenu>
      {open &&
        (layouts.length ? (
          layouts.map((layout) => <LayoutRow key={layout.id} layout={layout} level={2} />)
        ) : (
          <div
            className="flex h-7 items-center text-[12px] text-muted-foreground/70"
            style={{ paddingLeft: 6 + 2 * INDENT + 20 }}
          >
            {t('Klasör boş')}
          </div>
        ))}
    </div>
  )
}

/**
 * Sol ağacın en üstündeki "Kayıtlı Düzenler" düğümü: altında düzen klasörleri ve klasörsüz düzenler, sunucu ağacının
 * satırlarıyla aynı görünümde. Çift tık ya da Enter düzeni açar; düzen satırı bir klasöre (ya da klasördeki başka bir
 * düzene) sürüklenince o klasöre, kök satıra bırakılınca klasör dışına taşınır. Kök satırdaki düğme ve sağ tık menüsü
 * yeni klasör açar. Açık/kapalı durumları hatırlanır.
 */
export function LayoutTree(): React.JSX.Element {
  const t = useT()
  const layouts = useLayouts((s) => s.layouts)
  const folders = useLayouts((s) => s.folders)
  const [open, setOpen] = useState(readOpen)
  const rootDrop = useDropTarget(null)
  const grouped = groupByFolder(layouts, folders)
  const update = (next: OpenState): void => {
    setOpen(next)
    writeUserJson(OPEN_KEY, next)
  }
  const toggleFolder = (name: string): void =>
    update({
      ...open,
      folders: open.folders.includes(name)
        ? open.folders.filter((f) => f !== name)
        : [...open.folders, name]
    })
  return (
    <div data-layout-tree>
      <div {...rootDrop.props}>
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div
                role="button"
                tabIndex={0}
                aria-expanded={open.root}
                onClick={() => update({ ...open, root: !open.root })}
                onKeyDown={(e) => e.key === 'Enter' && update({ ...open, root: !open.root })}
                className={cn(ROW_CLASS, rootDrop.over && DROP_CLASS)}
                style={{ paddingLeft: 6 }}
              />
            }
          >
            <Chevron open={open.root} />
            <LayoutDashboard className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">{t('Kayıtlı Düzenler')}</span>
            <button
              type="button"
              title={t('Yeni Klasör')}
              aria-label={t('Yeni Klasör')}
              onClick={(e) => {
                e.stopPropagation()
                useLayoutDialog.getState().openNewFolder()
              }}
              className="hidden size-5 shrink-0 items-center justify-center rounded text-muted-foreground group-hover/row:inline-flex hover:bg-sidebar-accent hover:text-foreground"
            >
              <FolderPlus className="size-3.5" />
            </button>
            <span className="shrink-0 pl-1 text-[11px] text-muted-foreground tabular-nums">
              {layouts.length}
            </span>
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-48">
            <ContextMenuItem onClick={() => useLayoutDialog.getState().openNewFolder()}>
              <FolderPlus /> {t('Yeni Klasör…')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      {open.root && (
        <>
          {grouped.folders.map((folder) => (
            <FolderRow
              key={folder.name}
              name={folder.name}
              layouts={folder.layouts}
              open={open.folders.includes(folder.name)}
              onToggle={() => toggleFolder(folder.name)}
            />
          ))}
          {grouped.loose.map((layout) => (
            <LayoutRow key={layout.id} layout={layout} level={1} />
          ))}
          {layouts.length === 0 && folders.length === 0 && (
            <div
              className="flex h-7 items-center text-[12px] text-muted-foreground/70"
              style={{ paddingLeft: 6 + INDENT + 20 }}
            >
              {t('Kayıtlı düzen yok')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
