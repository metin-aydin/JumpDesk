import { useState } from 'react'
import { ChevronRight, Folder, FolderPlus, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { CARD_CLASS } from '@/features/workspace/card-styles'
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
import { layoutDragProps, useDropTarget, useLayoutDrag } from './layout-dnd'
import { FolderMenuItems, LayoutMenuItems } from './LayoutMenus'

const CLOSED_KEY = 'layoutFoldersClosed'
const GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2'
/** Bırakma alanının vurgusu; halka (gölge) olduğu için yerleşimi kaydırmaz. */
const DROP_CLASS = 'bg-primary/5 ring-1 ring-primary/50'

function LayoutCard({ layout }: { layout: SavedLayout }): React.JSX.Element {
  const t = useT()
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            {...layoutDragProps(layout)}
            data-layout-card={layout.id}
            title={t('Açmak İçin Çift Tıklayın')}
            onDoubleClick={() => openLayout(layout)}
            onKeyDown={(e) => e.key === 'Enter' && openLayout(layout)}
            className={CARD_CLASS}
          />
        }
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <LayoutDashboard className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{layout.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {layoutSummary(layout)}
          </span>
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <LayoutMenuItems layout={layout} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Klasör: başlığı bölümün sol kenarıyla hizalı, kartları başlıktaki klasör simgesinin hizasından başlar. */
function FolderSection({
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
  return (
    <div
      {...drop.props}
      data-layout-folder={name}
      className={cn('rounded-lg transition-colors', drop.over && DROP_CLASS)}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              aria-expanded={open}
              onClick={onToggle}
              className="flex w-full items-center gap-2 rounded-md py-1.5 text-left text-[13px] font-medium hover:text-foreground"
            />
          }
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          <Folder className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate">{name}</span>
          <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
            {layouts.length}
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <FolderMenuItems name={name} count={layouts.length} />
        </ContextMenuContent>
      </ContextMenu>
      {open && (
        <div className="pt-1 pb-2 pl-5.5">
          {layouts.length ? (
            <div className={GRID_CLASS}>
              {layouts.map((layout) => (
                <LayoutCard key={layout.id} layout={layout} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              {t(
                'Klasör boş. Düzenleri buraya sürükleyin ya da düzene sağ tıklayıp “Klasöre Taşı” seçin.'
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function readClosed(): Set<string> {
  const saved = readUserJson<string[]>(CLOSED_KEY)
  return new Set(Array.isArray(saved) ? saved : [])
}

/**
 * "Yeni Bağlantı" ekranında kayıtlı çalışma düzenleri: önce klasörler (açılır/kapanır, kapalı olanlar hatırlanır),
 * sonra klasörsüz düzenler. Düzen kartı klasöre sürüklenerek ya da sağ tık menüsünden taşınır; klasörsüz alana
 * bırakılan düzen klasörden çıkar. Düzen ve klasör yoksa bölüm gösterilmez.
 */
export function SavedLayouts(): React.JSX.Element | null {
  const t = useT()
  const layouts = useLayouts((s) => s.layouts)
  const folders = useLayouts((s) => s.folders)
  const [closed, setClosed] = useState(readClosed)
  const rootDrop = useDropTarget(null)
  const dragging = useLayoutDrag((s) => s.dragging)
  if (layouts.length === 0 && folders.length === 0) return null
  const grouped = groupByFolder(layouts, folders)
  const toggle = (name: string): void =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      writeUserJson(CLOSED_KEY, [...next])
      return next
    })
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LayoutDashboard className="size-3.5" /> {t('Kayıtlı Düzenler')}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          title={t('Düzenleri Gruplamak İçin Klasör Oluştur')}
          onClick={() => useLayoutDialog.getState().openNewFolder()}
        >
          <FolderPlus /> {t('Yeni Klasör')}
        </Button>
      </div>
      {grouped.folders.length > 0 && (
        <div className="space-y-0.5">
          {grouped.folders.map((folder) => (
            <FolderSection
              key={folder.name}
              name={folder.name}
              layouts={folder.layouts}
              open={!closed.has(folder.name)}
              onToggle={() => toggle(folder.name)}
            />
          ))}
        </div>
      )}
      {(grouped.loose.length > 0 || dragging?.folder) && (
        <div
          {...rootDrop.props}
          data-layout-folder=""
          className={cn('rounded-lg transition-colors', rootDrop.over && DROP_CLASS)}
        >
          {grouped.loose.length > 0 ? (
            <div className={GRID_CLASS}>
              {grouped.loose.map((layout) => (
                <LayoutCard key={layout.id} layout={layout} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              {t('Klasörden çıkarmak için buraya bırakın.')}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
