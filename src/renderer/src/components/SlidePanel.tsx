import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Kenara yaslı, açılıp kapanırken kayan panel. Dış kap genişliği 0 ile `width` arasında canlandırılır; içerik sabit
 * genişlikte kalıp kenara yaslı durduğu için yeniden dizilmeden kenardan kayarak girip çıkar. Kapalıyken içerik
 * etkileşime kapalıdır; `keepMounted` değilse kapanma bitince kaldırılır.
 */
export function SlidePanel({
  open,
  side,
  width,
  animate = true,
  keepMounted = false,
  label,
  children
}: {
  open: boolean
  side: 'left' | 'right'
  width: number
  /** Kenar sürüklenerek boyutlandırılırken canlandırma kapatılır. */
  animate?: boolean
  keepMounted?: boolean
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  const [mounted, setMounted] = useState(open || keepMounted)
  if (open && !mounted) setMounted(true)
  return (
    <div
      role="region"
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      data-open={open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !open && !keepMounted) setMounted(false)
      }}
      className={cn(
        'flex h-full shrink-0 overflow-hidden',
        side === 'left' ? 'justify-end' : 'justify-start',
        animate && 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
      )}
      style={{ width: open ? width : 0 }}
    >
      <div className="flex h-full shrink-0" style={{ width }}>
        {mounted && children}
      </div>
    </div>
  )
}
