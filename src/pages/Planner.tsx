import { useCallback, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Clapperboard, ExternalLink,
  FileDown, GripVertical, Kanban, Link2, Plus, Scissors, Send, Trash2,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { ContentPiece, ContentStatus } from '../lib/types'
import { CONTENT_STATUSES, PLATFORMS } from '../lib/types'
import {
  cx, ensureProtocol, fmtDate, fmtDateShort, matches, monthLabel, parseISO,
  sortBy, toISODate, today, uid,
} from '../lib/utils'
import { exportCSV, exportXLSX } from '../lib/export'
import { downloadDocPDF } from '../lib/pdf/doc'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Modal,
  PageHeader, SearchInput, Segmented, Select, Textarea, useConfirm, useIsMobile, useToast,
} from '../components/ui'

const STATUS_ACCENT: Record<ContentStatus, string> = {
  scripting: 'bg-accent',
  'to-shoot': 'bg-warning',
  editing: 'bg-[rgb(var(--accent))]/70',
  published: 'bg-positive',
}

const blank = (overrides: Partial<ContentPiece> = {}): ContentPiece => ({
  id: uid('c'),
  title: '',
  status: 'scripting',
  platform: '',
  inspirationUrl: '',
  script: '',
  caption: '',
  hashtags: '',
  shootDate: '',
  editDate: '',
  postDate: '',
  notes: '',
  order: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

export default function Planner() {
  const { state, settings, put, remove, update } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const isMobile = useIsMobile()

  const [view, setView] = useState<'board' | 'calendar'>('board')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ContentPiece | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [dragging, setDragging] = useState<ContentPiece | null>(null)

  const filtered = useMemo(
    () => state.content.filter((c) => matches(query, c.title, c.script, c.caption, c.platform, c.notes)),
    [state.content, query],
  )

  const byStatus = useMemo(() => {
    const map = {} as Record<ContentStatus, ContentPiece[]>
    for (const s of CONTENT_STATUSES) {
      map[s.id] = sortBy(filtered.filter((c) => c.status === s.id), (c) => c.order, 'asc')
    }
    return map
  }, [filtered])

  const openNew = (overrides: Partial<ContentPiece> = {}) => {
    setEditing(blank({ order: state.content.length, ...overrides }))
    setIsNew(true)
  }

  const save = () => {
    if (!editing) return
    put('content', { ...editing, title: editing.title.trim() || 'Untitled piece' })
    setEditing(null)
    toast(isNew ? 'Added to the planner' : 'Saved')
  }

  const del = async (c: ContentPiece) => {
    const ok = await confirm({
      title: `Delete “${c.title || 'Untitled'}”?`,
      message: 'The script and caption go with it.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    remove('content', c.id)
    setEditing(null)
    toast('Deleted', 'info')
  }

  /* ------------------------------------------------------------ dnd */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const onDragStart = (e: DragStartEvent) =>
    setDragging(state.content.find((c) => c.id === e.active.id) ?? null)

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDragging(null)
      const { active, over } = e
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const piece = state.content.find((c) => c.id === activeId)
      if (!piece) return

      const overStatus = CONTENT_STATUSES.find((s) => s.id === overId)?.id
      const overPiece = state.content.find((c) => c.id === overId)
      const targetStatus: ContentStatus = overStatus ?? overPiece?.status ?? piece.status

      update((d) => {
        const column = sortBy(d.content.filter((c) => c.status === targetStatus && c.id !== activeId), (c) => c.order, 'asc')
        const index = overPiece && overPiece.status === targetStatus
          ? column.findIndex((c) => c.id === overPiece.id)
          : column.length
        const insertAt = index < 0 ? column.length : index

        const moved = d.content.find((c) => c.id === activeId)!
        moved.status = targetStatus
        moved.updatedAt = new Date().toISOString()
        if (targetStatus === 'published' && !moved.postDate) moved.postDate = today()

        const ordered = [...column]
        ordered.splice(insertAt, 0, moved)
        ordered.forEach((c, i) => {
          const ref = d.content.find((x) => x.id === c.id)!
          ref.order = i
        })
      })

      if (targetStatus !== piece.status) {
        toast(`Moved to ${CONTENT_STATUSES.find((s) => s.id === targetStatus)?.label}`, 'info')
      }
    },
    [state.content, update, toast],
  )

  const columns = [
    { header: 'Title', value: (c: ContentPiece) => c.title, width: 30 },
    { header: 'Stage', value: (c: ContentPiece) => CONTENT_STATUSES.find((s) => s.id === c.status)?.label ?? c.status },
    { header: 'Platform', value: (c: ContentPiece) => c.platform },
    { header: 'Shoot Date', value: (c: ContentPiece) => c.shootDate },
    { header: 'Edit Date', value: (c: ContentPiece) => c.editDate },
    { header: 'Post Date', value: (c: ContentPiece) => c.postDate },
    { header: 'Inspiration URL', value: (c: ContentPiece) => c.inspirationUrl, width: 36 },
    { header: 'Script', value: (c: ContentPiece) => c.script, width: 60 },
    { header: 'Caption', value: (c: ContentPiece) => c.caption, width: 46 },
    { header: 'Hashtags', value: (c: ContentPiece) => c.hashtags },
    { header: 'Notes', value: (c: ContentPiece) => c.notes, width: 40 },
  ]

  return (
    <>
      <PageHeader
        title="Content Planner"
        subtitle="From script to published, with the dates that matter attached."
        actions={
          <>
            <ExportMenu
              disabled={!state.content.length}
              onXLSX={() => exportXLSX(filtered, columns, 'content-plan', 'Content')}
              onCSV={() => exportCSV(filtered, columns, 'content-plan')}
            />
            <Button variant="primary" onClick={() => openNew()}><Plus size={15} /> New piece</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            value={view}
            onChange={setView}
            options={[{ id: 'board' as const, label: 'Board' }, { id: 'calendar' as const, label: 'Calendar' }]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Search pieces…" className="sm:max-w-xs" />
          <div className="ml-auto hidden items-center gap-3 text-[11.5px] text-muted lg:flex">
            {CONTENT_STATUSES.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className={cx('h-2 w-2 rounded-full', STATUS_ACCENT[s.id])} />
                {byStatus[s.id].length} {s.label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      </PageHeader>

      {!state.content.length ? (
        <EmptyState
          icon={<Kanban size={22} />}
          title="Nothing in the pipeline"
          description="Add the next thing you are making. Give it a shoot date and it will show up on your calendar and your home screen."
          action={<Button variant="primary" onClick={() => openNew()}><Plus size={15} /> New piece</Button>}
        />
      ) : view === 'board' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
            {CONTENT_STATUSES.map((s) => (
              <Column
                key={s.id}
                status={s.id}
                label={s.label}
                hint={s.hint}
                items={byStatus[s.id]}
                onOpen={(c) => { setEditing(structuredClone(c)); setIsNew(false) }}
                onAdd={() => openNew({ status: s.id })}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' }}>
            {dragging && <PieceCard piece={dragging} overlay />}
          </DragOverlay>
        </DndContext>
      ) : (
        <CalendarView
          pieces={filtered}
          isMobile={isMobile}
          onOpen={(c) => { setEditing(structuredClone(c)); setIsNew(false) }}
          onAddOn={(date) => openNew({ postDate: date })}
        />
      )}

      <PieceModal
        piece={editing}
        isNew={isNew}
        accent={settings.defaultThemeColor}
        inspirations={state.inspirations}
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={del}
      />
    </>
  )
}

/* ---------------------------------------------------------------- column */
function Column({ status, label, hint, items, onOpen, onAdd }: {
  status: ContentStatus
  label: string
  hint: string
  items: ContentPiece[]
  onOpen: (c: ContentPiece) => void
  onAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="w-[276px] shrink-0 lg:w-auto">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className={cx('h-2 w-2 rounded-full', STATUS_ACCENT[status])} />
        <h2 className="text-[13px] font-bold text-ink">{label}</h2>
        <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-muted">{items.length}</span>
        <IconButton label={`Add to ${label}`} className="ml-auto" onClick={onAdd}><Plus size={14} /></IconButton>
      </div>

      <div
        ref={setNodeRef}
        className={cx(
          'min-h-[140px] space-y-2 rounded-2xl border border-dashed p-2 transition-colors duration-200 lg:min-h-[420px]',
          isOver ? 'border-accent bg-accent-soft' : 'border-line bg-elevated/50',
        )}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {items.map((c) => <SortablePiece key={c.id} piece={c} onOpen={() => onOpen(c)} />)}
          </AnimatePresence>
        </SortableContext>

        {!items.length && (
          <button
            onClick={onAdd}
            className="w-full rounded-xl py-6 text-center text-[12px] text-faint transition-colors hover:text-accent"
          >
            {hint}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ card */
function SortablePiece({ piece, onOpen }: { piece: ContentPiece; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: piece.id })
  return (
    <PieceCard
      piece={piece}
      onOpen={onOpen}
      dragging={isDragging}
      nodeRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      handleProps={{ ...attributes, ...listeners }}
    />
  )
}

function PieceCard({ piece, onOpen, handleProps, overlay, dragging, nodeRef, style }: {
  piece: ContentPiece
  onOpen?: () => void
  handleProps?: Record<string, unknown>
  overlay?: boolean
  dragging?: boolean
  nodeRef?: (node: HTMLElement | null) => void
  style?: React.CSSProperties
}) {
  const dates = [
    piece.shootDate && { icon: <Clapperboard size={10} />, label: fmtDateShort(piece.shootDate), title: 'Shoot' },
    piece.editDate && { icon: <Scissors size={10} />, label: fmtDateShort(piece.editDate), title: 'Edit' },
    piece.postDate && { icon: <Send size={10} />, label: fmtDateShort(piece.postDate), title: 'Post' },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; title: string }[]

  const soon = piece.postDate && piece.postDate <= today() && piece.status !== 'published'

  // The whole card is the drag target: a 14px grip is unusable on a phone.
  // dnd-kit only starts a drag past the activation threshold, so a plain tap
  // still opens the piece.
  return (
    <div
      ref={nodeRef}
      style={style}
      {...handleProps}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cx(
        'group touch-none rounded-xl border border-line bg-surface p-3 shadow-soft transition-shadow',
        onOpen && 'cursor-grab active:cursor-grabbing',
        overlay ? 'rotate-2 shadow-lift' : 'hover:shadow-lift',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={14} className="mt-0.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-ink">
          {piece.title || 'Untitled piece'}
        </p>
      </div>

      {piece.caption && (
        <p className="mt-1.5 line-clamp-2 pl-[22px] text-[11.5px] leading-relaxed text-muted">{piece.caption}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[22px]">
        {piece.platform && <Badge>{piece.platform}</Badge>}
        {dates.map((d) => (
          <span key={d.title} title={d.title}
            className={cx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold',
              d.title === 'Post' && soon ? 'bg-danger/10 text-danger' : 'bg-elevated text-muted')}>
            {d.icon}{d.label}
          </span>
        ))}
        {piece.inspirationUrl && <Link2 size={11} className="text-faint" />}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- calendar */
function CalendarView({ pieces, isMobile, onOpen, onAddOn }: {
  pieces: ContentPiece[]
  isMobile: boolean
  onOpen: (c: ContentPiece) => void
  onAddOn: (date: string) => void
}) {
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState<string>(today())

  const first = new Date(cursor.y, cursor.m, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()

  const cells: (string | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(cursor.y, cursor.m, i + 1))),
  ]
  while (cells.length % 7) cells.push(null)

  const byDate = useMemo(() => {
    const m = new Map<string, { piece: ContentPiece; kind: 'shoot' | 'edit' | 'post' }[]>()
    const push = (date: string, piece: ContentPiece, kind: 'shoot' | 'edit' | 'post') => {
      if (!date) return
      if (!m.has(date)) m.set(date, [])
      m.get(date)!.push({ piece, kind })
    }
    for (const p of pieces) {
      push(p.shootDate, p, 'shoot')
      push(p.editDate, p, 'edit')
      push(p.postDate, p, 'post')
    }
    return m
  }, [pieces])

  const KIND_COLOR = { shoot: 'bg-warning', edit: 'bg-accent', post: 'bg-positive' }
  const selectedItems = byDate.get(selected) ?? []

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursor.y, cursor.m + dir, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">{monthLabel(cursor.y, cursor.m)}</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today()) }}>
              Today
            </Button>
            <IconButton label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={16} /></IconButton>
            <IconButton label="Next month" onClick={() => shift(1)}><ChevronRight size={16} /></IconButton>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d.slice(0, isMobile ? 1 : 3)}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="aspect-square sm:min-h-[92px]" />
            const items = byDate.get(date) ?? []
            const isToday = date === today()
            const isSelected = date === selected
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                onDoubleClick={() => onAddOn(date)}
                className={cx(
                  'group relative flex aspect-square flex-col rounded-lg border p-1 text-left transition-all duration-200 sm:aspect-auto sm:min-h-[92px] sm:p-1.5',
                  isSelected ? 'border-accent bg-accent-soft'
                    : isToday ? 'border-accent/40 bg-surface'
                    : 'border-line bg-surface hover:border-faint',
                )}
              >
                <span className={cx('text-[11.5px] font-semibold', isToday ? 'text-accent' : 'text-muted')}>
                  {parseISO(date).getDate()}
                </span>

                {isMobile ? (
                  <span className="mt-auto flex flex-wrap gap-0.5">
                    {items.slice(0, 3).map((it, j) => (
                      <span key={j} className={cx('h-1.5 w-1.5 rounded-full', KIND_COLOR[it.kind])} />
                    ))}
                  </span>
                ) : (
                  <span className="mt-1 space-y-0.5 overflow-hidden">
                    {items.slice(0, 3).map((it, j) => (
                      <span
                        key={j}
                        onClick={(e) => { e.stopPropagation(); onOpen(it.piece) }}
                        className="flex items-center gap-1 rounded px-1 py-0.5 text-[10.5px] leading-tight text-ink hover:bg-elevated"
                      >
                        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', KIND_COLOR[it.kind])} />
                        <span className="truncate">{it.piece.title || 'Untitled'}</span>
                      </span>
                    ))}
                    {items.length > 3 && <span className="px-1 text-[10px] text-faint">+{items.length - 3} more</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> Shoot</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Edit</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-positive" /> Post</span>
          <span className="ml-auto text-faint">Double-click a day to plan something</span>
        </div>
      </Card>

      <Card className="h-fit p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-ink">{fmtDate(selected)}</h2>
          <IconButton label="Add on this day" onClick={() => onAddOn(selected)}><Plus size={16} /></IconButton>
        </div>

        {selectedItems.length ? (
          <div className="space-y-2">
            {selectedItems.map((it, i) => (
              <button
                key={i}
                onClick={() => onOpen(it.piece)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line p-2.5 text-left transition-colors hover:bg-elevated"
              >
                <span className={cx('h-8 w-1 shrink-0 rounded-full', KIND_COLOR[it.kind])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{it.piece.title || 'Untitled'}</span>
                  <span className="block text-[11.5px] capitalize text-muted">{it.kind} day · {it.piece.platform || 'no platform'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-faint">Nothing scheduled. A clear day is allowed.</p>
        )}
      </Card>
    </div>
  )
}

/* ----------------------------------------------------------------- modal */
function PieceModal({ piece, isNew, accent, inspirations, onChange, onClose, onSave, onDelete }: {
  piece: ContentPiece | null
  isNew: boolean
  accent: string
  inspirations: { id: string; name: string; url: string }[]
  onChange: (c: ContentPiece) => void
  onClose: () => void
  onSave: () => void
  onDelete: (c: ContentPiece) => void
}) {
  if (!piece) return null
  const set = <K extends keyof ContentPiece>(k: K, v: ContentPiece[K]) => onChange({ ...piece, [k]: v })

  const exportPDF = () =>
    void downloadDocPDF({
      title: piece.title || 'Untitled piece',
      subtitle: [piece.platform, CONTENT_STATUSES.find((s) => s.id === piece.status)?.label].filter(Boolean).join(' · '),
      meta: [
        ['Shoot', piece.shootDate ? fmtDate(piece.shootDate) : ''],
        ['Edit', piece.editDate ? fmtDate(piece.editDate) : ''],
        ['Post', piece.postDate ? fmtDate(piece.postDate) : ''],
      ],
      sections: [
        { title: 'Script', body: piece.script || '—' },
        { title: 'Caption', body: piece.caption || '—', boxed: true },
        ...(piece.hashtags ? [{ title: 'Hashtags', body: piece.hashtags }] : []),
        ...(piece.inspirationUrl ? [{ title: 'Reference', body: piece.inspirationUrl }] : []),
        ...(piece.notes ? [{ title: 'Notes', body: piece.notes }] : []),
      ],
      accent,
    })

  return (
    <Modal
      open={!!piece}
      onClose={onClose}
      size="lg"
      title={isNew ? 'New content piece' : piece.title || 'Content piece'}
      subtitle={isNew ? 'Title first — the rest can come later' : `Created ${fmtDate(piece.createdAt.slice(0, 10))}`}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => onDelete(piece)}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
          <Button onClick={exportPDF}><FileDown size={14} /> Export PDF</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSave}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Topic">
          <Input autoFocus value={piece.title} onChange={(e) => set('title', e.target.value)}
            placeholder="3 lights every creator gets wrong" className="text-[15px] font-semibold" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage">
            <Select value={piece.status} onChange={(e) => set('status', e.target.value as ContentStatus)}>
              {CONTENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Platform">
            <Select value={piece.platform} onChange={(e) => set('platform', e.target.value)}>
              <option value="">Not set</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Inspiration / reference URL" hint={inspirations.length ? 'Or pick one you already saved' : undefined}>
          <div className="flex gap-2">
            <Input value={piece.inspirationUrl} onChange={(e) => set('inspirationUrl', e.target.value)}
              placeholder="https://…" className="flex-1" />
            {piece.inspirationUrl && (
              <IconButton label="Open reference" onClick={() => window.open(ensureProtocol(piece.inspirationUrl), '_blank', 'noopener')}>
                <ExternalLink size={15} />
              </IconButton>
            )}
          </div>
          {!!inspirations.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inspirations.slice(0, 6).map((i) => (
                <button
                  key={i.id}
                  onClick={() => set('inspirationUrl', i.url)}
                  className="rounded-full border border-line px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {i.name}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Shoot date"><Input type="date" value={piece.shootDate} onChange={(e) => set('shootDate', e.target.value)} /></Field>
          <Field label="Edit date"><Input type="date" value={piece.editDate} onChange={(e) => set('editDate', e.target.value)} /></Field>
          <Field label="Post date"><Input type="date" value={piece.postDate} onChange={(e) => set('postDate', e.target.value)} /></Field>
        </div>

        <Field label="Script">
          <Textarea rows={12} value={piece.script} onChange={(e) => set('script', e.target.value)}
            placeholder={'HOOK (0-2s)\n\nHOLD (2-8s)\n\nBODY\n\nPAYOFF + CTA'} className="text-[14px]" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Caption">
            <Textarea rows={5} value={piece.caption} onChange={(e) => set('caption', e.target.value)}
              placeholder="What goes under the video…" />
          </Field>
          <div className="space-y-4">
            <Field label="Hashtags">
              <Textarea rows={2} value={piece.hashtags} onChange={(e) => set('hashtags', e.target.value)}
                placeholder="#filmmaking #creatortips" />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={piece.notes} onChange={(e) => set('notes', e.target.value)}
                placeholder="Book the studio, borrow the 35mm…" />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  )
}
