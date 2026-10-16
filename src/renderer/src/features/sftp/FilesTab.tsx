import { useEffect } from 'react'
import { LoadingState } from '@/components/LoadingState'
import { useT } from '@/lib/i18n'
import { useWorkspace, type WorkspaceTab } from '@/stores/workspace'
import { FileBrowser } from './FileBrowser'
import {
  FILES_LOADING_LABEL,
  FILES_START_PATH,
  filesTabKey,
  sftpClients,
  useSftpEntry
} from './sftp-clients'

/** Dosya yöneticisi sekmesi; oturum token'ı SessionView'dan gelir, sekme durumu dosya oturumunu izler. */
export function FilesTab({
  tab,
  server,
  tokenId,
  actions
}: {
  tab: WorkspaceTab
  server: string
  tokenId: string
  actions?: string[]
}): React.JSX.Element {
  const t = useT()
  const key = filesTabKey(tab.id)
  const entry = useSftpEntry(key)
  const client = entry?.client
  const updateTab = useWorkspace((s) => s.updateTab)

  useEffect(() => {
    sftpClients.ensure(key, server, tokenId, false)
  }, [key, server, tokenId])

  useEffect(() => {
    if (!client) return
    const sync = (): void => {
      const status = client.state === 'ready' ? 'connected' : client.state
      if (useWorkspace.getState().tabs.find((x) => x.id === tab.id)?.status !== status)
        updateTab(tab.id, { status })
    }
    sync()
    return client.subscribe(sync)
  }, [client, tab.id, updateTab])

  if (!client) {
    return entry?.error ? (
      <div className="flex flex-1 items-center justify-center p-6 text-xs text-destructive">
        {entry.error}
      </div>
    ) : (
      <LoadingState label={t(FILES_LOADING_LABEL)} />
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <FileBrowser
        key={entry.tokenId}
        owner={key}
        client={client}
        actions={actions}
        variant="tab"
        initialPath={tab.startPath ?? FILES_START_PATH}
        onPathChange={(p) => updateTab(tab.id, { startPath: p })}
        onReconnect={() => sftpClients.reconnect(key)}
      />
    </div>
  )
}
