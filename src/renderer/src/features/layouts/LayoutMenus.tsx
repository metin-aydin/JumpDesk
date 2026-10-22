import {
  Check,
  Folder,
  FolderInput,
  FolderOutput,
  FolderPen,
  FolderPlus,
  Pencil,
  Play,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { useT } from '@/lib/i18n'
import { openLayout, useLayoutDialog, useLayouts, type SavedLayout } from '@/stores/layouts'

function MoveToFolderMenu({ layout }: { layout: SavedLayout }): React.JSX.Element {
  const t = useT()
  const folders = useLayouts((s) => s.folders)
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderInput /> {t('Klasöre Taşı')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-44">
        {folders.map((folder) => (
          <ContextMenuItem
            key={folder}
            disabled={layout.folder === folder}
            onClick={() => useLayouts.getState().moveToFolder(layout.id, folder)}
          >
            {layout.folder === folder ? <Check /> : <Folder />} {folder}
          </ContextMenuItem>
        ))}
        {folders.length > 0 && <ContextMenuSeparator />}
        <ContextMenuItem onClick={() => useLayoutDialog.getState().openNewFolder(layout.id)}>
          <FolderPlus /> {t('Yeni Klasör…')}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

/** Kayıtlı düzenin sağ tık menüsü: aç, yeniden adlandır, klasöre taşı / klasörden çıkar, sil. */
export function LayoutMenuItems({ layout }: { layout: SavedLayout }): React.JSX.Element {
  const t = useT()
  return (
    <>
      <ContextMenuItem onClick={() => openLayout(layout)}>
        <Play /> {t('Düzeni Aç')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => useLayoutDialog.getState().openRename(layout)}>
        <Pencil /> {t('Yeniden Adlandır')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <MoveToFolderMenu layout={layout} />
      {layout.folder && (
        <ContextMenuItem onClick={() => useLayouts.getState().moveToFolder(layout.id, null)}>
          <FolderOutput /> {t('Klasörden Çıkar')}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => useLayouts.getState().remove(layout.id)}
      >
        <Trash2 /> {t('Düzeni Sil')}
      </ContextMenuItem>
    </>
  )
}

/** Düzen klasörünün sağ tık menüsü: yeniden adlandır, sil (içindeki düzenler klasör dışına çıkar). */
export function FolderMenuItems({
  name,
  count
}: {
  name: string
  count: number
}): React.JSX.Element {
  const t = useT()
  return (
    <>
      <ContextMenuItem onClick={() => useLayoutDialog.getState().openRenameFolder(name)}>
        <FolderPen /> {t('Klasörü Yeniden Adlandır')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => {
          useLayouts.getState().removeFolder(name)
          if (count)
            toast(t('"{name}" klasörü silindi', { name }), {
              description: t('İçindeki {n} düzen klasör dışına taşındı.', { n: count })
            })
        }}
      >
        <Trash2 /> {t('Klasörü Sil')}
      </ContextMenuItem>
    </>
  )
}
