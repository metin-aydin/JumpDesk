import { Database, FolderOpen, Globe, Monitor, Network, Server, Terminal } from 'lucide-react'
import { osKind, type OsKind } from '@/lib/os'
import { cn } from '@/lib/utils'

const styles: Record<OsKind, { bg: string; Icon: typeof Terminal }> = {
  linux: { bg: 'bg-os-linux', Icon: Terminal },
  windows: { bg: 'bg-os-windows', Icon: Monitor },
  database: { bg: 'bg-os-database', Icon: Database },
  network: { bg: 'bg-os-network', Icon: Network },
  web: { bg: 'bg-os-web', Icon: Globe },
  other: { bg: 'bg-os-other', Icon: Server }
}

const sizes = {
  xs: 'size-4 rounded-[4px] [&_svg]:size-2.5',
  sm: 'size-5 rounded-[5px] [&_svg]:size-3',
  md: 'size-8 rounded-lg [&_svg]:size-4'
}

export function OsBadge({
  platformType,
  size = 'sm',
  files,
  className
}: {
  platformType?: string
  size?: keyof typeof sizes
  /** Dosya yöneticisi oturumu: işletim sistemi rengiyle klasör simgesi. */
  files?: boolean
  className?: string
}): React.JSX.Element {
  const style = styles[osKind(platformType)]
  const bg = style.bg
  const Icon = files ? FolderOpen : style.Icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white',
        bg,
        sizes[size],
        className
      )}
    >
      <Icon strokeWidth={2.25} />
    </span>
  )
}
