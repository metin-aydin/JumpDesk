import { TriangleAlert } from 'lucide-react'
import type { AiRisk } from '@shared/ai'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Önerilen komutun riski: güvenli komutta gösterilmez. */
export function RiskBadge({ risk }: { risk: AiRisk }): React.JSX.Element | null {
  const t = useT()
  if (risk === 'safe') return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-medium',
        risk === 'dangerous' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
      )}
    >
      <TriangleAlert className="size-3" />
      {risk === 'dangerous' ? t('Riskli') : t('Dikkat')}
    </span>
  )
}
