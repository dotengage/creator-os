import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, FileDown, Lightbulb, Plus, Star, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import type { ContentPiece, Idea } from '../lib/types'
import { fmtDate, matches, sortBy, truncate, uid, uniq } from '../lib/utils'
import { exportCSV, exportXLSX } from '../lib/export'
import { downloadDocPDF } from '../lib/pdf/doc'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Item, List,
  Modal, PageHeader, SearchInput, Segmented, Textarea, useConfirm, useToast,
} from '../components/ui'
import { CategoryFilter, CategorySelect } from '../components/CategorySelect'

const blank = (): Idea => ({
  id: uid('id'),
  title: '',
  category: '',
  body: '',
  starred: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

type SortMode = 'newest' | 'oldest' | 'az'

export default function Ideas() {
  const { state, settings, put, patch, remove, setSettings } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [editing, setEditing] = useState<Idea | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [quick, setQuick] = useState('')

  const categories = useMemo(
    () => uniq([...settings.ideaCategories, ...state.ideas.map((i) => i.category)].filter(Boolean)),
    [settings.ideaCategories, state.ideas],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of state.ideas) if (i.category) c[i.category] = (c[i.category] ?? 0) + 1
    return c
  }, [state.ideas])

  const visible = useMemo(() => {
    const filtered = state.ideas.filter(
      (i) => (!category || i.category === category) && matches(query, i.title, i.body, i.category),
    )
    const sorted = sortMode === 'az'
      ? sortBy(filtered, (i) => i.title.toLowerCase(), 'asc')
      : sortBy(filtered, (i) => i.createdAt, sortMode === 'newest' ? 'desc' : 'asc')
    return sortBy(sorted, (i) => (i.starred ? 0 : 1))
  }, [state.ideas, category, query, sortMode])

  /** The whole point of a dump: capture in one keystroke, organise later. */
  const quickAdd = () => {
    const title = quick.trim()
    if (!title) return
    put('ideas', { ...blank(), title, category })
    setQuick('')
    toast('Idea captured')
  }

  const save = () => {
    if (!editing) return
    put('ideas', { ...editing, title: editing.title.trim() || 'Untitled idea' })
    if (editing.category && !settings.ideaCategories.includes(editing.category)) {
      setSettings({ ideaCategories: [...settings.ideaCategories, editing.category] })
    }
    setEditing(null)
    toast(isNew ? 'Idea added' : 'Idea saved')
  }

  const del = async (i: Idea) => {
    const ok = await confirm({
      title: `Delete “${truncate(i.title, 40)}”?`,
      message: 'The brainstorm notes go with it.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    remove('ideas', i.id)
    setEditing(null)
    toast('Idea deleted', 'info')
  }

  /** Promote an idea into the production pipeline. */
  const sendToPlanner = (i: Idea) => {
    const piece: ContentPiece = {
      id: uid('c'),
      title: i.title,
      status: 'scripting',
      platform: '',
      inspirationUrl: '',
      script: i.body,
      caption: '',
      hashtags: '',
      shootDate: '',
      editDate: '',
      postDate: '',
      notes: `From the idea dump · captured ${fmtDate(i.createdAt.slice(0, 10))}`,
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    put('content', piece)
    setEditing(null)
    toast('Moved into the planner — now in Scripting')
    navigate('/planner')
  }

  const columns = [
    { header: 'Title', value: (i: Idea) => i.title, width: 34 },
    { header: 'Category', value: (i: Idea) => i.category },
    { header: 'Notes', value: (i: Idea) => i.body, width: 60 },
    { header: 'Starred', value: (i: Idea) => (i.starred ? 'Yes' : 'No') },
    { header: 'Created', value: (i: Idea) => i.createdAt.slice(0, 10) },
  ]

  return (
    <>
      <PageHeader
        title="Idea Dump"
        subtitle="Get it out of your head first. Sort it out later."
        actions={
          <>
            <ExportMenu
              disabled={!state.ideas.length}
              onXLSX={() => exportXLSX(visible, columns, 'ideas', 'Ideas')}
              onCSV={() => exportCSV(visible, columns, 'ideas')}
            />
            <Button variant="primary" onClick={() => { setEditing(blank()); setIsNew(true) }}>
              <Plus size={15} /> New idea
            </Button>
          </>
        }
      >
        <Card className="flex items-center gap-2 p-2">
          <Lightbulb size={17} className="ml-1.5 shrink-0 text-accent" />
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') quickAdd() }}
            placeholder="Type an idea and hit Enter…"
            className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink placeholder:text-faint focus:outline-none"
          />
          <Button size="sm" variant="primary" onClick={quickAdd} disabled={!quick.trim()}>Capture</Button>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search ideas…" className="sm:max-w-xs" />
          <Segmented
            value={sortMode}
            onChange={setSortMode}
            size="sm"
            options={[{ id: 'newest' as const, label: 'Newest' }, { id: 'oldest' as const, label: 'Oldest' }, { id: 'az' as const, label: 'A–Z' }]}
          />
        </div>
        <CategoryFilter value={category} onChange={setCategory} options={categories} counts={counts} />
      </PageHeader>

      {!visible.length ? (
        <EmptyState
          icon={<Lightbulb size={22} />}
          title={state.ideas.length ? 'Nothing matches' : 'Empty on purpose — go fill it'}
          description={
            state.ideas.length
              ? 'Try a different search or category.'
              : 'Half-formed is fine. Type the topic above and press Enter; you can open it later and dump the whole thought.'
          }
        />
      ) : (
        <List className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => (
            <Item key={i.id}>
              <Card
                onClick={() => { setEditing(structuredClone(i)); setIsNew(false) }}
                className="group flex h-full cursor-pointer flex-col p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="mb-1.5 flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 text-[14.5px] font-bold leading-snug tracking-[-0.01em] text-ink">
                    {i.title || 'Untitled idea'}
                  </h3>
                  <IconButton
                    label={i.starred ? 'Unstar' : 'Star'}
                    onClick={(e) => { e.stopPropagation(); patch('ideas', i.id, { starred: !i.starred }) }}
                    className={i.starred ? 'text-warning' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}
                  >
                    <Star size={14} fill={i.starred ? 'currentColor' : 'none'} />
                  </IconButton>
                </div>

                {i.body && (
                  <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{i.body}</p>
                )}

                <div className="mt-auto flex items-center gap-2 pt-1">
                  {i.category && <Badge tone="info">{i.category}</Badge>}
                  <span className="ml-auto text-[11px] text-faint">{fmtDate(i.createdAt.slice(0, 10))}</span>
                </div>
              </Card>
            </Item>
          ))}
        </List>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={isNew ? 'New idea' : 'Brainstorm'}
        subtitle={editing && !isNew ? `Captured ${fmtDate(editing.createdAt.slice(0, 10))}` : undefined}
        headerRight={
          editing && (
            <IconButton
              label={editing.starred ? 'Unstar' : 'Star'}
              onClick={() => setEditing({ ...editing, starred: !editing.starred })}
              className={editing.starred ? 'text-warning' : ''}
            >
              <Star size={16} fill={editing.starred ? 'currentColor' : 'none'} />
            </IconButton>
          )
        }
        footer={
          <>
            {!isNew && editing && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => del(editing)}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Topic">
              <Input
                autoFocus
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="The 3 lights every creator gets wrong"
                className="text-[15px] font-semibold"
              />
            </Field>

            <Field label="Category">
              <CategorySelect
                value={editing.category}
                options={categories}
                onChange={(v) => setEditing({ ...editing, category: v })}
                onCreate={(v) => setSettings({ ideaCategories: uniq([...settings.ideaCategories, v]) })}
              />
            </Field>

            <Field label="Brain dump" hint="Angles, hooks, references, why it would work — no structure needed.">
              <Textarea
                rows={14}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Whatever you are thinking about this one…"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="soft" onClick={() => sendToPlanner(editing)}>
                <CalendarPlus size={13} /> Send to planner
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void downloadDocPDF({
                    title: editing.title || 'Untitled idea',
                    subtitle: editing.category,
                    meta: [['Captured', fmtDate(editing.createdAt.slice(0, 10))]],
                    sections: [{ title: 'Brainstorm', body: editing.body }],
                    accent: settings.defaultThemeColor,
                  })
                }
              >
                <FileDown size={13} /> Export PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
