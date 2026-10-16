import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { useConfirm } from '@/stores/confirm'

/** Uygulama genelindeki onay penceresi (`useConfirm.ask`). Metin kapanış animasyonu boyunca korunur. */
export function ConfirmDialog(): React.JSX.Element {
  const t = useT()
  const shown = useConfirm((s) => s.request)
  const open = useConfirm((s) => s.open)
  const answer = useConfirm((s) => s.answer)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && answer(false)}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> {shown?.title}
          </DialogTitle>
          <DialogDescription>{shown?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => answer(false)}>
            {shown?.cancelLabel ?? t('Vazgeç')}
          </Button>
          <Button variant="destructive" autoFocus onClick={() => answer(true)}>
            {shown?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
