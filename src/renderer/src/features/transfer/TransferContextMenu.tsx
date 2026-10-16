import { Download, Upload } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useT } from '@/lib/i18n'
import { openExport, openImport } from './actions'
import type { SectionId } from './bundle'

/**
 * Sağ panel bölümlerinin (snippetler, alarmlar, vurgular) sağ tık menüsü: bölüme özel öğeler, ardından yalnız o bölüm
 * seçili gelen Dışa Aktar ve İçe Aktar.
 */
export function TransferContextMenu({
  section,
  className,
  items,
  children
}: {
  section: SectionId
  className?: string
  items?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const t = useT()
  return (
    <ContextMenu>
      <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        {items && (
          <>
            {items}
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={() => openExport([section])}>
          <Upload /> {t('Dışa Aktar…')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void openImport([section])}>
          <Download /> {t('İçe Aktar…')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
