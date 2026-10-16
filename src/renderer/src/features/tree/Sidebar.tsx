import { useEffect, useRef, useState } from 'react'
import type { UserProfile } from '@shared/types'
import { CircleArrowUp, Download, LogOut, Search, Settings, Upload, X } from 'lucide-react'
import { openExport, openImport } from '@/features/transfer/actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { useT } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { SETTINGS_SHORTCUT, isAppShortcut, shortcutLabel } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useDialogs } from '@/stores/dialogs'
import { useTreeCommands } from '@/stores/tree-commands'
import { startUpdate, useUpdate } from '@/stores/update'
import { useWorkspace } from '@/stores/workspace'
import { SlidePanel } from '@/components/SlidePanel'
import { usePanelWidth } from '@/hooks/use-panel-width'
import { connectToAsset } from '@/features/workspace/connect'
import { AssetResultList } from './AssetResultList'
import { ServerTree } from './ServerTree'
import { useAssetSearch } from './use-asset-search'

const MIN_WIDTH = 200
const MAX_WIDTH = 460
const WIDTH_KEY = 'sidebarWidth'

/** Profil fotoğrafı bir kez indirilir; JumpServer'ın varsayılan avatarı da gerçek bir görsel olarak gelir. */
function useAvatar(user?: UserProfile): string | null {
  const url = user?.avatar_url
  const [loaded, setLoaded] = useState<{ url: string; data: string | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    void jumpdesk.jms.avatar(url).then((data) => {
      if (!cancelled) setLoaded({ url, data })
    })
    return () => {
      cancelled = true
    }
  }, [url])
  return loaded && loaded.url === url ? loaded.data : null
}

/** Profil fotoğrafı (JumpServer'dan gelen) ya da adın baş harfi; düğmede ve menüde aynı kaynak kullanılır. */
function UserAvatar({
  src,
  initial,
  className
}: {
  src: string | null
  initial: string
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary',
        className
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        initial
      )}
    </span>
  )
}

function UserFooter(): React.JSX.Element | null {
  const t = useT()
  const state = useAuth((s) => s.state)
  const avatar = useAvatar(state?.status === 'logged-in' ? state.user : undefined)
  const update = useUpdate((s) => s.state)
  if (state?.status !== 'logged-in') return null
  /** Bulunan yeni sürüm ayarlar düğmesinde nokta ve kullanıcı menüsünde öğe olarak gösterilir. */
  const newVersion =
    update && ['available', 'downloading', 'downloaded'].includes(update.status)
      ? update.version
      : undefined
  const { user, server } = state
  const fullName = user.name?.trim() || user.username
  /** Fotoğraf yoksa adın baş harfi gösterilir. */
  const initial = fullName.trim().charAt(0).toLocaleUpperCase('tr') || '?'
  return (
    <div className="flex items-center gap-1.5 border-t border-sidebar-border p-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent/60"
            />
          }
        >
          <UserAvatar src={avatar} initial={initial} className="size-6 text-[11px]" />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[13px]">
            <span className="min-w-0 truncate text-sidebar-foreground">{fullName}</span>
            {fullName !== user.username && (
              <span className="shrink-0 whitespace-nowrap text-[12px] text-muted-foreground">
                · {user.username}
              </span>
            )}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="relative pr-12">
              <UserAvatar
                src={avatar}
                initial={initial}
                className="absolute top-1.5 right-2 size-8 text-[12px]"
              />
              <span className="block truncate text-foreground">{fullName}</span>
              <span className="block truncate">{user.username}</span>
              {user.email && <span className="block truncate">{user.email}</span>}
              <span className="block truncate">{new URL(server).host}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => useDialogs.getState().setSettings(true)}>
            <Settings /> {t('Ayarlar')}
            <DropdownMenuShortcut>{SETTINGS_SHORTCUT}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openExport()}>
            <Upload /> {t('Dışa Aktar…')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openImport()}>
            <Download /> {t('İçe Aktar…')}
          </DropdownMenuItem>
          {update && newVersion && (
            <DropdownMenuItem onClick={() => startUpdate(update)}>
              <CircleArrowUp /> {t('Sürüm {version} Hazır', { version: newVersion })}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => void jumpdesk.auth.logout()}>
            <LogOut /> {t('Çıkış Yap')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
            <span>JumpDesk</span>
            <span className="tabular-nums select-text">
              {t('Sürüm {version}', { version: __APP_VERSION__ })}
            </span>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={t('Ayarlar')}
              onClick={() => useDialogs.getState().openSettings(newVersion ? 'updates' : undefined)}
              className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            />
          }
        >
          <Settings className="size-4" />
          {newVersion && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-sidebar"
            />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {newVersion
            ? t('Yeni Sürüm: {version}', { version: newVersion })
            : t('Ayarlar ({shortcut})', { shortcut: SETTINGS_SHORTCUT })}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const { width, resizing, startResize } = usePanelWidth(
    WIDTH_KEY,
    268,
    MIN_WIDTH,
    MAX_WIDTH,
    'right'
  )
  const open = useWorkspace((s) => s.leftPanelOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const search = useAssetSearch(query)

  useEffect(() => setActive(0), [query])

  const revealNonce = useTreeCommands((s) => s.revealNonce)
  useEffect(() => {
    if (revealNonce) setQuery('')
  }, [revealNonce])

  useEffect(() => {
    useTreeCommands.setState({
      focusSearch: () => {
        const ws = useWorkspace.getState()
        if (!ws.leftPanelOpen) ws.setLeftPanelOpen(true)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
      }
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAppShortcut(e, 'F')) {
        e.preventDefault()
        useTreeCommands.getState().focusSearch()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const searching = query.trim().length > 0

  return (
    <SlidePanel
      open={open}
      side="left"
      width={width}
      animate={!resizing}
      keepMounted
      label={t('Sunucu Ağacı')}
    >
      <aside className="relative flex w-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="p-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2 focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
                if (!searching) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((i) => Math.min(i + 1, search.results.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter' && search.results[active]) {
                  connectToAsset(search.results[active])
                }
              }}
              placeholder={t('Sunucu, IP, etiket ara')}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
            {searching ? (
              <button
                type="button"
                aria-label={t('Aramayı temizle')}
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <Kbd className="text-[10px]">{shortcutLabel('F')}</Kbd>
            )}
          </div>
        </div>
        {searching && (
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            <AssetResultList
              dense
              query={query}
              results={search.results}
              loading={search.loading}
              error={search.error}
              activeIndex={active}
              onActiveChange={setActive}
              onPick={(item) => connectToAsset(item)}
              onPickMany={(items) => items.forEach((item) => connectToAsset(item))}
            />
          </div>
        )}
        <div className={searching ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
          <ServerTree />
        </div>
        <UserFooter />
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startResize}
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize"
        />
      </aside>
    </SlidePanel>
  )
}
