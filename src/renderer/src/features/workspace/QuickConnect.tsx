import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { AssetResultList } from '@/features/tree/AssetResultList'
import { useAssetSearch, useResultKeys } from '@/features/tree/use-asset-search'
import type { TreeItemData } from '@/features/tree/tree-data'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function QuickConnect({
  onPick,
  onPickMany,
  autoFocus,
  className
}: {
  onPick: (item: TreeItemData) => void
  onPickMany?: (items: TreeItemData[]) => void
  autoFocus?: boolean
  className?: string
}): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const search = useAssetSearch(query)
  const keys = useResultKeys(query, search, onPick)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="flex h-11 items-center gap-3 rounded-lg border bg-card px-3.5 shadow-xs focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/15">
        <Search className="size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              keys.move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              keys.move(-1)
            } else if (e.key === 'Enter') {
              keys.enter()
            } else if (e.key === 'Escape') {
              setQuery('')
            }
          }}
          placeholder={t('Sunucu adı veya IP adresi yazın')}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {query.trim() && (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border bg-card p-1 shadow-xs">
          <AssetResultList
            query={query}
            results={search.results}
            loading={search.loading}
            error={search.error}
            activeIndex={keys.active}
            onActiveChange={keys.setActive}
            onPick={onPick}
            onPickMany={onPickMany}
          />
        </div>
      )}
    </div>
  )
}
