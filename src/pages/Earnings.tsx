import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Clock, FileText, Minus,
  Plus, Receipt, Trash2, TrendingUp, Wallet,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { Expense, OtherIncome, Transaction } from '../lib/types'
import { EXPENSE_CATEGORIES, INCOME_SOURCES } from '../lib/types'
import {
  bucketize, buildTransactions, earningsFor, rangeFor, shiftRange,
} from '../lib/selectors'
import type { DateRange, RangePreset } from '../lib/selectors'
import { cx, fmtCompact, fmtDate, fmtMoney, parseNum, today, uid } from '../lib/utils'
import { exportCSV, exportXLSX } from '../lib/export'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Item, List,
  Modal, PageHeader, Segmented, Select, Textarea, useConfirm, useToast,
} from '../components/ui'

export default function Earnings() {
  const { state, settings, put, remove } = useStore()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const sym = settings.currencySymbol

  const [range, setRange] = useState<DateRange>(() => rangeFor('month'))
  const [detail, setDetail] = useState<Transaction | null>(null)
  const [recording, setRecording] = useState<'expense' | 'income' | null>(null)

  const txs = useMemo(() => buildTransactions(state), [state])
  const summary = useMemo(() => earningsFor(txs, range), [txs, range])
  const buckets = useMemo(() => bucketize(txs, range), [txs, range])

  const cumulative = useMemo(() => {
    let run = 0
    return buckets.map((b) => {
      run += b.net
      return { ...b, cumulative: run }
    })
  }, [buckets])

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of summary.transactions) {
      if (t.kind !== 'expense') continue
      m.set(t.subtitle, (m.get(t.subtitle) ?? 0) + Math.abs(t.amount))
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [summary.transactions])

  const setPreset = (p: RangePreset) => setRange(rangeFor(p))

  const txColumns = [
    { header: 'Date', value: (t: Transaction) => t.date },
    { header: 'Type', value: (t: Transaction) => (t.kind === 'expense' ? 'Expense' : t.kind === 'income' ? 'Other income' : 'Invoice') },
    { header: 'Description', value: (t: Transaction) => t.title, width: 34 },
    { header: 'Reference', value: (t: Transaction) => t.subtitle },
    { header: `Amount (${settings.currency})`, value: (t: Transaction) => t.amount },
    { header: 'Collected', value: (t: Transaction) => (t.kind === 'expense' ? 'n/a' : t.collected ? 'Yes' : 'No') },
  ]

  const deleteTx = async (t: Transaction) => {
    if (t.kind === 'invoice') {
      setDetail(null)
      navigate(`/invoices/${t.sourceId}`)
      return
    }
    const ok = await confirm({ title: 'Delete this record?', confirmLabel: 'Delete', tone: 'danger' })
    if (!ok) return
    remove(t.kind === 'expense' ? 'expenses' : 'otherIncome', t.sourceId)
    setDetail(null)
    toast('Deleted', 'info')
  }

  const canShift = range.preset === 'month' || range.preset === 'quarter' || range.preset === 'year'

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle="What actually landed, what is still owed, and where it is trending."
        actions={
          <>
            <ExportMenu
              disabled={!summary.transactions.length}
              onXLSX={() => exportXLSX(summary.transactions, txColumns, 'earnings', 'Transactions')}
              onCSV={() => exportCSV(summary.transactions, txColumns, 'earnings')}
            />
            <Button variant="primary" onClick={() => setRecording('expense')}>
              <Minus size={15} /> Record expense
            </Button>
          </>
        }
      >
        <RangeBar range={range} setRange={setRange} setPreset={setPreset} canShift={canShift} />
      </PageHeader>

      {/* --------------------------------------------------------- headline */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricCard
          icon={<Wallet size={15} />} label="Collected" value={fmtMoney(summary.collected, sym)}
          hint="Money in the bank" tone="good"
        />
        <MetricCard
          icon={<Clock size={15} />} label="Yet to come" value={fmtMoney(summary.pending, sym)}
          hint="Invoiced, not paid" tone={summary.pending ? 'warn' : undefined}
        />
        <MetricCard
          icon={<Receipt size={15} />} label="Expenses" value={fmtMoney(summary.expenses, sym)}
          hint={`${byCategory.length} ${byCategory.length === 1 ? 'category' : 'categories'}`}
        />
        <MetricCard
          icon={<TrendingUp size={15} />} label="Actual earnings" value={fmtMoney(summary.net, sym)}
          hint="Collected − expenses" tone={summary.net >= 0 ? 'good' : 'bad'} emphasis
        />
      </div>

      {/* ------------------------------------------------------------ chart */}
      <Card className="mt-4 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-bold text-ink">Money over time</h2>
            <p className="text-[12px] text-muted">{range.label} · collected vs expenses</p>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-muted">
            <LegendDot color="rgb(var(--positive))" label="Collected" />
            <LegendDot color="rgb(var(--danger))" label="Expenses" />
            <LegendDot color="rgb(var(--accent))" label="Running net" />
          </div>
        </div>

        {buckets.length ? (
          <div className="h-[260px] w-full sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--positive))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="rgb(var(--positive))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="rgb(var(--line))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} minTickGap={14} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)} width={54} />
                <Tooltip content={<ChartTooltip sym={sym} />} cursor={{ stroke: 'rgb(var(--line))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="rgb(var(--positive))" strokeWidth={2}
                  fill="url(#gCollected)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="rgb(var(--danger))" strokeWidth={1.6}
                  fill="transparent" dot={false} strokeDasharray="4 3" />
                <Area type="monotone" dataKey="cumulative" name="Running net" stroke="rgb(var(--accent))" strokeWidth={2}
                  fill="url(#gNet)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-line text-center">
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Nothing recorded in {range.label}</p>
              <p className="mt-1 text-[12.5px] text-muted">Mark an invoice paid, or widen the range.</p>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------------------------------------------------- transactions */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-bold text-ink">Transactions</h2>
            <span className="text-[12px] text-muted">{summary.transactions.length} in {range.label}</span>
          </div>

          {!summary.transactions.length ? (
            <div className="p-4">
              <EmptyState
                compact
                icon={<Wallet size={20} />}
                title="No transactions in this period"
                description="Invoices show up here the moment you mark them paid."
                action={<Button size="sm" onClick={() => navigate('/invoices')}><FileText size={14} /> Go to invoices</Button>}
              />
            </div>
          ) : (
            <List className="divide-y divide-line">
              {summary.transactions.map((t) => (
                <Item key={t.id}>
                  <button
                    onClick={() => setDetail(t)}
                    className="row-hover flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                      t.kind === 'expense' ? 'bg-danger/10 text-danger'
                        : t.collected ? 'bg-positive/10 text-positive' : 'bg-warning/20 text-warning')}>
                      {t.kind === 'expense' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{t.title}</span>
                      <span className="block truncate text-[12px] text-muted">{t.subtitle} · {fmtDate(t.date)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cx('block text-[13.5px] font-bold',
                        t.kind === 'expense' ? 'text-danger' : t.collected ? 'text-positive' : 'text-ink')}>
                        {t.kind === 'expense' ? '−' : '+'}{fmtMoney(Math.abs(t.amount), sym)}
                      </span>
                      {t.kind !== 'expense' && !t.collected && (
                        <span className="text-[11px] font-semibold text-warning">awaiting</span>
                      )}
                    </span>
                  </button>
                </Item>
              ))}
            </List>
          )}
        </Card>

        {/* ------------------------------------------------------- breakdown */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-[14px] font-bold text-ink">Where money went</h2>
            {byCategory.length ? (
              <>
                <div className="h-[150px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                        axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip sym={sym} />} cursor={{ fill: 'rgb(var(--elevated))' }} />
                      <Bar dataKey="value" name="Spent" radius={[0, 5, 5, 0]} maxBarSize={16}>
                        {byCategory.map((_, i) => <Cell key={i} fill="rgb(var(--danger))" fillOpacity={1 - i * 0.12} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  {fmtMoney(summary.expenses, sym)} across {byCategory.length} {byCategory.length === 1 ? 'category' : 'categories'}
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-[12.5px] text-faint">No expenses in this period.</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => setRecording('expense')}><Minus size={13} /> Expense</Button>
              <Button size="sm" onClick={() => setRecording('income')}><Plus size={13} /> Income</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-[14px] font-bold text-ink">Still to collect</h2>
            <p className="text-[24px] font-bold tracking-[-0.02em] text-ink">{fmtMoney(summary.pending, sym)}</p>
            <p className="mt-0.5 text-[12px] text-muted">Invoiced inside {range.label} and not yet paid.</p>
            <Button size="sm" block className="mt-3" onClick={() => navigate('/invoices')}>
              <FileText size={13} /> Chase invoices
            </Button>
          </Card>
        </div>
      </div>

      <TransactionDetail tx={detail} sym={sym} state={state} onClose={() => setDetail(null)} onDelete={deleteTx}
        onOpenInvoice={(invId) => { setDetail(null); navigate(`/invoices/${invId}`) }} />

      <RecordModal
        mode={recording}
        sym={sym}
        onClose={() => setRecording(null)}
        onSave={(kind, record) => {
          if (kind === 'expense') put('expenses', record as Expense)
          else put('otherIncome', record as OtherIncome)
          toast(kind === 'expense' ? 'Expense recorded' : 'Income recorded')
          setRecording(null)
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------- range bar */
function RangeBar({ range, setRange, setPreset, canShift }: {
  range: DateRange; setRange: (r: DateRange) => void; setPreset: (p: RangePreset) => void; canShift: boolean
}) {
  const [custom, setCustom] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Five presets do not fit a phone screen — let the row scroll. */}
        <div className="no-scrollbar -mx-4 max-w-full overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented
          value={custom ? 'custom' : range.preset}
          onChange={(v) => {
            if (v === 'custom') { setCustom(true); setRange({ ...range, preset: 'custom', label: 'Custom range' }) }
            else { setCustom(false); setPreset(v as RangePreset) }
          }}
          options={[
            { id: 'month', label: 'Monthly' },
            { id: 'quarter', label: 'Quarterly' },
            { id: 'year', label: 'Yearly' },
            { id: 'all', label: 'All time' },
            { id: 'custom', label: 'Custom' },
          ]}
        />
        </div>

        {canShift && !custom && (
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <IconButton label="Previous period" onClick={() => setRange(shiftRange(range, -1))}><ChevronLeft size={16} /></IconButton>
            <span className="min-w-[92px] text-center text-[13px] font-semibold text-ink">{range.label}</span>
            <IconButton label="Next period" onClick={() => setRange(shiftRange(range, 1))}><ChevronRight size={16} /></IconButton>
          </div>
        )}
      </div>

      {custom && (
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="From">
            <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value, label: 'Custom range', preset: 'custom' })} />
          </Field>
          <Field label="To">
            <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value, label: 'Custom range', preset: 'custom' })} />
          </Field>
          <span className="pb-2.5 text-[12px] text-muted">{fmtDate(range.from)} → {fmtDate(range.to)}</span>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- cards */
const MetricCard = ({ icon, label, value, hint, tone, emphasis }: {
  icon: React.ReactNode; label: string; value: string; hint?: string
  tone?: 'good' | 'bad' | 'warn'; emphasis?: boolean
}) => (
  <Card className={cx('p-3.5 sm:p-4', emphasis && 'border-accent/40 bg-accent-soft')}>
    <div className="mb-1.5 flex items-center gap-1.5 text-muted">
      <span className={cx(tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-muted')}>
        {icon}
      </span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em]">{label}</span>
    </div>
    <p className={cx('text-[19px] font-bold tracking-[-0.025em] sm:text-[22px]',
      tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-danger' : 'text-ink')}>
      {value}
    </p>
    {hint && <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>}
  </Card>
)

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
)

const ChartTooltip = ({ active, payload, label, sym }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; sym: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="mb-1 text-[11.5px] font-semibold text-muted">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[12.5px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-bold text-ink">{fmtMoney(p.value, sym)}</span>
        </p>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ tx details */
function TransactionDetail({ tx, sym, state, onClose, onDelete, onOpenInvoice }: {
  tx: Transaction | null
  sym: string
  state: ReturnType<typeof useStore>['state']
  onClose: () => void
  onDelete: (t: Transaction) => void
  onOpenInvoice: (id: string) => void
}) {
  if (!tx) return null
  const invoice = tx.kind === 'invoice' ? state.invoices.find((i) => i.id === tx.sourceId) : undefined
  const expense = tx.kind === 'expense' ? state.expenses.find((e) => e.id === tx.sourceId) : undefined
  const income = tx.kind === 'income' ? state.otherIncome.find((i) => i.id === tx.sourceId) : undefined
  const notes = expense?.notes || income?.notes || invoice?.notes || ''

  return (
    <Modal
      open={!!tx}
      onClose={onClose}
      size="sm"
      title={tx.title}
      subtitle={`${tx.subtitle} · ${fmtDate(tx.date)}`}
      footer={
        <>
          {tx.kind !== 'invoice' && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => onDelete(tx)}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
          {invoice && <Button variant="primary" onClick={() => onOpenInvoice(invoice.id)}><FileText size={14} /> Open invoice</Button>}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-elevated p-4 text-center">
          <p className={cx('text-[30px] font-bold tracking-[-0.03em]',
            tx.kind === 'expense' ? 'text-danger' : tx.collected ? 'text-positive' : 'text-ink')}>
            {tx.kind === 'expense' ? '−' : '+'}{fmtMoney(Math.abs(tx.amount), sym, 2)}
          </p>
          <Badge tone={tx.kind === 'expense' ? 'bad' : tx.collected ? 'good' : 'warn'} className="mt-2">
            {tx.kind === 'expense' ? 'Expense' : tx.collected ? 'Collected' : 'Awaiting payment'}
          </Badge>
        </div>

        <dl className="space-y-2.5 text-[13px]">
          <DetailRow label="Date" value={fmtDate(tx.date)} />
          <DetailRow label="Type" value={tx.kind === 'invoice' ? 'Client invoice' : tx.kind === 'income' ? 'Other income' : 'Expense'} />
          <DetailRow label="Reference" value={tx.subtitle} />
          {invoice && (
            <>
              <DetailRow label="Client" value={invoice.to.name || '—'} />
              <DetailRow label="Issued" value={fmtDate(invoice.date)} />
              <DetailRow label="Due" value={fmtDate(invoice.dueDate)} />
              {invoice.paidDate && <DetailRow label="Paid on" value={fmtDate(invoice.paidDate)} />}
              <DetailRow label="Line items" value={String(invoice.items.length)} />
            </>
          )}
          {notes && <DetailRow label="Notes" value={notes} />}
        </dl>

        {invoice && !!invoice.items.length && (
          <div className="rounded-xl border border-line">
            {invoice.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-[12.5px] last:border-0">
                <span className="min-w-0 flex-1 truncate text-ink">{it.description || '—'}</span>
                <span className="text-muted">{it.qty} ×</span>
                <span className="font-semibold text-ink">{fmtMoney(it.rate, sym)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-4">
    <dt className="w-24 shrink-0 text-muted">{label}</dt>
    <dd className="min-w-0 flex-1 whitespace-pre-wrap font-medium text-ink">{value}</dd>
  </div>
)

/* --------------------------------------------------------- record modal */
function RecordModal({ mode, sym, onClose, onSave }: {
  mode: 'expense' | 'income' | null
  sym: string
  onClose: () => void
  onSave: (kind: 'expense' | 'income', record: Expense | OtherIncome) => void
}) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [date, setDate] = useState(today())
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [source, setSource] = useState<string>(INCOME_SOURCES[0])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  // Reset the form each time the modal opens.
  const openKey = mode ?? ''
  const [lastKey, setLastKey] = useState('')
  if (mode && openKey !== lastKey) {
    setLastKey(openKey)
    setKind(mode)
    setDate(today())
    setDescription('')
    setAmount('')
    setNotes('')
  }

  const submit = () => {
    const value = parseNum(amount)
    if (!value) return
    const base = { id: uid(kind === 'expense' ? 'e' : 'oi'), date, description, amount: Math.abs(value), notes, createdAt: new Date().toISOString() }
    onSave(kind, kind === 'expense' ? { ...base, category } as Expense : { ...base, source } as OtherIncome)
  }

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      size="sm"
      title={kind === 'expense' ? 'Record an expense' : 'Record other income'}
      subtitle={kind === 'expense' ? 'Counted against your actual earnings' : 'Money outside invoices — payouts, affiliate, products'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!parseNum(amount)}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ id: 'expense' as const, label: 'Expense' }, { id: 'income' as const, label: 'Other income' }]}
          className="w-full [&>button]:flex-1"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount (${sym})`}>
            <Input autoFocus type="number" min={0} value={amount} placeholder="0"
              onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label={kind === 'expense' ? 'Category' : 'Source'}>
          {kind === 'expense' ? (
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          ) : (
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {INCOME_SOURCES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
        </Field>

        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'expense' ? 'Editing suite — annual' : 'YouTube payout — August'} />
        </Field>

        <Field label="Notes" hint="Optional">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
