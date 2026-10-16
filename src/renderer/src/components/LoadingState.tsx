import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bir görünüm hazırlanırken alanın tam ortasında gösterilen tek tip bekleme göstergesi. Aynı iş birkaç aşamada
 * sürse de (token, bağlantı, ilk liste) her aşamada aynı bileşen ve metin kullanılır; gösterge yer değiştirmez.
 * `boxed`: terminal/uzak masaüstü üstünde kutu içinde gösterilir.
 */
export function LoadingState({
  label,
  boxed = false,
  className
}: {
  label: string
  boxed?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-0 flex-1 items-center justify-center p-6', className)}>
      <div
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground',
          boxed && 'rounded-md border bg-popover px-3 py-2 shadow-sm'
        )}
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin" /> {label}
      </div>
    </div>
  )
}
