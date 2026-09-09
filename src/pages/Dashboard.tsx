import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  AlertCircle, ArrowRight, Bell, CalendarClock, ChevronRight, Clock,
  Lightbulb, Plus, Receipt, Send, Sparkles, Target, Users, Wallet, Zap,
} from 'lucide-react'
import { demoState, emptyState, useStore } from '../lib/store'
import {
  bucketize, buildTransactions, contentThisWeek, dealsAwaitingInvoice, dueFollowUps,
  earningsFor, openDeals, overdueInvoices, rangeFor, resolvedGoalValue, shiftRange,
  upcomingInvoices,
} from '../lib/selectors'
import type { DateRange, RangePreset } from '../lib/selectors'
import type { ContentPiece } from '../lib/types'
import { CONTENT_STATUSES } from '../lib/types'
import {
  cx, fmtDate, fmtDateShort, fmtMoney, fmtNumber, goalProgress, invoiceTotals,
  relativeDays, sortBy, today,
} from '../lib/utils'
import {
  Badge, Button, Card, Field, Input, Item, List, Progress, Segmented, useToast,
} from '../components/ui'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { state, settings, replaceAll } = useStore()
  const navigate = useNavigate()
  const toast = useToast()
  const sym = settings.currencySymbol

  const [range, setRange] = useState<DateRange>(() => rangeFor('month'))
  const [customOpen, setCustomOpen] = useState(false)

  const txs = useMemo(() => buildTransactions(state), [state])
  const summary = useMemo(() => earningsFor(txs, range), [txs, range])
  const spark = useMemo(() => {
    const b = bucketize(txs, range)
    let run = 0
    return b.map((x) => { run += x.net; return { label: x.label, value: run } })
  }, [txs, range])

  const followUps = useMemo(() => dueFollowUps(state), [state])
  const overdue = useMemo(() => overdueInvoices(state), [state])
  const awaitingInvoice = useMemo(() => dealsAwaitingInvoice(state), [state])
  const upcoming = useMemo(() => upcomingInvoices(state, 30), [state])
  const collabs = useMemo(() => sortBy(openDeals(state), (d) => d.followUpDate || 'zzz', 'asc'), [state])
  const postToday = useMemo(() => state.content.filter((c) => c.postDate === today() && c.status !== 'published'), [state])
  const thisWeek = useMemo(() => contentThisWeek(state), [state])
  const recentIdeas = useMemo(() => sortBy(state.ideas, (i) => i.createdAt, 'desc').slice(0, 5), [state.ideas])
  const goals = useMemo(
    () => state.goals.map((g) => ({ ...g, currentValue: resolvedGoalValue(state, g) })).slice(0, 3),
    [state],
  )

  const isEmpty = !state.deals.length && !state.invoices.length && !state.content.length
    && !state.ideas.length && !state.templates.length && !state.goals.length

  const attention = followUps.length + overdue.length + awaitingInvoice.length + postToday.length

  if (isEmpty) {
    return (
      <Welcome
        onDemo={() => {
          const seeded = demoState(emptyState())
          replaceAll({ ...seeded, settings: { ...seeded.settings, theme: settings.theme } })
          toast('Sample data loaded')
        }}
      />
    )
  }

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[27px]">
            {greeting()}{settings.creatorName ? `, ${settings.creatorName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {fmtDate(today())}
            {attention > 0
              ? ` · ${attention} ${attention === 1 ? 'thing needs' : 'things need'} you`
              : ' · nothing overdue. Go make something.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate('/ideas')}><Lightbulb size={14} /> Idea</Button>
          <Button size="sm" onClick={() => navigate('/outreach')}><Users size={14} /> Deal</Button>
          <Button size="sm" variant="primary" onClick={() => navigate('/invoices/new')}><Receipt size={14} /> Invoice</Button>
        </div>
      </div>

      {/* ------------------------------------------------------- attention */}
      {attention > 0 && (
        <List className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {!!followUps.length && (
            <Item>
              <AlertCard
                tone="warn" icon={<Bell size={15} />}
                title={`${followUps.length} follow-${followUps.length === 1 ? 'up' : 'ups'} due`}
                body={followUps.slice(0, 2).map((d) => d.brand).join(', ')}
                onClick={() => navigate('/outreach')}
              />
            </Item>
          )}
          {!!overdue.length && (
            <Item>
              <AlertCard
                tone="bad" icon={<AlertCircle size={15} />}
                title={`${fmtMoney(overdue.reduce((s, i) => s + invoiceTotals(i).total, 0), sym)} overdue`}
                body={`${overdue.length} ${overdue.length === 1 ? 'invoice is' : 'invoices are'} past the due date`}
                onClick={() => navigate('/invoices')}
              />
            </Item>
          )}
          {!!awaitingInvoice.length && (
            <Item>
              <AlertCard
                tone="accent" icon={<Receipt size={15} />}
                title={`${awaitingInvoice.length} won ${awaitingInvoice.length === 1 ? 'deal' : 'deals'} to bill`}
                body="Closed, delivered, not invoiced yet"
                onClick={() => navigate(`/invoices/new?deal=${awaitingInvoice[0].id}`)}
              />
            </Item>
          )}
          {!!postToday.length && (
            <Item>
              <AlertCard
                tone="good" icon={<Send size={15} />}
                title={`${postToday.length} to post today`}
                body={postToday.map((c) => c.title).join(', ')}
                onClick={() => navigate('/planner')}
              />
            </Item>
          )}
        </List>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* --------------------------------------------------- earnings */}
        {/* min-w-0: a grid item defaults to min-content width, which the chart
            and the range control would otherwise push past the viewport. */}
        <Card className="min-w-0 lg:col-span-2">
          <div className="flex flex-col items-start justify-between gap-3 p-4 pb-0 sm:flex-row sm:p-5 sm:pb-0">
            <button onClick={() => navigate('/earnings')} className="group text-left">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                <Wallet size={13} /> Earnings · {range.label}
              </p>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-0.03em] text-ink sm:text-[38px]">
                {fmtMoney(summary.net, sym)}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">
                Open earnings
                <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </p>
            </button>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <Segmented
                size="sm"
                value={customOpen ? 'custom' : range.preset}
                onChange={(v) => {
                  if (v === 'custom') { setCustomOpen(true); setRange({ ...range, preset: 'custom', label: 'Custom' }) }
                  else { setCustomOpen(false); setRange(rangeFor(v as RangePreset)) }
                }}
                className="w-full [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none"
                options={[
                  { id: 'month', label: 'M' },
                  { id: 'quarter', label: 'Q' },
                  { id: 'year', label: 'Y' },
                  { id: 'custom', label: 'Custom' },
                ]}
              />
              {!customOpen && range.preset !== 'custom' && (
                <div className="flex items-center gap-1 self-end text-[12px] text-muted">
                  <button onClick={() => setRange(shiftRange(range, -1))} aria-label="Previous period" className="rounded px-1.5 py-0.5 hover:bg-elevated">←</button>
                  <span className="whitespace-nowrap font-semibold text-ink">{range.label}</span>
                  <button onClick={() => setRange(shiftRange(range, 1))} aria-label="Next period" className="rounded px-1.5 py-0.5 hover:bg-elevated">→</button>
                </div>
              )}
            </div>
          </div>

          {customOpen && (
            <div className="flex flex-wrap items-end gap-2.5 px-4 pt-3 sm:px-5">
              <Field label="From">
                <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value, preset: 'custom', label: 'Custom' })} />
              </Field>
              <Field label="To">
                <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value, preset: 'custom', label: 'Custom' })} />
              </Field>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-3 px-4 sm:px-5">
            <MiniStat label="Collected" value={fmtMoney(summary.collected, sym)} tone="good" />
            <MiniStat label="Yet to come" value={fmtMoney(summary.pending, sym)} tone={summary.pending ? 'warn' : undefined} />
            <MiniStat label="Expenses" value={fmtMoney(summary.expenses, sym)} />
          </div>

          <div className="mt-3 h-[110px] w-full sm:h-[130px]">
            {spark.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] shadow-lift">
                          <p className="text-muted">{String(payload[0].payload.label)}</p>
                          <p className="font-bold text-ink">{fmtMoney(Number(payload[0].value), sym)}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Area type="monotone" dataKey="value" stroke="rgb(var(--accent))" strokeWidth={2}
                    fill="url(#dashGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[12.5px] text-faint">
                Not enough data in {range.label} to draw a trend yet.
              </div>
            )}
          </div>
        </Card>

        {/* ------------------------------------------------------- goals */}
        <PanelCard
          title="Goals" icon={<Target size={14} />} onOpen={() => navigate('/goals')}
          empty={!goals.length}
          emptyText="Set one number and one date. That is a goal."
          emptyAction={<Button size="sm" variant="primary" onClick={() => navigate('/goals')}><Plus size={13} /> Add a goal</Button>}
        >
          <div className="space-y-3.5">
            {goals.map((g) => {
              const p = goalProgress(g)
              return (
                <button key={g.id} onClick={() => navigate('/goals')} className="block w-full text-left">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{g.title}</span>
                    <span className={cx('shrink-0 text-[11px] font-bold', p.onTrack ? 'text-positive' : 'text-danger')}>
                      {p.onTrack ? 'on track' : 'behind'}
                    </span>
                  </div>
                  <Progress value={p.pct} tone={p.onTrack ? 'accent' : 'warn'} marker={p.paceP} height={5} />
                  <div className="mt-1 flex justify-between text-[11px] text-muted">
                    <span>
                      {g.kind === 'earnings' ? fmtMoney(g.currentValue, sym) : fmtNumber(g.currentValue)}
                      {' / '}
                      {g.kind === 'earnings' ? fmtMoney(g.targetValue, sym) : fmtNumber(g.targetValue)}
                    </span>
                    <span>{p.daysLeft >= 0 ? `${p.daysLeft}d left` : 'past due'}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </PanelCard>

        {/* --------------------------------------------------- invoices */}
        <PanelCard
          title="Invoices due" icon={<Clock size={14} />} onOpen={() => navigate('/invoices')}
          badge={upcoming.length ? String(upcoming.length) : undefined}
          empty={!upcoming.length}
          emptyText="Nothing outstanding. Rare and excellent."
        >
          <div className="space-y-1">
            {upcoming.slice(0, 5).map((inv) => {
              const late = inv.dueDate < today()
              return (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="row-hover flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
                >
                  <span className={cx('h-8 w-1 shrink-0 rounded-full', late ? 'bg-danger' : 'bg-warning')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{inv.to.name || 'No client'}</span>
                    <span className={cx('block text-[11.5px]', late ? 'font-semibold text-danger' : 'text-muted')}>
                      {inv.number} · due {relativeDays(inv.dueDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-bold text-ink">{fmtMoney(invoiceTotals(inv).total, sym)}</span>
                </button>
              )
            })}
          </div>
        </PanelCard>

        {/* ---------------------------------------------------- collabs */}
        <PanelCard
          title="Open collabs" icon={<Users size={14} />} onOpen={() => navigate('/outreach')}
          badge={collabs.length ? String(collabs.length) : undefined}
          empty={!collabs.length}
          emptyText="No live conversations. Time to pitch someone."
        >
          <div className="space-y-1">
            {collabs.slice(0, 5).map((d) => {
              const due = d.followUpDate && d.followUpDate <= today()
              return (
                <button
                  key={d.id}
                  onClick={() => navigate('/outreach')}
                  className="row-hover flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{d.brand}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {d.followUpDate
                        ? <span className={due ? 'font-semibold text-danger' : ''}>follow up {relativeDays(d.followUpDate)}</span>
                        : `contacted ${fmtDateShort(d.dateContacted)}`}
                    </span>
                  </span>
                  <Badge tone={d.stage === 'negotiating' ? 'warn' : 'info'}>
                    {d.stage.replace('-', ' ')}
                  </Badge>
                </button>
              )
            })}
          </div>
        </PanelCard>

        {/* ---------------------------------------------------- content */}
        <PanelCard
          title="Coming up" icon={<CalendarClock size={14} />} onOpen={() => navigate('/planner')}
          empty={!postToday.length && !thisWeek.length}
          emptyText="Nothing scheduled this week."
          emptyAction={<Button size="sm" onClick={() => navigate('/planner')}><Plus size={13} /> Plan a piece</Button>}
        >
          <div className="space-y-1">
            {postToday.map((c) => <ContentRow key={c.id} piece={c} today onClick={() => navigate('/planner')} />)}
            {thisWeek.filter((c) => c.postDate !== today()).slice(0, 4).map((c) => (
              <ContentRow key={c.id} piece={c} onClick={() => navigate('/planner')} />
            ))}
          </div>
        </PanelCard>

        {/* ------------------------------------------------------ ideas */}
        <PanelCard
          title="Recent ideas" icon={<Lightbulb size={14} />} onOpen={() => navigate('/ideas')}
          empty={!recentIdeas.length}
          emptyText="Your idea dump is empty."
          emptyAction={<Button size="sm" onClick={() => navigate('/ideas')}><Plus size={13} /> Capture one</Button>}
        >
          <div className="space-y-1">
            {recentIdeas.map((i) => (
              <button
                key={i.id}
                onClick={() => navigate('/ideas')}
                className="row-hover flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left"
              >
                <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{i.title}</span>
                  <span className="block text-[11px] text-faint">
                    {i.category ? `${i.category} · ` : ''}{fmtDateShort(i.createdAt.slice(0, 10))}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </PanelCard>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- pieces */
const MiniStat = ({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) => (
  <div>
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
    <p className={cx('mt-0.5 text-[15px] font-bold tracking-[-0.02em]',
      tone === 'good' ? 'text-positive' : tone === 'warn' ? 'text-warning' : 'text-ink')}>
      {value}
    </p>
  </div>
)

const AlertCard = ({ tone, icon, title, body, onClick }: {
  tone: 'warn' | 'bad' | 'good' | 'accent'
  icon: React.ReactNode
  title: string
  body: string
  onClick: () => void
}) => {
  const styles = {
    warn: 'border-warning/40 bg-warning/20 text-warning',
    bad: 'border-danger/25 bg-danger/10 text-danger',
    good: 'border-positive/25 bg-positive/10 text-positive',
    accent: 'border-accent/40 bg-accent-soft text-accent',
  }[tone]

  return (
    <button
      onClick={onClick}
      className={cx(
        'group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lift active:scale-[.99]', styles,
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-ink">{title}</span>
        <span className="block truncate text-[11.5px] text-muted">{body}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  )
}

const PanelCard = ({ title, icon, badge, onOpen, children, empty, emptyText, emptyAction }: {
  title: string
  icon: React.ReactNode
  badge?: string
  onOpen: () => void
  children: React.ReactNode
  empty?: boolean
  emptyText?: string
  emptyAction?: React.ReactNode
}) => (
  <Card className="flex flex-col p-4 sm:p-5">
    <div className="mb-3.5 flex items-center gap-2">
      <span className="text-accent">{icon}</span>
      <h2 className="text-[13.5px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {badge && <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[11px] font-bold text-muted">{badge}</span>}
      <button
        onClick={onOpen}
        className="ml-auto inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:bg-elevated hover:text-accent"
      >
        Open <ChevronRight size={12} />
      </button>
    </div>

    {empty ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
        <p className="text-[12.5px] text-faint">{emptyText}</p>
        {emptyAction}
      </div>
    ) : (
      <div className="-mx-2 flex-1">{children}</div>
    )}
  </Card>
)

const ContentRow = ({ piece, today: isToday, onClick }: { piece: ContentPiece; today?: boolean; onClick: () => void }) => {
  const stage = CONTENT_STATUSES.find((s) => s.id === piece.status)
  return (
    <button onClick={onClick} className="row-hover flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
      <span className={cx('h-8 w-1 shrink-0 rounded-full', isToday ? 'bg-positive' : 'bg-line')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{piece.title || 'Untitled'}</span>
        <span className="block truncate text-[11.5px] text-muted">
          {stage?.label} · {isToday ? 'post today' : `post ${fmtDateShort(piece.postDate)}`}
        </span>
      </span>
      {isToday && <Badge tone="good">Today</Badge>}
    </button>
  )
}

/* -------------------------------------------------------------- welcome */
function Welcome({ onDemo }: { onDemo: () => void }) {
  const navigate = useNavigate()
  const steps = [
    { icon: <Users size={16} />, title: 'Log a brand deal', body: 'Who reached out, what they want, what you quoted.', to: '/outreach' },
    { icon: <Receipt size={16} />, title: 'Raise an invoice', body: 'Pick a template, export a clean PDF, track the payment.', to: '/invoices/new' },
    { icon: <Lightbulb size={16} />, title: 'Dump an idea', body: 'Anything half-formed. Sort it out later.', to: '/ideas' },
    { icon: <Target size={16} />, title: 'Set one goal', body: 'A number and a date. The app watches your pace.', to: '/goals' },
  ]

  return (
    <div className="mx-auto max-w-2xl py-8 text-center sm:py-14">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-lift">
        <Zap size={24} />
      </div>
      <h1 className="text-[26px] font-bold tracking-[-0.025em] text-ink sm:text-[32px]">Welcome to Creator OS</h1>
      <p className="mx-auto mt-2.5 max-w-md text-[14px] leading-relaxed text-muted">
        Deals, invoices, money, ideas and your content calendar — in one place, on this device, no account needed.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2.5">
        <Button variant="primary" size="lg" onClick={onDemo}><Sparkles size={16} /> Explore with sample data</Button>
        <Button size="lg" onClick={() => navigate('/settings')}>Set up my details</Button>
      </div>

      <div className="mt-9 grid gap-2.5 text-left sm:grid-cols-2">
        {steps.map((s) => (
          <button
            key={s.title}
            onClick={() => navigate(s.to)}
            className="group flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{s.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold text-ink">{s.title}</span>
              <span className="block text-[12px] leading-relaxed text-muted">{s.body}</span>
            </span>
            <ChevronRight size={15} className="ml-auto mt-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      <p className="mt-8 text-[12px] text-faint">
        Sample data is easy to wipe later — Settings → Erase everything.
      </p>
    </div>
  )
}
