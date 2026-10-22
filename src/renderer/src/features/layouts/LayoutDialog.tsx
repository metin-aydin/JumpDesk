import { useState } from 'react'
import { FolderPlus, FolderPen, LayoutDashboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  captureGroup,
  captureLayout,
  countServers,
  useLayoutDialog,
  useLayouts,
  type LayoutDialogState
} from '@/stores/layouts'
import { useT } from '@/lib/i18n'
import { useWorkspace } from '@/stores/workspace'

const NO_FOLDER = '\u0000none'
const NEW_FOLDER = '\u0000new'

const INPUT_CLASS =
  'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/20'

/** Kaydedilen düzenin klasörü: bağlı olduğu düzeninki ya da (grup değilse) hiçbiri. */
function initialFolder(groupId?: string): string {
  if (!groupId) return NO_FOLDER
  const group = useWorkspace.getState().groups.find((g) => g.id === groupId)
  const layout = useLayouts.getState().layouts.find((l) => l.id === group?.layoutId)
  return layout?.folder ?? NO_FOLDER
}

/** Kaydetme penceresindeki klasör seçimi: klasörsüz, var olan klasörler ya da yeni klasör. */
function FolderField({
  value,
  onChange,
  newName,
  onNewName
}: {
  value: string
  onChange: (value: string) => void
  newName: string
  onNewName: (name: string) => void
}): React.JSX.Element {
  const t = useT()
  const folders = useLayouts((s) => s.folders)
  const items = [
    { value: NO_FOLDER, label: t('Klasör Yok') },
    ...folders.map((f) => ({ value: f, label: f })),
    { value: NEW_FOLDER, label: t('Yeni Klasör…') }
  ]
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">{t('Klasör')}</label>
      <Select
        value={value}
        items={items}
        onValueChange={(v) => typeof v === 'string' && onChange(v)}
      >
        <SelectTrigger aria-label={t('Klasör')} className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FOLDER}>{t('Klasör Yok')}</SelectItem>
          {folders.length > 0 && <SelectSeparator />}
          {folders.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={NEW_FOLDER}>{t('Yeni Klasör…')}</SelectItem>
        </SelectContent>
      </Select>
      {value === NEW_FOLDER && (
        <input
          autoFocus
          value={newName}
          onChange={(e) => onNewName(e.target.value)}
          placeholder={t('Klasör adı (ör. Üretim)')}
          aria-label={t('Yeni Klasörün Adı')}
          className={INPUT_CLASS}
        />
      )}
    </div>
  )
}

function DialogBody({
  state,
  initial
}: {
  state: LayoutDialogState
  initial: string
}): React.JSX.Element {
  const t = useT()
  const [name, setName] = useState(initial)
  const [folder, setFolder] = useState(() =>
    state.mode === 'save' ? initialFolder(state.groupId) : NO_FOLDER
  )
  const [newFolder, setNewFolder] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = useLayoutDialog((s) => s.close)
  const store = useLayouts.getState()
  const groupId = state.mode === 'save' ? state.groupId : undefined
  const items = state.mode === 'save' ? (groupId ? captureGroup(groupId) : captureLayout()) : []
  const servers = countServers(items)
  const isFolder = state.mode === 'folder' || state.mode === 'folder-rename'
  const moving =
    state.mode === 'folder' && state.layoutId
      ? store.layouts.find((l) => l.id === state.layoutId)
      : undefined

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    switch (state.mode) {
      case 'rename':
        store.rename(state.layout.id, trimmed)
        break
      case 'folder': {
        const created = store.createFolder(trimmed)
        if (created && moving) store.moveToFolder(moving.id, created)
        break
      }
      case 'folder-rename':
        if (!store.renameFolder(state.folder, trimmed)) {
          setError(t('Bu adda bir klasör var.'))
          return
        }
        break
      case 'save': {
        const target =
          folder === NO_FOLDER ? null : folder === NEW_FOLDER ? newFolder.trim() || null : folder
        const saved = store.saveCurrent(trimmed, groupId, target)
        close()
        if (saved)
          toast.success(t('"{name}" düzeni kaydedildi', { name: saved.name }), {
            description: t('Yeni Bağlantı ekranından tek tıkla açabilirsiniz.')
          })
        return
      }
    }
    close()
  }

  const title =
    state.mode === 'save'
      ? t('Düzeni Kaydet')
      : state.mode === 'rename'
        ? t('Düzeni Yeniden Adlandır')
        : state.mode === 'folder'
          ? t('Yeni Klasör')
          : t('Klasörü Yeniden Adlandır')
  const Icon = state.mode === 'folder' ? FolderPlus : isFolder ? FolderPen : LayoutDashboard
  const description =
    state.mode === 'save'
      ? !servers
        ? t('Kaydedilecek açık oturum yok.')
        : groupId
          ? t('Bu gruptaki {n} sunucu ve yerleşimi kaydedilir; grup sekmesi düzenin adını alır.', {
              n: servers
            })
          : t('Açık {n} sunucu, sekme sırası ve bölünmüş görünümler kaydedilir.', { n: servers })
      : state.mode === 'rename'
        ? t('Düzenin yeni adını yazın.')
        : state.mode === 'folder'
          ? moving
            ? t('Klasör oluşturulur ve "{name}" düzeni içine taşınır.', { name: moving.name })
            : t('Düzenleri klasörlere ayırarak gruplayın.')
          : t('Klasörün yeni adını yazın.')
  const submitLabel =
    state.mode === 'save'
      ? t('Kaydet')
      : state.mode === 'folder'
        ? t('Oluştur')
        : t('Yeniden Adlandır')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className="size-4" /> {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder={
            isFolder ? t('Klasör adı (ör. Üretim)') : t('Düzen adı (ör. App Sunucuları)')
          }
          aria-invalid={error ? true : undefined}
          className={INPUT_CLASS}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      {state.mode === 'save' && servers > 0 && (
        <FolderField
          value={folder}
          onChange={setFolder}
          newName={newFolder}
          onNewName={setNewFolder}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          {t('Vazgeç')}
        </Button>
        <Button
          type="submit"
          disabled={
            !name.trim() ||
            (state.mode === 'save' &&
              (servers === 0 || (folder === NEW_FOLDER && !newFolder.trim())))
          }
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

const groupName = (groupId?: string): string | undefined =>
  groupId ? useWorkspace.getState().groups.find((g) => g.id === groupId)?.name : undefined

function initialName(state: LayoutDialogState): string {
  switch (state.mode) {
    case 'save':
      return groupName(state.groupId) ?? ''
    case 'rename':
      return state.layout.name
    case 'folder':
      return ''
    case 'folder-rename':
      return state.folder
  }
}

function stateKey(state: LayoutDialogState): string {
  switch (state.mode) {
    case 'save':
      return 'save'
    case 'rename':
      return `rename:${state.layout.id}`
    case 'folder':
      return `folder:${state.layoutId ?? ''}`
    case 'folder-rename':
      return `folder-rename:${state.folder}`
  }
}

/**
 * Çalışma düzenini kaydetme, yeniden adlandırma ve düzen klasörü oluşturma/yeniden adlandırma penceresi; her yerden
 * `useLayoutDialog` ile açılır.
 */
export function LayoutDialog(): React.JSX.Element {
  const state = useLayoutDialog((s) => s.state)
  const close = useLayoutDialog((s) => s.close)
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        {state && <DialogBody key={stateKey(state)} state={state} initial={initialName(state)} />}
      </DialogContent>
    </Dialog>
  )
}
