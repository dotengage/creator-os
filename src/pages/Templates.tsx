import { useMemo, useState } from 'react'
import {
  BookMarked, Copy, FileDown, Pin, PinOff, Plus, Trash2,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { Template } from '../lib/types'
import { fmtDate, matches, sortBy, truncate, uid, uniq } from '../lib/utils'
import { exportCSV, exportXLSX } from '../lib/export'
import { downloadDocPDF } from '../lib/pdf/doc'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Item, List,
  Modal, PageHeader, SearchInput, Textarea, useConfirm, useToast,
} from '../components/ui'
import { CategoryFilter, CategorySelect } from '../components/CategorySelect'

const blank = (): Template => ({
  id: uid('t'),
  title: '',
  category: '',
  body: '',
  tags: [],
  pinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export default function Templates() {
  const { state, settings, put, patch, remove, setSettings } = useStore()
  const confirm = useConfirm()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<Template | null>(null)
  const [isNew, setIsNew] = useState(false)

  const categories = useMemo(
    () => uniq([...settings.templateCategories, ...state.templates.map((t) => t.category)].filter(Boolean)),
    [settings.templateCategories, state.templates],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const t of state.templates) if (t.category) c[t.category] = (c[t.category] ?? 0) + 1
    return c
  }, [state.templates])

  const visible = useMemo(() => {
    const filtered = state.templates.filter(
      (t) => (!category || t.category === category) && matches(query, t.title, t.body, t.category, t.tags.join(' ')),
    )
    return sortBy(sortBy(filtered, (t) => t.updatedAt, 'desc'), (t) => (t.pinned ? 0 : 1))
  }, [state.templates, category, query])

  const open = (t: Template, fresh = false) => {
    setEditing(structuredClone(t))
    setIsNew(fresh)
  }

  const save = () => {
    if (!editing) return
    const next = { ...editing, title: editing.title.trim() || 'Untitled template' }
    put('templates', next)
    if (next.category && !settings.templateCategories.includes(next.category)) {
      setSettings({ templateCategories: [...settings.templateCategories, next.category] })
    }
    toast(isNew ? 'Template created' : 'Template saved')
    setEditing(null)
  }

  const del = async (t: Template) => {
    const ok = await confirm({
      title: `Delete “${truncate(t.title, 40)}”?`,
      message: 'This template will be removed permanently.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    remove('templates', t.id)
    setEditing(null)
    toast('Template deleted', 'info')
  }

  const duplicate = (t: Template) => {
    put('templates', { ...t, id: uid('t'), title: `${t.title} (copy)`, pinned: false, createdAt: new Date().toISOString() })
    toast('Duplicated')
  }

  const copyBody = async (t: Template) => {
    try {
      await navigator.clipboard.writeText(t.body)
      toast('Copied to clipboard')
    } catch {
      toast('Clipboard blocked by the browser', 'bad')
    }
  }

  const columns = [
    { header: 'Title', value: (t: Template) => t.title, width: 34 },
    { header: 'Category', value: (t: Template) => t.category },
    { header: 'Tags', value: (t: Template) => t.tags.join(', ') },
    { header: 'Body', value: (t: Template) => t.body, width: 60 },
    { header: 'Pinned', value: (t: Template) => (t.pinned ? 'Yes' : 'No') },
    { header: 'Created', value: (t: Template) => t.createdAt.slice(0, 10) },
    { header: 'Updated', value: (t: Template) => t.updatedAt.slice(0, 10) },
  ]

  return (
    <>
      <PageHeader
        title="Template Library"
        subtitle="Every reply, framework and SOP you rewrite too often — parked here once."
        actions={
          <>
            <ExportMenu
              disabled={!state.templates.length}
              onXLSX={() => exportXLSX(visible, columns, 'templates', 'Templates')}
              onCSV={() => exportCSV(visible, columns, 'templates')}
            />
            <Button variant="primary" onClick={() => open(blank(), true)}>
              <Plus size={15} /> New template
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search titles, bodies, tags…" className="max-w-md" />
          <CategoryFilter value={category} onChange={setCategory} options={categories} counts={counts} />
        </div>
      </PageHeader>

      {!visible.length ? (
        <EmptyState
          icon={<BookMarked size={22} />}
          title={state.templates.length ? 'Nothing matches that' : 'Your library is empty'}
          description={
            state.templates.length
              ? 'Try a different search term or clear the category filter.'
              : 'Start with the reply you send most: the first response to a brand enquiry. Paste it once, reuse it forever.'
          }
          action={<Button variant="primary" onClick={() => open(blank(), true)}><Plus size={15} /> New template</Button>}
        />
      ) : (
        <List className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <Item key={t.id}>
              <Card
                onClick={() => open(t)}
                className="group flex h-full cursor-pointer flex-col p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="mb-2 flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 text-[14.5px] font-bold leading-snug tracking-[-0.01em] text-ink">
                    {t.title || 'Untitled template'}
                  </h3>
                  <IconButton
                    label={t.pinned ? 'Unpin' : 'Pin'}
                    onClick={(e) => { e.stopPropagation(); patch('templates', t.id, { pinned: !t.pinned }) }}
                    className={t.pinned ? 'text-accent' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}
                  >
                    {t.pinned ? <Pin size={14} fill="currentColor" /> : <Pin size={14} />}
                  </IconButton>
                </div>

                <p className="mb-3 line-clamp-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">
                  {t.body || 'Empty — open to write it.'}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  {t.category && <Badge tone="info">{t.category}</Badge>}
                  {t.tags.slice(0, 2).map((tag) => <Badge key={tag}>#{tag}</Badge>)}
                  <span className="ml-auto text-[11px] text-faint">{fmtDate(t.updatedAt.slice(0, 10))}</span>
                </div>

                <div className="mt-3 flex gap-1 border-t border-line pt-2.5">
                  <IconButton label="Copy body" onClick={(e) => { e.stopPropagation(); copyBody(t) }}><Copy size={14} /></IconButton>
                  <IconButton label="Duplicate" onClick={(e) => { e.stopPropagation(); duplicate(t) }}><Plus size={14} /></IconButton>
                  <IconButton
                    label="Export PDF"
                    onClick={(e) => {
                      e.stopPropagation()
                      void downloadDocPDF({
                        title: t.title || 'Untitled template',
                        subtitle: t.category,
                        meta: [['Updated', fmtDate(t.updatedAt.slice(0, 10))], ['Tags', t.tags.join(', ')]],
                        sections: [{ title: 'Template', body: t.body, boxed: true }],
                        accent: settings.defaultThemeColor,
                      })
                    }}
                  >
                    <FileDown size={14} />
                  </IconButton>
                  <IconButton label="Delete" tone="danger" className="ml-auto" onClick={(e) => { e.stopPropagation(); del(t) }}>
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
        size="lg"
        title={isNew ? 'New template' : 'Edit template'}
        subtitle={editing && !isNew ? `Created ${fmtDate(editing.createdAt.slice(0, 10))}` : undefined}
        footer={
          <>
            {!isNew && editing && (
              <Button variant="ghost" onClick={() => del(editing)} className="mr-auto text-danger">
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save template</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Title">
              <Input
                autoFocus
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="e.g. Brand collab — first reply"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <CategorySelect
                  value={editing.category}
                  options={categories}
                  onChange={(v) => setEditing({ ...editing, category: v })}
                  onCreate={(v) => setSettings({ templateCategories: uniq([...settings.templateCategories, v]) })}
                />
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input
                  value={editing.tags.join(', ')}
                  onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="outreach, email"
                />
              </Field>
            </div>

            <Field label="Body" hint="Use {{Name}} style placeholders for the bits you swap each time.">
              <Textarea
                rows={16}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Paste the thing you keep rewriting…"
                className="font-mono text-[12.5px]"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copyBody(editing)}><Copy size={13} /> Copy body</Button>
              <Button
                size="sm"
                onClick={() =>
                  void downloadDocPDF({
                    title: editing.title || 'Untitled template',
                    subtitle: editing.category,
                    sections: [{ title: 'Template', body: editing.body, boxed: true }],
                    accent: settings.defaultThemeColor,
                  })
                }
              >
                <FileDown size={13} /> Export PDF
              </Button>
              <Button
                size="sm"
                onClick={() => setEditing({ ...editing, pinned: !editing.pinned })}
              >
                {editing.pinned ? <><PinOff size={13} /> Unpin</> : <><Pin size={13} /> Pin to top</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
