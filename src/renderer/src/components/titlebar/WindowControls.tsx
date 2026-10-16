import { Minus, Square, Copy, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { useWindowState } from '@/stores/window'
import { cn } from '@/lib/utils'

const buttonClass =
  'app-no-drag inline-flex h-full w-11 items-center justify-center text-titlebar-foreground transition-colors duration-100 hover:bg-foreground/10 hover:text-foreground'

/**
 * Pencere düğmeleri. `detached` verilirse düğmeler o ayrı pencereye uygulanır; kapatma düğmesi pencerenin oturumunu
 * kapatır.
 */
export function WindowControls({
  detached
}: {
  detached?: { name: string; onClose: () => void }
}): React.JSX.Element | null {
  const t = useT()
  const mainMaximized = useWindowState((s) => s.maximized)
  if (jumpdesk.platform === 'darwin') return null
  const maximized = detached ? false : mainMaximized

  return (
    <div className="flex h-full items-stretch">
      <button
        type="button"
        aria-label={t('Simge durumuna küçült')}
        className={buttonClass}
        onClick={() =>
          detached ? jumpdesk.detached.control(detached.name, 'minimize') : jumpdesk.win.minimize()
        }
      >
        <Minus className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label={t(maximized ? 'Önceki boyut' : 'Ekranı kapla')}
        className={buttonClass}
        onClick={() =>
          detached
            ? jumpdesk.detached.control(detached.name, 'toggle-maximize')
            : jumpdesk.win.toggleMaximize()
        }
      >
        {maximized ? (
          <Copy className="size-3.5 -scale-x-100" strokeWidth={1.5} />
        ) : (
          <Square className="size-3.5" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        aria-label={t('Kapat')}
        className={cn(buttonClass, 'hover:bg-[#e81123] hover:text-white')}
        onClick={() => (detached ? detached.onClose() : jumpdesk.win.close())}
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
