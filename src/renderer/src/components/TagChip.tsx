import { X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { tagColor } from '@/lib/tags'
import { cn } from '@/lib/utils'

export function TagChip({
  tag,
  onRemove,
  className
}: {
  tag: string
  onRemove?: () => void
  className?: string
}): React.JSX.Element {
  const t = useT()
  return (
    <span
      className={cn(
        'inline-flex h-4.5 max-w-32 shrink-0 items-center gap-0.5 rounded-[4px] px-1.5 text-[10.5px] leading-none font-medium',
        tagColor(tag),
        className
      )}
    >
      <span className="truncate">{tag}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={t('{tag} etiketini kaldır', { tag })}
          onClick={onRemove}
          className="-mr-0.5 rounded-sm hover:bg-foreground/10"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
