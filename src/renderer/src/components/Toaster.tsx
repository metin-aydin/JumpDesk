import { Toaster as SonnerToaster } from 'sonner'
import { useTheme } from '@/stores/theme'

const DESCRIPTION_CLASS = '!text-muted-foreground'

export function Toaster(): React.JSX.Element {
  const theme = useTheme((s) => s.info.resolved)
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!bg-popover !text-popover-foreground !border-border !text-[13px] !shadow-lg',
          description: DESCRIPTION_CLASS
        }
      }}
    />
  )
}
