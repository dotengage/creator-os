import { useMemo, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, Plus, Target, TrendingUp, Trash2, Zap } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Goal } from '../lib/types'
import { GOAL_KINDS, PLATFORMS } from '../lib/types'
import { resolvedGoalValue } from '../lib/selectors'
import {
  clamp, cx, daysBetween, fmtCompact, fmtDate, fmtMoney, fmtNumber, goalProgress,
  parseNum, today, uid,
} from '../lib/utils'
import { exportCSV, exportXLSX } from '../lib/export'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Item, List,
  Modal, PageHeader, Progress, Select, useConfirm, useToast,
} from '../components/ui'

const blank = (): Goal => {
  const d = new Date()
  const deadline = new Date(d.getFullYear(), d.getMonth() + 3, d.getDate())
  return {
    id: uid('g'),
    kind: 'followers',
    title: '',
    platform: 'Instagram',
    startValue: 0,
    currentValue: 0,
    targetValue: 0,
    unit: 'followers',
    startDate: today(),
    deadline: deadline.toISOString().slice(0, 10),
    autoTrack: false,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export default function Goals() {
  const { state, settings, put, patch, remove } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const sym = settings.currencySymbol

  const [editing, setEditing] = useState<Goal | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [logging, setLogging] = useState<Goal | null>(null)
  const [logValue, setLogValue] = useState('')

  /** Auto-tracked goals read straight from invoices and published content. */
  const resolved = useMemo(
    () => state.goals.map((g) => ({ ...g, currentValue: resolvedGoalValue(state, g) })),
    [state],
  )

  const fmtValue = (g: Goal, v: number) =>
    g.kind === 'earnings' ? fmtMoney(v, sym) : `${fmtNumber(v)}${g.unit && g.kind !== 'followers' ? '' : ''}`

  const save = () => {
    if (!editing) return
    const kindMeta = GOAL_KINDS.find((k) => k.id === editing.kind)
    put('goals', {
      ...editing,
      title: editing.title.trim() || `${kindMeta?.label} goal`,
      unit: editing.unit || kindMeta?.unit || '',
    })
    setEditing(null)
    toast(isNew ? 'Goal set' : 'Goal updated')
  }

  const del = async (g: Goal) => {
    const ok = await confirm({ title: `Delete “${g.title}”?`, confirmLabel: 'Delete', tone: 'danger' })
    if (!ok) return
    remove('goals', g.id)
    setEditing(null)
    toast('Goal deleted', 'info')
  }

  const logProgress = () => {
    if (!logging) return
    const v = parseNum(logValue)
    const history = [...logging.history.filter((h) => h.date !== today()), { date: today(), value: v }]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    patch('goals', logging.id, { currentValue: v, history })
    setLogging(null)
    setLogValue('')
    toast('Progress logged')
  }

  const columns = [
    { header: 'Goal', value: (g: Goal) => g.title, width: 30 },
    { header: 'Type', value: (g: Goal) => GOAL_KINDS.find((k) => k.id === g.kind)?.label ?? g.kind },
    { header: 'Platform', value: (g: Goal) => g.platform },
    { header: 'Start', value: (g: Goal) => g.startValue },
    { header: 'Current', value: (g: Goal) => g.currentValue },
    { header: 'Target', value: (g: Goal) => g.targetValue },
    { header: 'Progress %', value: (g: Goal) => Math.round(goalProgress(g).pct) },
    { header: 'On Track', value: (g: Goal) => (goalProgress(g).onTrack ? 'Yes' : 'No') },
    { header: 'Start Date', value: (g: Goal) => g.startDate },
    { header: 'Deadline', value: (g: Goal) => g.deadline },
  ]

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="Followers, money, output — and whether today's pace actually gets you there."
        actions={
          <>
            <ExportMenu
              disabled={!state.goals.length}
              onXLSX={() => exportXLSX(resolved, columns, 'goals', 'Goals')}
              onCSV={() => exportCSV(resolved, columns, 'goals')}
            />
            <Button variant="primary" onClick={() => { setEditing(blank()); setIsNew(true) }}>
              <Plus size={15} /> New goal
            </Button>
          </>
        }
      />

      {!resolved.length ? (
        <EmptyState
          icon={<Target size={22} />}
          title="No goals set"
          description="One number, one date. “100K on Instagram by March” beats “grow the account” every time."
          action={<Button variant="primary" onClick={() => { setEditing(blank()); setIsNew(true) }}><Plus size={15} /> New goal</Button>}
        />
      ) : (
        <List className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {resolved.map((g) => {
            const p = goalProgress(g)
            const done = g.currentValue >= g.targetValue && g.targetValue > 0
            const kindMeta = GOAL_KINDS.find((k) => k.id === g.kind)

            return (
              <Item key={g.id}>
                <Card className="flex h-full flex-col p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{g.title}</h3>
                        {g.autoTrack && (
                          <Badge tone="info" title="Updates itself from your data"><Zap size={10} /> Auto</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {kindMeta?.label}{g.platform ? ` · ${g.platform}` : ''} · by {fmtDate(g.deadline)}
                      </p>
                    </div>
                    <Badge tone={done ? 'good' : p.onTrack ? 'good' : 'bad'}>
                      {done ? 'Hit it' : p.onTrack ? 'On track' : 'Behind'}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">
                        {fmtValue(g, g.currentValue)}
                      </p>
                      <p className="mt-1 text-[12px] text-muted">of {fmtValue(g, g.targetValue)} target</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-bold text-ink">{Math.round(p.pct)}%</p>
                      <p className="text-[11.5px] text-muted">
                        {p.daysLeft >= 0 ? `${p.daysLeft} days left` : `${Math.abs(p.daysLeft)} days over`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Progress value={p.pct} tone={done ? 'good' : p.onTrack ? 'accent' : 'warn'} marker={p.paceP} height={8} />
                    <div className="mt-1.5 flex justify-between text-[11px] text-faint">
                      <span>{fmtValue(g, g.startValue)}</span>
                      <span>
                        {done ? 'Target reached' : `${fmtValue(g, p.remaining)} to go`}
                        {!done && p.daysLeft > 0 && g.kind !== 'earnings' &&
                          ` · ${fmtNumber(Math.ceil(p.remaining / Math.max(1, p.daysLeft)))}/day`}
                      </span>
                    </div>
                  </div>

                  {g.history.length > 1 && (
                    <div className="mt-4 h-[68px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={g.history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <XAxis dataKey="date" hide />
                          <YAxis hide domain={['dataMin', 'dataMax']} />
                          <Tooltip
                            content={({ active, payload }) =>
                              active && payload?.length ? (
                                <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] shadow-lift">
                                  <p className="text-muted">{fmtDate(String(payload[0].payload.date))}</p>
                                  <p className="font-bold text-ink">{fmtCompact(Number(payload[0].value))}</p>
                                </div>
                              ) : null
                            }
                          />
                          <Line type="monotone" dataKey="value" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2 border-t border-line pt-3">
                    {!g.autoTrack && (
                      <Button size="sm" variant="soft" onClick={() => { setLogging(g); setLogValue(String(g.currentValue)) }}>
                        <TrendingUp size={13} /> Log progress
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(structuredClone(g)); setIsNew(false) }}>
                      Edit
                    </Button>
                    <IconButton label="Delete goal" tone="danger" className="ml-auto" onClick={() => del(g)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </Card>
              </Item>
            )
          })}
        </List>
      )}

      {/* ------------------------------------------------------- log modal */}
      <Modal
        open={!!logging}
        onClose={() => setLogging(null)}
        size="sm"
        title="Log progress"
        subtitle={logging?.title}
        footer={
          <>
            <Button onClick={() => setLogging(null)}>Cancel</Button>
            <Button variant="primary" onClick={logProgress}><Check size={14} /> Save</Button>
          </>
        }
      >
        <Field label={`Where are you today? (${logging?.unit || 'value'})`}>
          <Input
            autoFocus type="number" value={logValue}
            onChange={(e) => setLogValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') logProgress() }}
          />
        </Field>
        {logging && (
          <p className="mt-3 text-[12.5px] text-muted">
            Target is {fmtNumber(logging.targetValue)} by {fmtDate(logging.deadline)}.
          </p>
        )}
      </Modal>

      {/* ------------------------------------------------------ edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="md"
        title={isNew ? 'New goal' : 'Edit goal'}
        footer={
          <>
            {!isNew && editing && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => del(editing)}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save goal</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div>
              <span className="label">Goal type</span>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        kind: k.id,
                        unit: k.id === 'earnings' ? sym : k.unit,
                        autoTrack: k.id === 'earnings' || k.id === 'content',
                        platform: k.id === 'followers' ? editing.platform || 'Instagram' : '',
                      })
                    }
                    className={cx(
                      'rounded-xl border p-2.5 text-left transition-all duration-200 active:scale-[.98]',
                      editing.kind === k.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-faint',
                    )}
                  >
                    <p className="text-[13px] font-bold text-ink">{k.label}</p>
                    <p className="text-[11px] leading-snug text-muted">{k.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <Field label="Title">
              <Input
                autoFocus value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder={editing.kind === 'followers' ? 'Instagram to 100K' : editing.kind === 'earnings' ? 'Collect 12L this year' : 'Publish 120 pieces'}
              />
            </Field>

            {editing.kind === 'followers' && (
              <Field label="Platform">
                <Select value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value })}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Starting from" hint={editing.autoTrack ? 'Auto' : undefined}>
                <Input
                  type="number" value={editing.startValue}
                  disabled={editing.autoTrack}
                  onChange={(e) => setEditing({ ...editing, startValue: parseNum(e.target.value) })}
                />
              </Field>
              <Field label="Right now" hint={editing.autoTrack ? 'From your data' : undefined}>
                <Input
                  type="number" value={editing.currentValue}
                  disabled={editing.autoTrack}
                  onChange={(e) => setEditing({ ...editing, currentValue: parseNum(e.target.value) })}
                />
              </Field>
              <Field label="Target">
                <Input
                  type="number" value={editing.targetValue || ''} placeholder="0"
                  onChange={(e) => setEditing({ ...editing, targetValue: parseNum(e.target.value) })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <Input type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} />
              </Field>
              <Field label="Deadline" hint={editing.deadline ? `${daysBetween(today(), editing.deadline)} days from today` : undefined}>
                <Input type="date" value={editing.deadline} onChange={(e) => setEditing({ ...editing, deadline: e.target.value })} />
              </Field>
            </div>

            {(editing.kind === 'earnings' || editing.kind === 'content') && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                  checked={editing.autoTrack}
                  onChange={(e) => setEditing({ ...editing, autoTrack: e.target.checked })}
                />
                <span className="text-[12.5px] leading-relaxed text-ink">
                  <strong className="font-semibold">Track this automatically.</strong>{' '}
                  <span className="text-muted">
                    {editing.kind === 'earnings'
                      ? 'Counts every payment you collect between the start date and the deadline.'
                      : 'Counts every piece you mark published in that window.'}
                  </span>
                </span>
              </label>
            )}

            {editing.targetValue > 0 && editing.deadline && (
              <p className="rounded-xl bg-elevated px-3 py-2.5 text-[12.5px] text-muted">
                That is{' '}
                <strong className="font-semibold text-ink">
                  {fmtNumber(
                    Math.ceil(
                      Math.max(0, editing.targetValue - editing.currentValue) /
                      Math.max(1, clamp(daysBetween(today(), editing.deadline), 1, 100000)),
                    ),
                  )}
                </strong>{' '}
                per day for {Math.max(0, daysBetween(today(), editing.deadline))} days.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
