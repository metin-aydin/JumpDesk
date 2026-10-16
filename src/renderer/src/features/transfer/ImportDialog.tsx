import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FileCheck2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { currentLocale, useT } from '@/lib/i18n'
import { useTransfer } from '@/stores/transfer'
import {
  applySection,
  currentSections,
  SECTION_IDS,
  summarize,
  type ExportBundle,
  type SectionId
} from './bundle'
import { SECTION_META } from './sections'
import { SectionCard } from './SectionCard'

/** İçe aktarım: dosyadaki bölümler gösterilir ve seçilir; seçilen bölümlerin mevcut kayıtları dosyadakilerle değişir. */
export function ImportDialog(): React.JSX.Element {
  const open = useTransfer((s) => s.importOpen)
  const importing = useTransfer((s) => s.importing)
  const nonce = useTransfer((s) => s.nonce)
  const close = useTransfer((s) => s.closeImport)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        {importing && (
          <ImportBody
            key={nonce}
            bundle={importing.bundle}
            fileName={importing.fileName}
            preset={importing.selection}
            close={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ImportBody({
  bundle,
  fileName,
  preset,
  close
}: {
  bundle: ExportBundle
  fileName: string
  preset: SectionId[]
  close: () => void
}): React.JSX.Element {
  const t = useT()
  const [current] = useState(currentSections)
  const [selected, setSelected] = useState<SectionId[]>(preset)
  const sectionCount = t('{n} Bölüm', { n: selected.length })
  const toggle = (id: SectionId): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const exportedAt = bundle.exportedAt ? new Date(bundle.exportedAt) : null
  const origin = [
    bundle.user.username,
    bundle.user.server,
    exportedAt && !Number.isNaN(exportedAt.getTime())
      ? new Intl.DateTimeFormat(currentLocale(), {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(exportedAt)
      : ''
  ].filter(Boolean)

  const run = (): void => {
    const order = SECTION_IDS.filter((id) => selected.includes(id))
    for (const id of order) applySection(bundle, id)
    toast.success(t('İçe aktarıldı'), {
      description: order
        .map((id) => {
          const s = summarize(id, bundle.sections)
          const label = t(SECTION_META[id].label)
          return id === 'settings' ? label : `${label} (${s?.count ?? 0})`
        })
        .join(', ')
    })
    close()
  }

  // Vurgulanan sözcük çeviride <b>…</b> ile işaretlidir.
  const [warningBefore, warningStrong, warningAfter] = t(
    'Seçilen bölümlerdeki mevcut kayıtlarınız <b>silinir</b> ve yerine dosyadakiler gelir. Seçilmeyen bölümler değişmez.'
  ).split(/<\/?b>/)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Download className="size-4" /> {t('İçe Aktar')}
        </DialogTitle>
        <DialogDescription>{t('İçe aktarılacak bölümleri seçin.')}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
        <FileCheck2 className="size-4 shrink-0 text-success" />
        <div className="min-w-0 text-[12px]">
          <div className="truncate font-mono text-foreground">{fileName}</div>
          <div className="truncate text-muted-foreground">
            {t('Doğrulandı')}
            {origin.length > 0 && ` · ${origin.join(' · ')}`}
          </div>
        </div>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SECTION_IDS.map((id) => {
          const summary = summarize(id, bundle.sections)
          const existing = summarize(id, current)
          const checked = selected.includes(id)
          return (
            <SectionCard
              key={id}
              id={id}
              summary={summary}
              checked={checked && Boolean(summary)}
              disabledText={t('Dosyada yok')}
              onToggle={() => toggle(id)}
              note={
                summary && existing ? (
                  <span
                    className={
                      checked && (id === 'settings' || existing.count > 0)
                        ? 'text-warning'
                        : 'text-muted-foreground'
                    }
                  >
                    {id === 'settings'
                      ? checked
                        ? t('Mevcut ayarların yerine geçer')
                        : t('Mevcut ayarlar korunur')
                      : existing.count === 0
                        ? t('Şu an kayıt yok')
                        : checked
                          ? t('Mevcut {n} {unit} silinir', {
                              n: existing.count,
                              unit: existing.unit
                            })
                          : t('Mevcut {n} {unit} korunur', {
                              n: existing.count,
                              unit: existing.unit
                            })}
                  </span>
                ) : undefined
              }
            />
          )
        })}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          {warningBefore}
          <strong>{warningStrong}</strong>
          {warningAfter}
        </span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          {t('Vazgeç')}
        </Button>
        <Button disabled={!selected.length} onClick={run}>
          <Download /> {t('İçe Aktar')}
          {selected.length > 0 && ` (${sectionCount})`}
        </Button>
      </DialogFooter>
    </>
  )
}
