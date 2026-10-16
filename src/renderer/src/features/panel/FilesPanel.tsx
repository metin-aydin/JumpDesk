import { useEffect } from 'react'
import { RotateCw, SquareArrowOutUpRight } from 'lucide-react'
import { LoadingState } from '@/components/LoadingState'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FileBrowser } from '@/features/sftp/FileBrowser'
import {
  FILES_LOADING_LABEL,
  FILES_START_PATH,
  panelKey,
  sftpClients,
  useSftpEntry
} from '@/features/sftp/sftp-clients'
import { terminalRegistry } from '@/features/terminal/registry'
import { openFileManager } from '@/features/workspace/connect'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/stores/auth'
import { useSessionInfo } from '@/stores/session-info'
import { useActiveTerminal } from './use-active-terminal'

/** Panelde her oturum için son açılan klasör; sekmeler arasında gezinince kaldığı yerden devam eder. */
const lastPaths = new Map<string, string>()

const shellQuote = (p: string): string => `'${p.replace(/'/g, `'\\''`)}'`

export function FilesPanel(): React.JSX.Element {
  const t = useT()
  const { tab } = useActiveTerminal()
  const server = useAuth((s) => (s.state?.status === 'logged-in' ? s.state.server : ''))
  const info = useSessionInfo((s) => (tab ? s.byTab[tab.id] : undefined))
  const key = tab ? panelKey(tab.id) : undefined
  const entry = useSftpEntry(key)
  const supported = info?.protocol === 'ssh'

  useEffect(() => {
    if (key && supported && info?.tokenId && server)
      sftpClients.ensure(key, server, info.tokenId, true)
  }, [key, supported, info?.tokenId, server])

  if (!tab || !info?.protocol) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {t('Dosyaları görmek için bir SSH oturumu seçin.')}
      </div>
    )
  }
  if (!supported) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {t('Dosya yöneticisi yalnız SSH oturumlarında kullanılabilir.')}
      </div>
    )
  }
  if (!entry || (!entry.client && !entry.error)) {
    return <LoadingState label={t(FILES_LOADING_LABEL)} />
  }
  if (!entry.client) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="selectable text-xs text-destructive">{entry.error}</div>
        <Button size="sm" variant="outline" onClick={() => key && sftpClients.reconnect(key)}>
          <RotateCw /> {t('Yeniden Dene')}
        </Button>
      </div>
    )
  }

  const tabId = tab.id
  const asset = tab.asset
  const extra = (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={t('Ayrı Sekmede Aç')}
              onClick={() =>
                asset &&
                openFileManager(
                  {
                    assetId: asset.id,
                    name: asset.name,
                    address: asset.address,
                    platformType: asset.platformType
                  },
                  {
                    startPath: lastPaths.get(tabId),
                    sourceToken: info.tokenId,
                    sourceActions: info.actions
                  }
                )
              }
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            />
          }
        >
          <SquareArrowOutUpRight className="size-4" />
        </TooltipTrigger>
        <TooltipContent>{t('Ayrı Sekmede Aç')}</TooltipContent>
      </Tooltip>
    </>
  )

  return (
    <FileBrowser
      key={`${tabId}:${entry.tokenId}`}
      owner={panelKey(tabId)}
      client={entry.client}
      actions={info.actions}
      variant="panel"
      initialPath={lastPaths.get(tabId) ?? FILES_START_PATH}
      onPathChange={(p) => lastPaths.set(tabId, p)}
      onReconnect={() => key && sftpClients.reconnect(key)}
      onCdInTerminal={(p) => {
        const handle = terminalRegistry.get(tabId)
        handle?.run(`cd ${shellQuote(p)}`)
        handle?.focus()
      }}
      toolbarExtra={extra}
    />
  )
}
