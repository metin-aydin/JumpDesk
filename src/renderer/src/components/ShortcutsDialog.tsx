import { Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { useT } from '@/lib/i18n'
import { shortcutGroups } from '@/lib/shortcut-list'
import { useDialogs } from '@/stores/dialogs'

/** Tüm klavye kısayollarını gruplu gösteren pencere (başlık çubuğundaki düğme, Ctrl+Shift+K ya da komut paleti). */
export function ShortcutsDialog(): React.JSX.Element {
  const open = useDialogs((s) => s.shortcuts)
  const setOpen = useDialogs((s) => s.setShortcuts)
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4" /> {t('Klavye Kısayolları')}
          </DialogTitle>
          <DialogDescription>
            {t('Uygulama kısayolları terminalde de çalışır; kabuk kısayollarıyla çakışmaz.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {shortcutGroups().map((group) => (
            <section key={group.title} className="space-y-1.5">
              <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h4>
              {group.items.map((item) => (
                <div
                  key={`${group.title}-${item.label}-${item.keys}`}
                  className="flex items-center gap-3 text-[13px]"
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <Kbd className="shrink-0 font-mono text-[11px]">{item.keys}</Kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
