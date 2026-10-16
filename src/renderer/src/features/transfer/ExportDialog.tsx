import { useState } from 'react'
import { Upload } from 'lucide-react'
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
import { useTransfer } from '@/stores/transfer'
import { exportSections } from './actions'
import { currentSections, SECTION_IDS, summarize, type SectionId } from './bundle'
import { SectionCard } from './SectionCard'

/** Dışa aktarım: bölümler kart olarak, kayıt sayılarıyla seçilir; seçilenler şifreli `.jumpdesk` dosyasına yazılır. */
export function ExportDialog(): React.JSX.Element {
  const open = useTransfer((s) => s.exportOpen)
  const preset = useTransfer((s) => s.exportSelection)
  const nonce = useTransfer((s) => s.nonce)
  const close = useTransfer((s) => s.closeExport)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <ExportBody key={nonce} preset={preset} close={close} />
      </DialogContent>
    </Dialog>
  )
}

function ExportBody({
  preset,
  close
}: {
  preset: SectionId[]
  close: () => void
}): React.JSX.Element {
  const t = useT()
  const [current] = useState(currentSections)
  const [selected, setSelected] = useState<SectionId[]>(() =>
    preset.filter((id) => {
      const summary = summarize(id, current)
      return summary && !summary.empty
    })
  )
  const [busy, setBusy] = useState(false)
  const sectionCount = t('{n} Bölüm', { n: selected.length })

  const toggle = (id: SectionId): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      if (await exportSections(SECTION_IDS.filter((id) => selected.includes(id)))) close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Upload className="size-4" /> {t('Dışa Aktar')}
        </DialogTitle>
        <DialogDescription>
          {t(
            'Aktarılacak bölümleri seçin. Seçilenler şifreli bir JumpDesk dosyasına yazılır; başka bir bilgisayarda ya da başka bir kullanıcıda içe aktarılabilir.'
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SECTION_IDS.map((id) => {
          const summary = summarize(id, current)
          return (
            <SectionCard
              key={id}
              id={id}
              summary={summary}
              checked={selected.includes(id)}
              disabled={summary?.empty}
              onToggle={() => toggle(id)}
            />
          )
        })}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          {t('Vazgeç')}
        </Button>
        <Button disabled={!selected.length || busy} onClick={() => void run()}>
          <Upload /> {t('Dışa Aktar')}
          {selected.length > 0 && ` (${sectionCount})`}
        </Button>
      </DialogFooter>
    </>
  )
}
