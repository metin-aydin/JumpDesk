import { useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { HEX_COLOR } from '@/stores/highlights'

const PRESETS = [
  '#facc15',
  '#fb923c',
  '#f87171',
  '#f472b6',
  '#a78bfa',
  '#60a5fa',
  '#2dd4bf',
  '#4ade80',
  '#000000',
  '#ffffff',
  '#9ca3af',
  '#7f1d1d',
  '#7c2d12',
  '#1e3a8a',
  '#134e4a',
  '#14532d'
]

const HEX_PLACEHOLDER = '#rrggbb'

/** Şeffaf rengi gösteren dama deseni. */
const CHECKERBOARD: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#b8bec9 0% 25%, #ffffff 0% 50%)',
  backgroundSize: '8px 8px'
}

export function ColorSwatch({
  color,
  className
}: {
  color: string | null
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn('inline-block rounded-[5px] ring-1 ring-foreground/20 ring-inset', className)}
      style={color ? { background: color } : CHECKERBOARD}
    />
  )
}

/** Hazır renkler, şeffaf seçeneği ve özel renk (sistem renk seçicisi ya da onaltılık kod). */
export function ColorPicker({
  value,
  onChange,
  label,
  className
}: {
  value: string | null
  onChange: (color: string | null) => void
  label: string
  className?: string
}): React.JSX.Element {
  const t = useT()
  const [hex, setHex] = useState(value ?? '')
  const commitHex = (): void => {
    const v = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`
    if (HEX_COLOR.test(v)) onChange(v.toLowerCase())
    else setHex(value ?? '')
  }
  return (
    <Popover onOpenChange={(open) => open && setHex(value ?? '')}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${label}: ${value ?? t('Şeffaf')}`}
            title={`${label}: ${value ?? t('Şeffaf')}`}
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-accent',
              className
            )}
          />
        }
      >
        <ColorSwatch color={value} className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-2.5">
        <div className="text-[12px] font-medium">{label}</div>
        <div className="grid grid-cols-8 gap-1">
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              title={c}
              onClick={() => onChange(c)}
              className="relative inline-flex size-5.5 items-center justify-center rounded-[5px] ring-1 ring-foreground/15 ring-inset hover:scale-110"
              style={{ background: c }}
            >
              {value === c && (
                <Check
                  className={cn(
                    'size-3.5',
                    ['#ffffff', '#facc15', '#4ade80', '#2dd4bf'].includes(c)
                      ? 'text-black'
                      : 'text-white'
                  )}
                />
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'flex h-7 items-center gap-2 rounded-md border px-2 text-[12px] hover:bg-accent',
            value === null && 'border-primary/60 bg-primary/10'
          )}
        >
          <ColorSwatch color={null} className="size-4" />
          {t('Şeffaf (Rengi Değiştirme)')}
          {value === null && <Check className="ml-auto size-3.5 text-primary" />}
        </button>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label={t('Özel Renk Seç')}
            title={t('Özel Renk Seç')}
            value={value ?? '#ffffff'}
            onChange={(e) => {
              setHex(e.target.value)
              onChange(e.target.value.toLowerCase())
            }}
            className="h-7 w-9 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
          />
          <input
            value={hex}
            placeholder={HEX_PLACEHOLDER}
            spellCheck={false}
            aria-label={t('Renk Kodu')}
            onChange={(e) => setHex(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => e.key === 'Enter' && commitHex()}
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[12px] outline-none focus:border-ring/60"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
