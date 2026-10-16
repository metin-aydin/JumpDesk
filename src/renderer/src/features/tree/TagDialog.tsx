import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { Tag } from 'lucide-react'
import { TagChip } from '@/components/TagChip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { allTags, normalizeTag, tagKey } from '@/lib/tags'
import { useServerMeta } from '@/stores/server-meta'
import type { ConnectableAsset } from '@/features/workspace/connect'

interface TagDialogStore {
  targets: ConnectableAsset[] | null
  open: (targets: ConnectableAsset[]) => void
  close: () => void
}

export const useTagDialog = create<TagDialogStore>((set) => ({
  targets: null,
  open: (targets) => set({ targets: targets.filter((t) => t.assetId) }),
  close: () => set({ targets: null })
}))

/** Bir ya da birden çok sunucunun yerel etiketlerini düzenler; çoklu seçimde ekleme/çıkarma hepsine uygulanır. */
export function TagDialog(): React.JSX.Element {
  const t = useT()
  const targets = useTagDialog((s) => s.targets)
  const close = useTagDialog((s) => s.close)
  const byAsset = useServerMeta((s) => s.byAsset)
  const [tags, setTags] = useState<string[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    if (!targets) return
    const meta = useServerMeta.getState().byAsset
    const union = new Map<string, string>()
    for (const target of targets)
      for (const tag of meta[target.assetId!]?.tags ?? []) union.set(tagKey(tag), tag)
    setTags([...union.values()])
    setInput('')
  }, [targets])

  const suggestions = useMemo(() => {
    const have = new Set(tags.map(tagKey))
    const q = input.trim().toLocaleLowerCase('tr')
    return allTags(byAsset)
      .filter((tag) => !have.has(tagKey(tag)) && (!q || tagKey(tag).includes(q)))
      .slice(0, 12)
  }, [byAsset, tags, input])

  const add = (raw: string): void => {
    const tag = normalizeTag(raw)
    if (!tag || tags.some((x) => tagKey(x) === tagKey(tag))) return
    setTags((prev) => [...prev, tag])
    setInput('')
  }

  const save = async (): Promise<void> => {
    if (!targets) return
    const pending = normalizeTag(input)
    const finalTags =
      pending && !tags.some((x) => tagKey(x) === tagKey(pending)) ? [...tags, pending] : tags
    const meta = useServerMeta.getState()
    const originalKeys = new Map<string, Set<string>>()
    for (const target of targets)
      originalKeys.set(
        target.assetId!,
        new Set((meta.byAsset[target.assetId!]?.tags ?? []).map(tagKey))
      )
    const unionBefore = new Set([...originalKeys.values()].flatMap((set) => [...set]))
    const nextKeys = new Set(finalTags.map(tagKey))
    for (const target of targets) {
      const own = meta.byAsset[target.assetId!]?.tags ?? []
      const kept = own.filter((tag) => nextKeys.has(tagKey(tag)) || !unionBefore.has(tagKey(tag)))
      const added = finalTags.filter((tag) => !kept.some((k) => tagKey(k) === tagKey(tag)))
      await meta.update(target.assetId!, {
        name: target.name,
        address: target.address,
        platformType: target.platformType,
        tags: [...kept, ...added]
      })
    }
    close()
  }

  const title =
    targets && targets.length > 1
      ? t('{n} Sunucunun Etiketleri', { n: targets.length })
      : t('Etiketleri Düzenle')

  return (
    <Dialog open={Boolean(targets)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4" /> {title}
          </DialogTitle>
          <DialogDescription>
            {targets && targets.length === 1
              ? targets[0].name
              : t(
                  'Eklediğiniz etiketler seçili tüm sunuculara, kaldırdıklarınız hepsinden uygulanır.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1.5 focus-within:border-ring/60">
          {tags.map((tag) => (
            <TagChip
              key={tagKey(tag)}
              tag={tag}
              onRemove={() => setTags((prev) => prev.filter((x) => x !== tag))}
            />
          ))}
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
                e.preventDefault()
                add(input)
              } else if (e.key === 'Enter' && !input.trim()) {
                e.preventDefault()
                void save()
              } else if (e.key === 'Backspace' && !input && tags.length) {
                setTags((prev) => prev.slice(0, -1))
              }
            }}
            onBlur={() => input.trim() && add(input)}
            placeholder={
              tags.length ? '' : t('Etiket yazın (birden çoksa Enter ya da virgülle ayırın)')
            }
            className="min-w-28 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tagKey(tag)}
                type="button"
                onClick={() => add(tag)}
                className="rounded-[4px] hover:opacity-80"
              >
                <TagChip tag={tag} />
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t('Vazgeç')}
          </Button>
          <Button onClick={() => void save()}>{t('Kaydet')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
