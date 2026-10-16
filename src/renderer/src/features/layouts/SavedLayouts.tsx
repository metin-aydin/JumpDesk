import { LayoutDashboard, Pencil, Play, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { CARD_CLASS } from '@/features/workspace/card-styles'
import { useT } from '@/lib/i18n'
import {
  layoutSummary,
  openLayout,
  useLayoutDialog,
  useLayouts,
  type SavedLayout
} from '@/stores/layouts'

function LayoutCard({ layout }: { layout: SavedLayout }): React.JSX.Element {
  const t = useT()
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
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
        <ContextMenuItem onClick={() => openLayout(layout)}>
          <Play /> {t('Düzeni Aç')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => useLayoutDialog.getState().openRename(layout)}>
          <Pencil /> {t('Yeniden Adlandır')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => useLayouts.getState().remove(layout.id)}
        >
          <Trash2 /> {t('Düzeni Sil')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** "Yeni Bağlantı" ekranında kayıtlı çalışma düzenleri; düzen yoksa bölüm gösterilmez. */
export function SavedLayouts(): React.JSX.Element | null {
  const t = useT()
  const layouts = useLayouts((s) => s.layouts)
  if (layouts.length === 0) return null
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <LayoutDashboard className="size-3.5" /> {t('Kayıtlı Düzenler')}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {layouts.map((layout) => (
          <LayoutCard key={layout.id} layout={layout} />
        ))}
      </div>
    </section>
  )
}
