import { useMemo, useState } from 'react'
import { Download, Plus, Rocket, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { openExport, openImport } from '@/features/transfer/actions'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/stores/confirm'
import { useDialogs } from '@/stores/dialogs'
import {
  DEFAULT_SNIPPET_GROUP,
  groupSnippets,
  useSnippets,
  type NewSnippet,
  type Snippet
} from '@/stores/snippets'

type Selection = { kind: 'edit'; id: string } | { kind: 'new' } | null

const EMPTY: NewSnippet = { name: '', group: '', command: '' }
const COMMAND_EXAMPLE = 'tail -f /var/log/app.log'

const draftOf = (s: Snippet | undefined): NewSnippet =>
  s ? { name: s.name, group: s.group, command: s.command } : EMPTY

const sameDraft = (a: NewSnippet, b: NewSnippet): boolean =>
  a.name === b.name && a.group === b.group && a.command === b.command

/** Snippetleri ekleme, düzenleme ve silme penceresi; snippet panelinin altındaki düğmeyle açılır. */
export function SnippetEditorDialog(): React.JSX.Element {
  const open = useDialogs((s) => s.snippetEditor)
  const setOpen = useDialogs((s) => s.setSnippetEditor)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(38rem,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <SnippetEditor />
      </DialogContent>
    </Dialog>
  )
}

function SnippetEditor(): React.JSX.Element {
  const t = useT()
  const snippets = useSnippets((s) => s.snippets)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection>(() => {
    const target = useDialogs.getState().snippetEditorTarget
    const first = snippets.find((s) => s.id === target) ?? snippets[0]
    return first ? { kind: 'edit', id: first.id } : { kind: 'new' }
  })
  const selected =
    selection?.kind === 'edit' ? snippets.find((s) => s.id === selection.id) : undefined
  const [draft, setDraft] = useState<NewSnippet>(() => draftOf(selected))
  const baseline = selection?.kind === 'new' ? EMPTY : draftOf(selected)
  const dirty = !sameDraft(draft, baseline)
  const valid = draft.name.trim() !== '' && draft.command.trim() !== ''
  const groupNames = useMemo(() => [...new Set(snippets.map((s) => s.group))], [snippets])

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    const list = q
      ? snippets.filter(
          (s) =>
            s.name.toLocaleLowerCase('tr').includes(q) ||
            s.group.toLocaleLowerCase('tr').includes(q) ||
            s.command.toLowerCase().includes(q)
        )
      : snippets
    return groupSnippets(list)
  }, [snippets, query])

  /** Kaydedilmemiş değişiklik varsa başka snippete geçmeden önce sorulur. */
  const select = async (next: Selection, nextDraft: NewSnippet): Promise<void> => {
    if (
      dirty &&
      !(await useConfirm.getState().ask({
        title: t('Değişiklikler Kaydedilmedi'),
        description: t('Bu snippetteki kaydedilmemiş değişiklikler silinsin mi?'),
        confirmLabel: t('Değişiklikleri Sil'),
        cancelLabel: t('Düzenlemeye Dön')
      }))
    )
      return
    setSelection(next)
    setDraft(nextDraft)
  }

  const save = (): void => {
    if (!valid) return
    const clean: NewSnippet = {
      name: draft.name.trim(),
      group: draft.group.trim() || t(DEFAULT_SNIPPET_GROUP),
      command: draft.command.replace(/\s+$/, '')
    }
    const store = useSnippets.getState()
    if (selection?.kind === 'edit' && selected) {
      store.update(selected.id, clean)
      setDraft(clean)
    } else {
      const created = store.add(clean)
      setSelection({ kind: 'edit', id: created.id })
      setDraft(clean)
    }
  }

  const remove = async (): Promise<void> => {
    if (!selected) return
    const ok = await useConfirm.getState().ask({
      title: t('Snippet Silinsin Mi?'),
      description: t(
        '"{name}" kalıcı olarak silinir. Bağlanınca çalıştırma listelerinden de çıkar.',
        { name: selected.name }
      ),
      confirmLabel: t('Sil')
    })
    if (!ok) return
    const rest = snippets.filter((s) => s.id !== selected.id)
    useSnippets.getState().remove(selected.id)
    const next = rest[0]
    setSelection(next ? { kind: 'edit', id: next.id } : { kind: 'new' })
    setDraft(draftOf(next))
  }

  const newSnippet = (): void =>
    void select({ kind: 'new' }, { ...EMPTY, group: selected?.group ?? '' })

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-4" /> {t('Snippetler')}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {t(
              'Snippetler sağ panelde gruplarına göre listelenir; tıklayınca etkin terminalde çalışır.'
            )}
          </DialogDescription>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col border-r bg-muted/30">
          <div className="flex items-center gap-1.5 p-2">
            <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:border-ring/60">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Snippet ara')}
                aria-label={t('Snippet Ara')}
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button
              size="icon"
              title={t('Yeni Snippet')}
              aria-label={t('Yeni Snippet')}
              onClick={newSnippet}
            >
              <Plus />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {selection?.kind === 'new' && (
              <div className="mb-1 rounded-md bg-primary/10 px-2 py-1.5 text-[12.5px] font-medium text-primary">
                {draft.name.trim() || t('Yeni Snippet')}
              </div>
            )}
            {groups.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <span className="min-w-0 flex-1 truncate">{group}</span>
                  <span className="tabular-nums">{items.length}</span>
                </div>
                {items.map((s) => {
                  const active = selection?.kind === 'edit' && selection.id === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void select({ kind: 'edit', id: s.id }, draftOf(s))}
                      className={cn(
                        'block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent/70',
                        active && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <span className="block truncate text-[12.5px]">{s.name}</span>
                      <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                        {s.command}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
            {snippets.length === 0 && selection?.kind !== 'new' && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('Henüz snippet yok')}
              </div>
            )}
          </div>
        </div>
        <form
          className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="snippet-name">{t('Ad')}</Label>
              <Input
                id="snippet-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={t('Ör. App Server 1 Log')}
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snippet-group">{t('Grup')}</Label>
              <Input
                id="snippet-group"
                list="snippet-groups"
                value={draft.group}
                onChange={(e) => setDraft({ ...draft, group: e.target.value })}
                placeholder={t(DEFAULT_SNIPPET_GROUP)}
                spellCheck={false}
              />
              <datalist id="snippet-groups">
                {groupNames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="snippet-command">{t('Komut')}</Label>
            <Textarea
              id="snippet-command"
              value={draft.command}
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
              placeholder={COMMAND_EXAMPLE}
              spellCheck={false}
              className="min-h-40 flex-1 font-mono text-[12px] [field-sizing:fixed]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  save()
                }
              }}
            />
            <span className="text-[11px] text-muted-foreground">
              {t(
                'Birden çok satır yazılabilir; her satır ayrı komut olarak gönderilir. Kaydetmek için Ctrl+Enter.'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selection?.kind === 'edit' && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void remove()}
              >
                <Trash2 /> {t('Sil')}
              </Button>
            )}
            <span className="flex-1" />
            {dirty && (
              <Button type="button" variant="outline" onClick={() => setDraft(baseline)}>
                {t('Vazgeç')}
              </Button>
            )}
            <Button type="submit" disabled={!valid || !dirty}>
              {selection?.kind === 'new' ? t('Ekle') : t('Kaydet')}
            </Button>
          </div>
        </form>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 border-t bg-muted/30 px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => void openImport(['snippets'])}>
          <Download /> {t('İçe Aktar…')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!snippets.length}
          onClick={() => openExport(['snippets'])}
        >
          <Upload /> {t('Dışa Aktar…')}
        </Button>
        <span className="ml-auto text-[11.5px] text-muted-foreground tabular-nums">
          {t('{snippets} snippet · {groups} grup', {
            snippets: snippets.length,
            groups: groupNames.length
          })}
        </span>
      </div>
    </>
  )
}
