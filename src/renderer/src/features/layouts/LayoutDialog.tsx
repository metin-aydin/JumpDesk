import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'
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
  captureGroup,
  captureLayout,
  countServers,
  useLayoutDialog,
  useLayouts
} from '@/stores/layouts'
import { useT } from '@/lib/i18n'
import { useWorkspace } from '@/stores/workspace'

function DialogBody({
  initial,
  mode
}: {
  initial: string
  mode: 'save' | 'rename'
}): React.JSX.Element {
  const t = useT()
  const [name, setName] = useState(initial)
  const state = useLayoutDialog((s) => s.state)
  const close = useLayoutDialog((s) => s.close)
  const groupId = state?.mode === 'save' ? state.groupId : undefined
  const items = mode === 'save' ? (groupId ? captureGroup(groupId) : captureLayout()) : []
  const servers = countServers(items)
  const submit = (): void => {
    if (!name.trim()) return
    if (state?.mode === 'rename') {
      useLayouts.getState().rename(state.layout.id, name)
      close()
      return
    }
    const saved = useLayouts.getState().saveCurrent(name, groupId)
    close()
    if (saved)
      toast.success(t('"{name}" düzeni kaydedildi', { name: saved.name }), {
        description: t('Yeni Bağlantı ekranından tek tıkla açabilirsiniz.')
      })
  }
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
          <LayoutDashboard className="size-4" />{' '}
          {t(mode === 'save' ? 'Düzeni Kaydet' : 'Düzeni Yeniden Adlandır')}
        </DialogTitle>
        <DialogDescription>
          {mode === 'save'
            ? !servers
              ? t('Kaydedilecek açık oturum yok.')
              : groupId
                ? t(
                    'Bu gruptaki {n} sunucu ve yerleşimi kaydedilir; grup sekmesi düzenin adını alır.',
                    { n: servers }
                  )
                : t('Açık {n} sunucu, sekme sırası ve bölünmüş görünümler kaydedilir.', {
                    n: servers
                  })
            : t('Düzenin yeni adını yazın.')}
        </DialogDescription>
      </DialogHeader>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('Düzen adı (ör. App Sunucuları)')}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/20"
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          {t('Vazgeç')}
        </Button>
        <Button type="submit" disabled={!name.trim() || (mode === 'save' && servers === 0)}>
          {t(mode === 'save' ? 'Kaydet' : 'Yeniden Adlandır')}
        </Button>
      </DialogFooter>
    </form>
  )
}

const groupName = (groupId?: string): string | undefined =>
  groupId ? useWorkspace.getState().groups.find((g) => g.id === groupId)?.name : undefined

/** Çalışma düzenini kaydetme ve yeniden adlandırma penceresi; her yerden `useLayoutDialog` ile açılır. */
export function LayoutDialog(): React.JSX.Element {
  const state = useLayoutDialog((s) => s.state)
  const close = useLayoutDialog((s) => s.close)
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        {state && (
          <DialogBody
            key={state.mode === 'rename' ? state.layout.id : 'save'}
            mode={state.mode}
            initial={state.mode === 'rename' ? state.layout.name : (groupName(state.groupId) ?? '')}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
