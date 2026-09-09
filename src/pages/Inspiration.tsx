import { useMemo, useState } from 'react'
import { ExternalLink, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Inspiration as Insp } from '../lib/types'
import { PLATFORMS } from '../lib/types'
import { cx, ensureProtocol, fmtDate, matches, prettyUrl, sortBy, uid, uniq } from '../lib/utils'
import { exportCSV, exportXLSX } from '../lib/export'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Item, List,
  Modal, PageHeader, SearchInput, Select, Textarea, useConfirm, useToast,
} from '../components/ui'
import { CategoryFilter, CategorySelect } from '../components/CategorySelect'

const blank = (): Insp => ({
  id: uid('n'),
  name: '',
  handle: '',
  url: '',
  platform: 'Instagram',
  category: '',
  notes: '',
  createdAt: new Date().toISOString(),
})

const PLATFORM_TINT: Record<string, string> = {
  Instagram: 'from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]',
  YouTube: 'from-[#ff4e45] to-[#c4302b]',
  TikTok: 'from-[#25f4ee] to-[#fe2c55]',
  'X / Twitter': 'from-neutral-700 to-neutral-900',
  LinkedIn: 'from-[#0a66c2] to-[#004182]',
  Website: 'from-slate-400 to-slate-600',
  Other: 'from-neutral-400 to-neutral-600',
}

const initials = (s: string) =>
  s.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?'

export default function Inspiration() {
  const { state, settings, put, remove, setSettings } = useStore()
  const confirm = useConfirm()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<Insp | null>(null)
  const [isNew, setIsNew] = useState(false)

  const categories = useMemo(
    () => uniq([...settings.inspirationCategories, ...state.inspirations.map((i) => i.category)].filter(Boolean)),
    [settings.inspirationCategories, state.inspirations],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of state.inspirations) if (i.category) c[i.category] = (c[i.category] ?? 0) + 1
    return c
  }, [state.inspirations])

  const visible = useMemo(
    () =>
      sortBy(
        state.inspirations.filter(
          (i) => (!category || i.category === category) && matches(query, i.name, i.handle, i.url, i.notes, i.platform),
        ),
        (i) => i.name.toLowerCase(),
        'asc',
      ),
    [state.inspirations, category, query],
  )

  const save = () => {
    if (!editing) return
    put('inspirations', {
      ...editing,
      name: editing.name.trim() || prettyUrl(editing.url) || 'Untitled',
      url: ensureProtocol(editing.url.trim()),
    })
    if (editing.category && !settings.inspirationCategories.includes(editing.category)) {
      setSettings({ inspirationCategories: [...settings.inspirationCategories, editing.category] })
    }
    setEditing(null)
    toast(isNew ? 'Added to your inspiration board' : 'Saved')
  }

  const del = async (i: Insp) => {
    const ok = await confirm({ title: `Remove ${i.name}?`, confirmLabel: 'Remove', tone: 'danger' })
    if (!ok) return
    remove('inspirations', i.id)
    setEditing(null)
    toast('Removed', 'info')
  }

  const columns = [
    { header: 'Name', value: (i: Insp) => i.name },
    { header: 'Handle', value: (i: Insp) => i.handle },
    { header: 'Platform', value: (i: Insp) => i.platform },
    { header: 'URL', value: (i: Insp) => i.url, width: 40 },
    { header: 'Category', value: (i: Insp) => i.category },
    { header: 'Notes', value: (i: Insp) => i.notes, width: 46 },
    { header: 'Added', value: (i: Insp) => i.createdAt.slice(0, 10) },
  ]

  return (
    <>
      <PageHeader
        title="Inspiration"
        subtitle="The accounts you actually learn from, filed where you can find them."
        actions={
          <>
            <ExportMenu
              disabled={!state.inspirations.length}
              onXLSX={() => exportXLSX(visible, columns, 'inspiration', 'Inspiration')}
              onCSV={() => exportCSV(visible, columns, 'inspiration')}
            />
            <Button variant="primary" onClick={() => { setEditing(blank()); setIsNew(true) }}>
              <Plus size={15} /> Add profile
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, handle, notes…" className="max-w-md" />
          <CategoryFilter value={category} onChange={setCategory} options={categories} counts={counts} />
        </div>
      </PageHeader>

      {!visible.length ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={state.inspirations.length ? 'Nothing matches' : 'No profiles saved yet'}
          description={
            state.inspirations.length
              ? 'Try another search or category.'
              : 'Next time a video makes you think “how did they do that” — save the account here with a note on what worked.'
          }
          action={<Button variant="primary" onClick={() => { setEditing(blank()); setIsNew(true) }}><Plus size={15} /> Add profile</Button>}
        />
      ) : (
        <List className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => (
            <Item key={i.id}>
              <Card className="group flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                <button
                  onClick={() => { setEditing(structuredClone(i)); setIsNew(false) }}
                  className="flex flex-1 flex-col p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={cx(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-[13px] font-bold text-white shadow-soft',
                      PLATFORM_TINT[i.platform] ?? PLATFORM_TINT.Other,
                    )}>
                      {initials(i.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold tracking-[-0.01em] text-ink">{i.name}</p>
                      <p className="truncate text-[12px] text-muted">{i.handle || i.platform}</p>
                    </div>
                  </div>

                  {i.notes && <p className="mt-3 line-clamp-3 text-[12.5px] leading-relaxed text-muted">{i.notes}</p>}

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    <Badge>{i.platform}</Badge>
                    {i.category && <Badge tone="info">{i.category}</Badge>}
                    <span className="ml-auto text-[11px] text-faint">{fmtDate(i.createdAt.slice(0, 10))}</span>
                  </div>
                </button>

                <div className="flex items-center gap-1 border-t border-line px-3 py-2">
                  {i.url ? (
                    <a
                      href={ensureProtocol(i.url)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft"
                    >
                      <ExternalLink size={12} className="shrink-0" />
                      <span className="truncate">{prettyUrl(i.url)}</span>
                    </a>
                  ) : (
                    <span className="px-1.5 text-[12px] text-faint">No link</span>
                  )}
                  <IconButton label="Remove" tone="danger" className="ml-auto shrink-0" onClick={() => del(i)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </Card>
            </Item>
          ))}
        </List>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="md"
        title={isNew ? 'Add a profile' : editing?.name || 'Profile'}
        footer={
          <>
            {!isNew && editing && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => del(editing)}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Casey Neistat" />
              </Field>
              <Field label="Handle">
                <Input value={editing.handle} onChange={(e) => setEditing({ ...editing, handle: e.target.value })}
                  placeholder="@caseyneistat" />
              </Field>
            </div>

            <Field label="Profile URL">
              <Input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="instagram.com/username" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Platform">
                <Select value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value })}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
              <Field label="Category">
                <CategorySelect
                  value={editing.category}
                  options={categories}
                  onChange={(v) => setEditing({ ...editing, category: v })}
                  onCreate={(v) => setSettings({ inspirationCategories: uniq([...settings.inspirationCategories, v]) })}
                />
              </Field>
            </div>

            <Field label="What to steal" hint="Be specific — “first frame is always a face” beats “good content”.">
              <Textarea rows={4} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Pacing, hooks, editing tricks, how they structure a series…" />
            </Field>

            {editing.url && (
              <Button block onClick={() => window.open(ensureProtocol(editing.url), '_blank', 'noopener')}>
                <ExternalLink size={14} /> Open profile
              </Button>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
