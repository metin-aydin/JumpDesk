import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpFromLine,
  ChevronUp,
  Copy,
  Download,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  RotateCw,
  Search,
  SquareTerminal,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { currentLocale, useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { cn } from '@/lib/utils'
import { LoadingState } from '@/components/LoadingState'
import { joinPath, parentPath, type SftpClient, type SftpEntry } from './sftp-client'
import { FILES_LOADING_LABEL } from './sftp-clients'
import { cancelTransfer, downloadEntry, uploadFile, useTransfers, type Transfer } from './transfers'

export interface FileBrowserProps {
  /** Aktarım listesinin anahtarı; aynı yöneticinin aktarımları birlikte gösterilir. */
  owner: string
  client: SftpClient
  /** Hesabın eylemleri; bilinmiyorsa (boş) tüm düğmeler gösterilir, yetkiyi sunucu denetler. */
  actions?: string[]
  variant: 'panel' | 'tab'
  initialPath?: string
  onPathChange?: (path: string) => void
  onReconnect: () => void
  /** Bağlı terminalde verilen klasöre geçer. */
  onCdInTerminal?: (path: string) => void
  toolbarExtra?: React.ReactNode
}

type SortKey = 'name' | 'size' | 'mtime'
type Editing = { kind: 'rename'; name: string } | { kind: 'mkdir' } | null

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' })

interface LocaleFormats {
  locale: string
  size: Intl.NumberFormat
  date: Intl.DateTimeFormat
}

let formats: LocaleFormats | null = null

/** Boyut ve tarih biçimleri arayüz diline göre kurulur; dil değişmedikçe aynı nesneler kullanılır. */
function localeFormats(): LocaleFormats {
  const locale = currentLocale()
  if (formats?.locale !== locale)
    formats = {
      locale,
      size: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
    }
  return formats
}

/** Unix saniyesini kısa tarih ve saat olarak biçimler. */
const formatDate = (unix: number): string => localeFormats().date.format(unix * 1000)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${localeFormats().size.format(value)} ${units[i]}`
}

const inside = (root: string | null, p: string): boolean =>
  root === null || root === '/' || p === root || p.startsWith(`${root}/`)

const ARCHIVE = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|jar|war|ear)$/i
const CODE =
  /\.(sh|bash|zsh|py|js|ts|tsx|jsx|java|go|rb|php|c|h|cpp|rs|json|ya?ml|xml|toml|ini|conf|cfg|sql|properties|env)$/i
const TEXT = /\.(txt|log|md|out|err|csv|pid)$/i
const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i

function EntryIcon({ entry, open }: { entry: SftpEntry; open?: boolean }): React.JSX.Element {
  if (entry.isDir) {
    const Icon = open ? FolderOpen : Folder
    return <Icon className="size-4 shrink-0 text-primary" fill="currentColor" fillOpacity={0.18} />
  }
  const Icon = ARCHIVE.test(entry.name)
    ? FileArchive
    : CODE.test(entry.name)
      ? FileCode
      : TEXT.test(entry.name)
        ? FileText
        : IMAGE.test(entry.name)
          ? FileImage
          : File
  return <Icon className="size-4 shrink-0 text-muted-foreground" />
}

function NameInput({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(ref.current?.value.trim() ?? '')
    else onCancel()
  }
  return (
    <input
      ref={ref}
      defaultValue={initial}
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
      className="h-6 min-w-0 flex-1 rounded-[4px] border border-ring/60 bg-background px-1.5 text-[13px] outline-none"
    />
  )
}

function TransferRow({ item }: { item: Transfer }): React.JSX.Element {
  const t = useT()
  const percent = item.total ? Math.min(100, Math.round((item.done / item.total) * 100)) : undefined
  const Icon = item.kind === 'download' ? ArrowDown : ArrowUp
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[12px]">
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate" title={item.name}>
            {item.name}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {item.status === 'running'
              ? percent !== undefined
                ? t('%{n}', { n: percent })
                : formatSize(item.done)
              : item.status === 'done'
                ? item.total !== undefined
                  ? formatSize(item.total)
                  : t('Tamam')
                : item.status === 'canceled'
                  ? t('İptal', { context: 'status' })
                  : t('Hata')}
          </span>
        </div>
        {item.status === 'running' && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full bg-primary transition-[width] duration-150',
                percent === undefined && 'w-1/3 animate-pulse'
              )}
              style={percent !== undefined ? { width: `${percent}%` } : undefined}
            />
          </div>
        )}
        {item.status === 'error' && item.error && (
          <div className="truncate text-[11px] text-destructive">{item.error}</div>
        )}
      </div>
      {item.status === 'running' && item.kind === 'upload' && (
        <button
          type="button"
          aria-label={t('İptal')}
          onClick={() => cancelTransfer(item.id)}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
      {item.status === 'done' && item.localPath && (
        <button
          type="button"
          aria-label={t('Klasörde Göster')}
          title={t('Klasörde Göster')}
          onClick={() => jumpdesk.downloads.showInFolder(item.localPath!)}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FolderOpen className="size-3.5" />
        </button>
      )}
    </div>
  )
}

const NO_TRANSFERS: Transfer[] = []

function Transfers({ owner }: { owner: string }): React.JSX.Element | null {
  const t = useT()
  const all = useTransfers((s) => s.items)
  const items = useMemo(() => {
    const mine = all.filter((x) => x.owner === owner)
    return mine.length ? mine.slice(-6).reverse() : NO_TRANSFERS
  }, [all, owner])
  const clear = useTransfers((s) => s.clearFinished)
  if (items.length === 0) return null
  const finished = items.some((x) => x.status !== 'running')
  return (
    <div className="shrink-0 border-t border-border/70 py-1">
      <div className="flex items-center px-2 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span className="flex-1">{t('Aktarımlar')}</span>
        {finished && (
          <button
            type="button"
            onClick={() => clear(owner)}
            className="rounded px-1 normal-case hover:bg-accent hover:text-foreground"
          >
            {t('Temizle')}
          </button>
        )}
      </div>
      {items.map((x) => (
        <TransferRow key={x.id} item={x} />
      ))}
    </div>
  )
}

export function FileBrowser({
  owner,
  client,
  actions,
  variant,
  initialPath,
  onPathChange,
  onReconnect,
  onCdInTerminal,
  toolbarExtra
}: FileBrowserProps): React.JSX.Element {
  const t = useT()
  const subscribe = useCallback((l: () => void) => client.subscribe(l), [client])
  const state = useSyncExternalStore(subscribe, () => client.state)
  const onPathChangeRef = useRef(onPathChange)
  useEffect(() => {
    onPathChangeRef.current = onPathChange
  }, [onPathChange])
  const [path, setPath] = useState<string | null>(null)
  const [root, setRoot] = useState<string | null>(client.root)
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [editing, setEditing] = useState<Editing>(null)
  const [dragOver, setDragOver] = useState(false)
  /** Silme onayı; liste pencere kapanırken de görünür kalsın diye açık durumundan ayrı tutulur. */
  const [confirmItems, setConfirmItems] = useState<SftpEntry[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const setConfirm = (items: SftpEntry[] | null): void => {
    if (items) setConfirmItems(items)
    setConfirmOpen(items !== null)
  }
  const [editingPath, setEditingPath] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const crumbsRef = useRef<HTMLDivElement>(null)
  const loadSeq = useRef(0)
  const pathRef = useRef(path)
  pathRef.current = path

  const can = (action: string): boolean =>
    !actions || actions.length === 0 || actions.includes(action)
  const canUpload = can('upload')
  const canDownload = can('download')
  const canDelete = can('delete')
  const rowHeight = variant === 'tab' ? 30 : 28

  const load = useCallback(
    async (target: string, select?: string): Promise<void> => {
      const seq = ++loadSeq.current
      setLoading(true)
      setError(null)
      try {
        if (client.root === null && target !== '') await client.list('')
        const res = await client.list(target !== '' && !inside(client.root, target) ? '' : target)
        if (seq !== loadSeq.current) return
        setRoot(client.root)
        setPath(res.path)
        setEntries(res.entries)
        setSelected(select ? new Set([select]) : new Set())
        setAnchor(select ?? null)
        setEditing(null)
        onPathChangeRef.current?.(res.path)
      } catch (err) {
        if (seq === loadSeq.current) setError((err as Error).message)
      } finally {
        if (seq === loadSeq.current) setLoading(false)
      }
    },
    [client]
  )

  const reload = useCallback((select?: string) => void load(pathRef.current ?? '', select), [load])

  useEffect(() => {
    if (state !== 'ready' || path !== null) return
    const start = initialPath && inside(client.root, initialPath) ? initialPath : ''
    void load(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, load])

  useEffect(() => {
    const el = crumbsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [path, editingPath])

  const view = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('tr')
    const list = q
      ? entries.filter((e) => e.name.toLocaleLowerCase('tr').includes(q))
      : entries.slice()
    list.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      let r = 0
      if (sort.key === 'size') r = a.size - b.size
      else if (sort.key === 'mtime') r = a.mtime - b.mtime
      if (r === 0) r = collator.compare(a.name, b.name)
      return r * sort.dir
    })
    return list
  }, [entries, filter, sort])

  const virtualizer = useVirtualizer({
    count: view.length + (editing?.kind === 'mkdir' ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10
  })

  const selection = useMemo(() => view.filter((e) => selected.has(e.name)), [view, selected])

  const atRoot = path === null || path === root || path === '/'
  const goUp = (): void => {
    if (!path || atRoot) return
    const up = parentPath(path)
    void load(inside(root, up) ? up : (root ?? '/'), path.split('/').pop())
  }

  const open = (entry: SftpEntry): void => {
    if (!path) return
    if (entry.isDir) void load(joinPath(path, entry.name))
    else if (canDownload) void downloadEntry(client, owner, path, entry)
    else toast.error(t('Bu sunucuda dosya indirme yetkiniz yok.'))
  }

  const download = async (list: SftpEntry[]): Promise<void> => {
    if (!path) return
    if (!canDownload) {
      toast.error(t('Bu sunucuda dosya indirme yetkiniz yok.'))
      return
    }
    const dir = path
    for (const entry of list) await downloadEntry(client, owner, dir, entry)
  }

  const upload = async (files: File[]): Promise<void> => {
    if (!path || files.length === 0) return
    if (!canUpload) {
      toast.error(t('Bu sunucuda dosya yükleme yetkiniz yok.'))
      return
    }
    const dir = path
    let last: string | undefined
    for (const file of files) if (await uploadFile(client, owner, dir, file)) last = file.name
    if (last && pathRef.current === dir) reload(last)
  }

  const remove = async (list: SftpEntry[]): Promise<void> => {
    if (!path) return
    const dir = path
    let failed = 0
    for (const entry of list) {
      try {
        await client.remove(joinPath(dir, entry.name))
      } catch (err) {
        failed++
        toast.error(t('{name} silinemedi', { name: entry.name }), {
          description: (err as Error).message
        })
      }
    }
    if (failed < list.length)
      toast.success(
        list.length - failed === 1
          ? t('{name} silindi', { name: list[0].name })
          : t('{n} öğe silindi', { n: list.length - failed })
      )
    if (pathRef.current === dir) reload()
  }

  const rename = async (entry: string, next: string): Promise<void> => {
    setEditing(null)
    if (!path || !next || next === entry) return
    if (next.includes('/')) {
      toast.error(t('Ad "/" içeremez.'))
      return
    }
    try {
      await client.rename(joinPath(path, entry), next)
      reload(next)
    } catch (err) {
      toast.error(t('Yeniden adlandırılamadı'), { description: (err as Error).message })
    }
  }

  const mkdir = async (name: string): Promise<void> => {
    setEditing(null)
    if (!path || !name) return
    if (name.includes('/')) {
      toast.error(t('Ad "/" içeremez.'))
      return
    }
    try {
      await client.mkdir(joinPath(path, name))
      reload(name)
    } catch (err) {
      toast.error(t('Klasör oluşturulamadı'), { description: (err as Error).message })
    }
  }

  const copyPath = (entry?: SftpEntry): void => {
    if (!path) return
    void navigator.clipboard.writeText(entry ? joinPath(path, entry.name) : path)
    toast(t('Yol kopyalandı'))
  }

  const clickRow = (e: React.MouseEvent, entry: SftpEntry): void => {
    if (e.shiftKey && anchor) {
      const a = view.findIndex((x) => x.name === anchor)
      const b = view.findIndex((x) => x.name === entry.name)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        setSelected(new Set(view.slice(from, to + 1).map((x) => x.name)))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(entry.name)) next.delete(entry.name)
        else next.add(entry.name)
        return next
      })
    } else setSelected(new Set([entry.name]))
    setAnchor(entry.name)
  }

  const moveSelection = (delta: number): void => {
    if (view.length === 0) return
    const current = anchor ? view.findIndex((x) => x.name === anchor) : -1
    const index = Math.max(0, Math.min(view.length - 1, current < 0 ? 0 : current + delta))
    const name = view[index].name
    setSelected(new Set([name]))
    setAnchor(name)
    virtualizer.scrollToIndex(index + (editing?.kind === 'mkdir' ? 1 : 0))
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editing) return
    const focused = anchor ? view.find((x) => x.name === anchor) : undefined
    if (e.key === 'ArrowDown') moveSelection(1)
    else if (e.key === 'ArrowUp') moveSelection(-1)
    else if (e.key === 'Enter' && focused) open(focused)
    else if (e.key === 'Backspace') goUp()
    else if (e.key === 'Delete' && selection.length && canDelete) setConfirm(selection)
    else if (e.key === 'F2' && focused) setEditing({ kind: 'rename', name: focused.name })
    else if (e.key === 'F5') reload()
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey))
      setSelected(new Set(view.map((x) => x.name)))
    else if (e.key === 'Escape') setSelected(new Set())
    else return
    e.preventDefault()
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const items = Array.from(e.dataTransfer.items).filter((i) => i.kind === 'file')
    const isDir = (i: DataTransferItem): boolean => Boolean(i.webkitGetAsEntry?.()?.isDirectory)
    if (items.some(isDir))
      toast(t('Klasör yükleme desteklenmiyor'), {
        description: t('Klasörün içindeki dosyaları seçerek yükleyin.')
      })
    const files = items
      .filter((i) => !isDir(i))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null)
    void upload(files)
  }

  if (state === 'connecting' || (state === 'ready' && path === null && !error)) {
    return <LoadingState label={t(FILES_LOADING_LABEL)} />
  }
  if (state !== 'ready' || (path === null && error)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-5 text-destructive" />
        <div className="selectable max-w-xs text-xs text-muted-foreground">
          {error ?? client.detail ?? t('Dosya oturumu kapandı.')}
        </div>
        <Button size="sm" variant="outline" onClick={onReconnect}>
          <RotateCw /> {t('Yeniden Bağlan')}
        </Button>
      </div>
    )
  }

  const segments = (path ?? '/').split('/').filter(Boolean)
  const crumbs = segments.map((name, i) => ({
    name,
    full: `/${segments.slice(0, i + 1).join('/')}`
  }))

  const iconButton = (
    label: string,
    Icon: typeof Upload,
    onClick: () => void,
    disabled = false
  ): React.JSX.Element => (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  const pathBar = (
    <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-border/70 bg-background/60 text-[12.5px]">
      {editingPath ? (
        <NameInput
          initial={path ?? ''}
          onCommit={(value) => {
            setEditingPath(false)
            if (value && value !== path)
              void load(value.startsWith('/') ? value : joinPath(path ?? '/', value))
          }}
          onCancel={() => setEditingPath(false)}
        />
      ) : (
        <div
          ref={crumbsRef}
          onDoubleClick={() => setEditingPath(true)}
          title={t('Yolu Düzenlemek İçin Çift Tıklayın')}
          className="flex min-w-0 flex-1 items-center overflow-x-auto px-1.5 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            onClick={() => void load(root ?? '/')}
            className="rounded px-0.5 text-muted-foreground hover:text-foreground"
          >
            /
          </button>
          {crumbs.map((c, i) => (
            <span key={c.full} className="flex items-center">
              {i > 0 && <span className="px-0.5 text-muted-foreground/60">/</span>}
              <button
                type="button"
                disabled={!inside(root, c.full)}
                onClick={() => void load(c.full)}
                className={cn(
                  'rounded px-0.5 hover:bg-accent disabled:pointer-events-none disabled:text-muted-foreground/70',
                  i === crumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>
      )}
      {loading && (
        <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  )

  const filterBox = (
    <div
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 focus-within:border-ring/60',
        variant === 'tab' ? 'w-56' : 'min-w-0 flex-1'
      )}
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
        placeholder={t('Bu klasörde süz')}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  )

  const actionsBar = (
    <>
      {iconButton(t('Yeni Klasör'), FolderPlus, () => setEditing({ kind: 'mkdir' }))}
      {iconButton(
        canUpload ? t('Dosya Yükle') : t('Dosya Yükleme Yetkiniz Yok'),
        Upload,
        () => fileInput.current?.click(),
        !canUpload
      )}
      {toolbarExtra}
    </>
  )

  const header =
    variant === 'tab' ? (
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        {iconButton(t('Üst Klasör'), ChevronUp, goUp, atRoot)}
        {iconButton(t('Yenile'), RotateCw, () => reload())}
        {pathBar}
        {filterBox}
        {actionsBar}
      </div>
    ) : (
      <div className="shrink-0 space-y-1.5 border-b border-sidebar-border px-2 py-2">
        <div className="flex items-center gap-1">
          {iconButton(t('Üst Klasör'), ChevronUp, goUp, atRoot)}
          {pathBar}
          {iconButton(t('Yenile'), RotateCw, () => reload())}
        </div>
        <div className="flex items-center gap-1">
          {filterBox}
          {actionsBar}
        </div>
      </div>
    )

  const sortHeader = (key: SortKey, label: string, className?: string): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      className={cn('flex items-center gap-1 hover:text-foreground', className)}
    >
      {label}
      {sort.key === key &&
        (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  )

  const single = selection.length === 1 ? selection[0] : undefined
  const menu = (
    <ContextMenuContent className="min-w-48">
      {selection.length > 0 ? (
        <>
          {single?.isDir && (
            <ContextMenuItem onClick={() => open(single)}>
              <FolderOpen /> {t('Aç')}
            </ContextMenuItem>
          )}
          {single?.isDir && onCdInTerminal && path && (
            <ContextMenuItem onClick={() => onCdInTerminal(joinPath(path, single.name))}>
              <SquareTerminal /> {t('Terminalde Bu Klasöre Geç')}
            </ContextMenuItem>
          )}
          <ContextMenuItem disabled={!canDownload} onClick={() => void download(selection)}>
            <Download />{' '}
            {selection.length > 1
              ? t('{n} Öğeyi İndir', { n: selection.length })
              : single?.isDir
                ? t('Zip Olarak İndir')
                : t('İndir')}
          </ContextMenuItem>
          {single && (
            <ContextMenuItem onClick={() => setEditing({ kind: 'rename', name: single.name })}>
              <Pencil /> {t('Yeniden Adlandır')}
            </ContextMenuItem>
          )}
          {single && (
            <ContextMenuItem onClick={() => copyPath(single)}>
              <Copy /> {t('Yolu Kopyala')}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={!canDelete}
            onClick={() => setConfirm(selection)}
          >
            <Trash2 />{' '}
            {selection.length > 1 ? t('{n} Öğeyi Sil', { n: selection.length }) : t('Sil')}
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem onClick={() => setEditing({ kind: 'mkdir' })}>
            <FolderPlus /> {t('Yeni Klasör')}
          </ContextMenuItem>
          <ContextMenuItem disabled={!canUpload} onClick={() => fileInput.current?.click()}>
            <ArrowUpFromLine /> {t('Dosya Yükle')}
          </ContextMenuItem>
          {onCdInTerminal && path && (
            <ContextMenuItem onClick={() => onCdInTerminal(path)}>
              <SquareTerminal /> {t('Terminalde Bu Klasöre Geç')}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => copyPath()}>
            <Copy /> {t('Yolu Kopyala')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => reload()}>
            <RotateCw /> {t('Yenile')}
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )

  const offset = editing?.kind === 'mkdir' ? 1 : 0
  const renderRow = (index: number): React.JSX.Element => {
    if (offset && index === 0) {
      return (
        <div className="flex h-full items-center gap-2 px-2">
          <Folder className="size-4 shrink-0 text-primary" fill="currentColor" fillOpacity={0.18} />
          <NameInput
            initial={t('Yeni klasör')}
            onCommit={(v) => void mkdir(v)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )
    }
    const entry = view[index - offset]
    const isSelected = selected.has(entry.name)
    const renaming = editing?.kind === 'rename' && editing.name === entry.name
    return (
      <div
        role="row"
        aria-selected={isSelected}
        data-name={entry.name}
        onClick={(e) => clickRow(e, entry)}
        onDoubleClick={() => open(entry)}
        onContextMenu={() => {
          if (!selected.has(entry.name)) {
            setSelected(new Set([entry.name]))
            setAnchor(entry.name)
          }
        }}
        title={
          variant === 'panel'
            ? `${entry.name}\n${entry.perm} · ${entry.mtime ? formatDate(entry.mtime) : ''}`
            : undefined
        }
        className={cn(
          'flex h-full items-center gap-2 rounded-md px-2 text-[13px]',
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
        )}
      >
        <EntryIcon entry={entry} />
        {renaming ? (
          <NameInput
            initial={entry.name}
            onCommit={(v) => void rename(entry.name, v)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        )}
        {variant === 'tab' ? (
          <>
            <span className="w-24 shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">
              {entry.isDir ? '' : formatSize(entry.size)}
            </span>
            <span className="w-36 shrink-0 text-[12px] text-muted-foreground tabular-nums">
              {entry.mtime ? formatDate(entry.mtime) : ''}
            </span>
            <span className="w-28 shrink-0 font-mono text-[11.5px] text-muted-foreground">
              {entry.perm}
            </span>
          </>
        ) : (
          !entry.isDir && (
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatSize(entry.size)}
            </span>
          )
        )}
      </div>
    )
  }

  const totalSize = selection.reduce((n, e) => n + (e.isDir ? 0 : e.size), 0)
  const [dropBefore, dropAfter] = t('Bırakın: {path} klasörüne yüklenecek').split('{path}')

  return (
    <div data-files-variant={variant} className="flex min-h-0 flex-1 flex-col">
      {header}
      {error && (
        <div className="shrink-0 border-b border-border/70 bg-destructive/10 px-3 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      )}
      {variant === 'tab' && (
        <div className="flex shrink-0 items-center gap-2 border-b px-5 py-1.5 text-[11.5px] text-muted-foreground">
          <span className="w-4" />
          {sortHeader('name', t('Ad'), 'min-w-0 flex-1')}
          {sortHeader('size', t('Boyut'), 'w-24 justify-end')}
          {sortHeader('mtime', t('Değiştirilme'), 'w-36')}
          <span className="w-28">{t('İzinler')}</span>
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              ref={scrollRef}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onClick={(e) => {
                if (e.target === e.currentTarget || e.target === listRef.current)
                  setSelected(new Set())
              }}
              onContextMenu={(e) => {
                if (e.target === e.currentTarget || e.target === listRef.current)
                  setSelected(new Set())
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.some((type) => type === 'Files')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = canUpload ? 'copy' : 'none'
                setDragOver(true)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
              }}
              onDrop={onDrop}
              className={cn(
                'relative min-h-0 flex-1 overflow-y-auto p-1.5 outline-none',
                variant === 'tab' && 'px-3'
              )}
            />
          }
        >
          <div
            ref={listRef}
            role="grid"
            aria-label={t('Dosyalar')}
            className="relative"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((v) => (
              <div
                key={v.key}
                className="absolute inset-x-0"
                style={{ top: v.start, height: rowHeight }}
              >
                {renderRow(v.index)}
              </div>
            ))}
          </div>
          {view.length === 0 && !editing && !loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {filter ? t('Eşleşen dosya yok') : t('Klasör boş')}
            </div>
          )}
          {dragOver && (
            <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 text-center text-xs text-foreground">
              {canUpload ? (
                <span>
                  {dropBefore}
                  <span className="font-mono">{path}</span>
                  {dropAfter}
                </span>
              ) : (
                t('Bu sunucuda dosya yükleme yetkiniz yok')
              )}
            </div>
          )}
        </ContextMenuTrigger>
        {menu}
      </ContextMenu>
      {variant === 'tab' && (
        <div className="flex shrink-0 items-center gap-3 border-t px-4 py-1 text-[11.5px] text-muted-foreground">
          <span>{t('{n} öğe', { n: view.length })}</span>
          {selection.length > 0 && (
            <span>
              {t('{n} seçili', { n: selection.length })}
              {totalSize > 0 && ` · ${formatSize(totalSize)}`}
            </span>
          )}
          <span className="flex-1" />
          {root && root !== '/' && (
            <span title={t('Platformda Tanımlı SFTP Kök Dizini')}>
              {t('Kök: {root}', { root })}
            </span>
          )}
        </div>
      )}
      <Transfers owner={owner} />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void upload(files)
        }}
      />
      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="break-all">
              {confirmItems.length > 1
                ? t('{n} öğe silinsin mi?', { n: confirmItems.length })
                : t('{name} silinsin mi?', { name: confirmItems[0]?.name ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {confirmItems.some((e) => e.isDir) &&
                `${t('Klasörler içindekilerle birlikte silinir.')} `}
              {t('Bu işlem geri alınamaz.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t('Vazgeç')}
            </Button>
            <Button
              variant="destructive"
              autoFocus
              onClick={() => {
                setConfirm(null)
                void remove(confirmItems)
              }}
            >
              <Trash2 /> {t('Sil')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
