import { create } from 'zustand'
import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { joinPath, type SftpClient, type SftpEntry } from './sftp-client'

export interface Transfer {
  id: string
  /** Aktarımın ait olduğu dosya yöneticisi; liste her yöneticide ayrı gösterilir. */
  owner: string
  kind: 'upload' | 'download'
  name: string
  total?: number
  done: number
  status: 'running' | 'done' | 'error' | 'canceled'
  error?: string
  /** Tamamlanan indirmenin yerel yolu. */
  localPath?: string
}

interface TransferStore {
  items: Transfer[]
  add: (item: Transfer) => void
  patch: (id: string, patch: Partial<Transfer>) => void
  clearFinished: (owner: string) => void
}

export const useTransfers = create<TransferStore>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  patch: (id, patch) =>
    set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  clearFinished: (owner) =>
    set((s) => ({ items: s.items.filter((x) => x.owner !== owner || x.status === 'running') }))
}))

const aborts = new Map<string, AbortController>()
let seq = 0
const newId = (): string => `tr-${Date.now().toString(36)}-${(seq++).toString(36)}`

export function cancelTransfer(id: string): void {
  aborts.get(id)?.abort()
}

export async function downloadEntry(
  client: SftpClient,
  owner: string,
  dir: string,
  entry: SftpEntry
): Promise<void> {
  const store = useTransfers.getState()
  const id = newId()
  const name = entry.isDir ? `${entry.name}.zip` : entry.name
  store.add({
    id,
    owner,
    kind: 'download',
    name,
    total: entry.isDir ? undefined : entry.size,
    done: 0,
    status: 'running'
  })
  let file: { id: string; path: string } | null = null
  try {
    file = await jumpdesk.downloads.begin(name)
    const target = file
    let writing: Promise<void> = Promise.resolve()
    let done = 0
    let lastPaint = 0
    await client.download(joinPath(dir, entry.name), entry.isDir, (bytes) => {
      done += bytes.byteLength
      writing = writing.then(() => jumpdesk.downloads.write(target.id, bytes))
      const now = performance.now()
      if (now - lastPaint > 120) {
        lastPaint = now
        useTransfers.getState().patch(id, { done })
      }
    })
    await writing
    const localPath = await jumpdesk.downloads.end(target.id, true)
    useTransfers
      .getState()
      .patch(id, { done, total: done, status: 'done', localPath: localPath ?? undefined })
    toast.success(t('{name} indirildi', { name }), {
      action: localPath
        ? { label: t('Klasörde Göster'), onClick: () => jumpdesk.downloads.showInFolder(localPath) }
        : undefined
    })
  } catch (err) {
    if (file) await jumpdesk.downloads.end(file.id, false)
    const message = (err as Error).message
    useTransfers.getState().patch(id, { status: 'error', error: message })
    toast.error(t('{name} indirilemedi', { name }), { description: message })
  }
}

/** Dosya yüklenir; aynı adlı uzak dosyanın üzerine yazılır. */
export async function uploadFile(
  client: SftpClient,
  owner: string,
  dir: string,
  file: File
): Promise<boolean> {
  const id = newId()
  const controller = new AbortController()
  aborts.set(id, controller)
  useTransfers.getState().add({
    id,
    owner,
    kind: 'upload',
    name: file.name,
    total: file.size,
    done: 0,
    status: 'running'
  })
  try {
    await client.upload(
      file,
      joinPath(dir, file.name),
      (sent) => useTransfers.getState().patch(id, { done: sent }),
      controller.signal
    )
    useTransfers.getState().patch(id, { done: file.size, status: 'done' })
    return true
  } catch (err) {
    const canceled = controller.signal.aborted
    useTransfers
      .getState()
      .patch(id, { status: canceled ? 'canceled' : 'error', error: (err as Error).message })
    if (!canceled)
      toast.error(t('{name} yüklenemedi', { name: file.name }), {
        description: (err as Error).message
      })
    return false
  } finally {
    aborts.delete(id)
  }
}
