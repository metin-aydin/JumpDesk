import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

interface State {
  error: Error | null
}

/** Beklenmeyen bir çizim hatasında boş pencere yerine hatayı ve yeniden yükleme düğmesini gösterir. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="size-6 text-destructive" />
        <div className="text-sm font-medium">{t('Beklenmeyen bir hata oluştu')}</div>
        <pre className="selectable max-w-xl overflow-auto rounded-md bg-muted p-3 text-left text-xs whitespace-pre-wrap text-muted-foreground">
          {this.state.error.message}
        </pre>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RotateCw /> {t('Yeniden yükle')}
        </Button>
      </div>
    )
  }
}
