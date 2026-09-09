import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpDown, Bell, CalendarClock, ChevronRight, FileText, Mail, Phone, Plus,
  Receipt, Trash2, Users, X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { Deal, DealStage, Deliverable } from '../lib/types'
import { DEAL_STAGES, DELIVERABLE_TYPES } from '../lib/types'
import {
  cx, daysBetween, deliverableSummary, fmtDate, fmtMoney, matches, parseNum,
  relativeDays, sortBy, today, uid,
} from '../lib/utils'
import { dealsAwaitingInvoice, dueFollowUps } from '../lib/selectors'
import { exportCSV, exportXLSX } from '../lib/export'
import {
  Badge, Button, Card, EmptyState, ExportMenu, Field, IconButton, Input, Item, List,
  Modal, PageHeader, SearchInput, Select, Textarea, useConfirm, useMediaQuery, useToast,
} from '../components/ui'

const stageMeta = (s: DealStage) => DEAL_STAGES.find((x) => x.id === s) ?? DEAL_STAGES[0]

const blank = (): Deal => ({
  id: uid('d'),
  brand: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  dateContacted: today(),
  deliverables: [{ id: uid('dl'), type: 'UGC Video', qty: 1 }],
  adRightsMonths: 0,
  quotedAmount: 0,
  statedAmount: 0,
  finalAmount: 0,
  stage: 'contacted',
  followUpDate: '',
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

type SortKey = 'dateContacted' | 'brand' | 'value' | 'followUpDate' | 'stage'

export default function Outreach() {
  const { state, settings, put, remove } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  // Below 1024px the wide deal table stops being readable — use cards instead.
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const sym = settings.currencySymbol

  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<'all' | 'open' | DealStage>('open')
  const [sortKey, setSortKey] = useState<SortKey>('dateContacted')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [editing, setEditing] = useState<Deal | null>(null)
  const [isNew, setIsNew] = useState(false)

  const awaiting = useMemo(() => dealsAwaitingInvoice(state), [state])

  const dealValue = (d: Deal) => d.finalAmount || d.statedAmount || d.quotedAmount || 0

  const visible = useMemo(() => {
    const filtered = state.deals.filter((d) => {
      if (stage === 'open' && (d.stage === 'closed' || d.stage === 'lost')) return false
      if (stage !== 'all' && stage !== 'open' && d.stage !== stage) return false
      return matches(query, d.brand, d.contactName, d.contactEmail, d.notes, deliverableSummary(d))
    })
    const key = (d: Deal): string | number =>
      sortKey === 'value' ? dealValue(d)
        : sortKey === 'brand' ? d.brand.toLowerCase()
        : sortKey === 'stage' ? DEAL_STAGES.findIndex((s) => s.id === d.stage)
        : (d[sortKey] as string) || (sortDir === 'asc' ? '9999' : '')
    return sortBy(filtered, key, sortDir)
  }, [state.deals, query, stage, sortKey, sortDir])

  const totals = useMemo(() => {
    const open = state.deals.filter((d) => d.stage !== 'closed' && d.stage !== 'lost')
    return {
      open: open.length,
      pipeline: open.reduce((s, d) => s + dealValue(d), 0),
      won: state.deals.filter((d) => d.stage === 'closed').reduce((s, d) => s + dealValue(d), 0),
      dueFollowUps: dueFollowUps(state).length,
    }
  }, [state])

  const open = (d: Deal, fresh = false) => {
    setEditing(structuredClone(d))
    setIsNew(fresh)
  }

  const save = () => {
    if (!editing) return
    put('deals', { ...editing, brand: editing.brand.trim() || 'Untitled brand' })
    toast(isNew ? 'Deal added' : 'Deal updated')
    setEditing(null)
  }

  const del = async (d: Deal) => {
    const ok = await confirm({
      title: `Delete the ${d.brand || 'untitled'} deal?`,
      message: 'The record and its notes go away. Any invoice you already raised stays.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    remove('deals', d.id)
    setEditing(null)
    toast('Deal deleted', 'info')
  }

  const raiseInvoice = (d: Deal) => navigate(`/invoices/new?deal=${d.id}`)

  const columns = [
    { header: 'Brand', value: (d: Deal) => d.brand, width: 24 },
    { header: 'Contact', value: (d: Deal) => d.contactName },
    { header: 'Email', value: (d: Deal) => d.contactEmail, width: 26 },
    { header: 'Phone', value: (d: Deal) => d.contactPhone },
    { header: 'Date Contacted', value: (d: Deal) => d.dateContacted },
    { header: 'Deliverables', value: (d: Deal) => deliverableSummary(d), width: 32 },
    { header: 'Ad Rights (months)', value: (d: Deal) => d.adRightsMonths },
    { header: `Quoted (${settings.currency})`, value: (d: Deal) => d.quotedAmount },
    { header: `Brand Offered (${settings.currency})`, value: (d: Deal) => d.statedAmount },
    { header: `Agreed (${settings.currency})`, value: (d: Deal) => d.finalAmount },
    { header: 'Stage', value: (d: Deal) => stageMeta(d.stage).label },
    { header: 'Follow Up', value: (d: Deal) => d.followUpDate },
    { header: 'Notes', value: (d: Deal) => d.notes, width: 46 },
  ]

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'brand' ? 'asc' : 'desc') }
  }

  return (
    <>
      <PageHeader
        title="Outreach & Follow-ups"
        subtitle="Every brand conversation, past and live, in one place."
        actions={
          <>
            <ExportMenu
              disabled={!state.deals.length}
              onXLSX={() => exportXLSX(visible, columns, 'outreach', 'Deals')}
              onCSV={() => exportCSV(visible, columns, 'outreach')}
            />
            <Button variant="primary" onClick={() => open(blank(), true)}>
              <Plus size={15} /> Add deal
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: 'Open deals', value: String(totals.open) },
            { label: 'Pipeline value', value: fmtMoney(totals.pipeline, sym) },
            { label: 'Won to date', value: fmtMoney(totals.won, sym) },
            { label: 'Follow-ups due', value: String(totals.dueFollowUps), tone: totals.dueFollowUps ? 'bad' : undefined },
          ].map((s) => (
            <Card key={s.label} className="p-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{s.label}</p>
              <p className={cx('mt-1 text-[17px] font-bold tracking-[-0.02em]', s.tone === 'bad' ? 'text-danger' : 'text-ink')}>
                {s.value}
              </p>
            </Card>
          ))}
        </div>

        {!!awaiting.length && (
          <Card className="flex flex-wrap items-center gap-3 border-accent/40 bg-accent-soft p-3.5">
            <Receipt size={17} className="shrink-0 text-accent" />
            <p className="min-w-0 flex-1 text-[13px] font-medium text-ink">
              <strong className="font-bold">{awaiting.length} won {awaiting.length === 1 ? 'deal has' : 'deals have'} no invoice yet.</strong>{' '}
              <span className="text-muted">That is {fmtMoney(awaiting.reduce((s, d) => s + dealValue(d), 0), sym)} you have not billed.</span>
            </p>
            <Button size="sm" variant="primary" onClick={() => raiseInvoice(awaiting[0])}>
              Invoice {awaiting[0].brand}
            </Button>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search brand, contact, notes…" className="sm:max-w-xs" />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {([
              { id: 'open' as const, label: 'Open' },
              { id: 'all' as const, label: 'All' },
              ...DEAL_STAGES.map((s) => ({ id: s.id, label: s.label })),
            ]).map((o) => (
              <button
                key={o.id}
                onClick={() => setStage(o.id)}
                className={cx(
                  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 active:scale-95',
                  stage === o.id ? 'border-accent bg-accent text-accent-ink shadow-soft'
                    : 'border-line bg-surface text-muted hover:border-faint hover:text-ink',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {!visible.length ? (
        <EmptyState
          icon={<Users size={22} />}
          title={state.deals.length ? 'No deals match' : 'No brand conversations yet'}
          description={
            state.deals.length
              ? 'Adjust the filter or search to see more.'
              : 'Log the next brand that lands in your inbox — who they are, what they want, and what you quoted.'
          }
          action={<Button variant="primary" onClick={() => open(blank(), true)}><Plus size={15} /> Add deal</Button>}
        />
      ) : isMobile ? (
        <List className="space-y-2.5">
          {visible.map((d) => (
            <Item key={d.id}>
              <DealCard deal={d} sym={sym} onOpen={() => open(d)} onInvoice={() => raiseInvoice(d)} />
            </Item>
          ))}
        </List>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-elevated/50 text-[11px] uppercase tracking-[0.05em] text-muted">
                  {([
                    ['brand', 'Brand / Contact'],
                    ['dateContacted', 'Contacted'],
                    [null, 'Deliverables'],
                    [null, 'Rights'],
                    ['value', 'Quoted / Offered'],
                    ['stage', 'Stage'],
                    ['followUpDate', 'Follow-up'],
                    [null, ''],
                  ] as [SortKey | null, string][]).map(([k, label], i) => (
                    <th key={i} className={cx('whitespace-nowrap px-3 py-2.5 font-semibold', i === 0 && 'pl-4')}>
                      {k ? (
                        <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
                          {label}
                          <ArrowUpDown size={11} className={sortKey === k ? 'text-accent' : 'opacity-35'} />
                        </button>
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => {
                  const meta = stageMeta(d.stage)
                  const overdueFollowUp = d.followUpDate && d.followUpDate <= today() && d.stage !== 'closed' && d.stage !== 'lost'
                  return (
                    <tr
                      key={d.id}
                      onClick={() => open(d)}
                      className="row-hover cursor-pointer border-b border-line last:border-0"
                    >
                      <td className="max-w-[220px] px-3 py-3 pl-4">
                        <p className="truncate font-semibold text-ink">{d.brand || 'Untitled'}</p>
                        <p className="truncate text-[12px] text-muted">{d.contactName || d.contactEmail || '—'}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{fmtDate(d.dateContacted)}</td>
                      <td className="max-w-[220px] px-3 py-3">
                        <p className="truncate text-ink">{deliverableSummary(d)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">
                        {d.adRightsMonths ? `${d.adRightsMonths} mo` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <p className="font-semibold text-ink">{d.finalAmount ? fmtMoney(d.finalAmount, sym) : fmtMoney(d.quotedAmount, sym)}</p>
                        <p className="text-[12px] text-muted">
                          {d.finalAmount ? 'agreed' : d.statedAmount ? `they said ${fmtMoney(d.statedAmount, sym)}` : 'no offer yet'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={meta.tone === 'good' ? 'good' : meta.tone === 'bad' ? 'bad' : meta.tone === 'warn' ? 'warn' : meta.tone === 'info' ? 'info' : 'neutral'}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {d.followUpDate ? (
                          <span className={cx('inline-flex items-center gap-1.5 text-[12.5px]', overdueFollowUp ? 'font-semibold text-danger' : 'text-muted')}>
                            {overdueFollowUp && <Bell size={12} />}
                            {relativeDays(d.followUpDate)}
                          </span>
                        ) : <span className="text-faint">—</span>}
                      </td>
                      <td className="px-3 py-3 pr-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(d.stage === 'closed' || d.stage === 'delivered') && (
                            <IconButton label="Create invoice" onClick={(e) => { e.stopPropagation(); raiseInvoice(d) }}>
                              <Receipt size={15} />
                            </IconButton>
                          )}
                          <ChevronRight size={15} className="text-faint" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DealModal
        deal={editing}
        isNew={isNew}
        sym={sym}
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={del}
        onInvoice={raiseInvoice}
        hasInvoice={!!editing && state.invoices.some((i) => i.dealId === editing.id)}
        onOpenInvoice={() => {
          const inv = state.invoices.find((i) => i.dealId === editing?.id)
          if (inv) navigate(`/invoices/${inv.id}`)
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------- mobile card */
function DealCard({ deal: d, sym, onOpen, onInvoice }: { deal: Deal; sym: string; onOpen: () => void; onInvoice: () => void }) {
  const meta = stageMeta(d.stage)
  const overdueFollowUp = d.followUpDate && d.followUpDate <= today() && d.stage !== 'closed' && d.stage !== 'lost'
  return (
    <Card onClick={onOpen} className="cursor-pointer p-4 transition-all duration-200 active:scale-[.99]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold text-ink">{d.brand || 'Untitled'}</p>
          <p className="truncate text-[12.5px] text-muted">{d.contactName || d.contactEmail || 'No contact'}</p>
        </div>
        <Badge tone={meta.tone === 'good' ? 'good' : meta.tone === 'bad' ? 'bad' : meta.tone === 'warn' ? 'warn' : meta.tone === 'info' ? 'info' : 'neutral'}>
          {meta.label}
        </Badge>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[12.5px] text-muted">{deliverableSummary(d)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-2.5 text-[12px]">
        <span className="font-bold text-ink">{fmtMoney(d.finalAmount || d.quotedAmount || d.statedAmount, sym)}</span>
        {!!d.adRightsMonths && <span className="text-muted">{d.adRightsMonths} mo rights</span>}
        <span className="text-muted">{fmtDate(d.dateContacted)}</span>
        {d.followUpDate && (
          <span className={cx('ml-auto inline-flex items-center gap-1', overdueFollowUp ? 'font-semibold text-danger' : 'text-muted')}>
            <CalendarClock size={12} /> {relativeDays(d.followUpDate)}
          </span>
        )}
      </div>

      {(d.stage === 'closed' || d.stage === 'delivered') && (
        <Button size="sm" variant="soft" block className="mt-3" onClick={(e) => { e.stopPropagation(); onInvoice() }}>
          <Receipt size={13} /> Create invoice
        </Button>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ modal */
function DealModal({
  deal, isNew, sym, onChange, onClose, onSave, onDelete, onInvoice, hasInvoice, onOpenInvoice,
}: {
  deal: Deal | null
  isNew: boolean
  sym: string
  onChange: (d: Deal) => void
  onClose: () => void
  onSave: () => void
  onDelete: (d: Deal) => void
  onInvoice: (d: Deal) => void
  hasInvoice: boolean
  onOpenInvoice: () => void
}) {
  if (!deal) return null
  const set = <K extends keyof Deal>(k: K, v: Deal[K]) => onChange({ ...deal, [k]: v })

  const setDeliverable = (id: string, patchObj: Partial<Deliverable>) =>
    set('deliverables', deal.deliverables.map((x) => (x.id === id ? { ...x, ...patchObj } : x)))

  const gap = deal.quotedAmount && deal.statedAmount ? deal.quotedAmount - deal.statedAmount : 0

  return (
    <Modal
      open={!!deal}
      onClose={onClose}
      size="lg"
      title={isNew ? 'New deal' : deal.brand || 'Deal'}
      subtitle={isNew ? 'Log the enquiry while it is fresh' : `First contact ${fmtDate(deal.dateContacted)}`}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" onClick={() => onDelete(deal)} className="mr-auto text-danger">
              <Trash2 size={14} /> Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSave}>{isNew ? 'Add deal' : 'Save changes'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        {(deal.stage === 'closed' || deal.stage === 'delivered') && !isNew && (
          <Card className={cx('flex flex-wrap items-center gap-3 p-3.5', hasInvoice ? '' : 'border-accent/40 bg-accent-soft')}>
            <Receipt size={16} className="shrink-0 text-accent" />
            <p className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">
              {hasInvoice ? 'An invoice is linked to this deal.' : 'This deal is won — the money still needs an invoice.'}
            </p>
            {hasInvoice ? (
              <Button size="sm" onClick={onOpenInvoice}><FileText size={13} /> Open invoice</Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => onInvoice(deal)}>Create invoice</Button>
            )}
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand">
            <Input autoFocus value={deal.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Lumen Skincare" />
          </Field>
          <Field label="Date they contacted you">
            <Input type="date" value={deal.dateContacted} onChange={(e) => set('dateContacted', e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact name">
            <Input value={deal.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Priya Nair" />
          </Field>
          <Field label="Email">
            <Input type="email" value={deal.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="priya@brand.com" />
          </Field>
          <Field label="Phone">
            <Input value={deal.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="+91…" />
          </Field>
        </div>

        {/* deliverables */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Deliverables</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set('deliverables', [...deal.deliverables, { id: uid('dl'), type: DELIVERABLE_TYPES[0], qty: 1 }])}
            >
              <Plus size={13} /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {deal.deliverables.map((dl) => (
              <div key={dl.id} className="flex gap-2">
                <Select value={dl.type} onChange={(e) => setDeliverable(dl.id, { type: e.target.value })} className="flex-1">
                  {[...DELIVERABLE_TYPES, ...(DELIVERABLE_TYPES.includes(dl.type as typeof DELIVERABLE_TYPES[number]) ? [] : [dl.type])].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={dl.qty}
                  onChange={(e) => setDeliverable(dl.id, { qty: Math.max(1, parseNum(e.target.value)) })}
                  className="w-20 shrink-0 text-center"
                  aria-label="Quantity"
                />
                <IconButton
                  label="Remove deliverable"
                  tone="danger"
                  onClick={() => set('deliverables', deal.deliverables.filter((x) => x.id !== dl.id))}
                >
                  <X size={15} />
                </IconButton>
              </div>
            ))}
            {!deal.deliverables.length && (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-faint">
                Nothing agreed yet.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad rights (months)" hint="0 = organic posting only, no paid usage">
            <Input
              type="number" min={0}
              value={deal.adRightsMonths}
              onChange={(e) => set('adRightsMonths', Math.max(0, parseNum(e.target.value)))}
            />
          </Field>
          <Field label="Deal stage">
            <Select value={deal.stage} onChange={(e) => set('stage', e.target.value as DealStage)}>
              {DEAL_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`You quoted (${sym})`}>
            <Input type="number" min={0} value={deal.quotedAmount || ''} placeholder="0"
              onChange={(e) => set('quotedAmount', parseNum(e.target.value))} />
          </Field>
          <Field label={`They offered (${sym})`}>
            <Input type="number" min={0} value={deal.statedAmount || ''} placeholder="0"
              onChange={(e) => set('statedAmount', parseNum(e.target.value))} />
          </Field>
          <Field label={`Agreed (${sym})`} hint="Drives the invoice">
            <Input type="number" min={0} value={deal.finalAmount || ''} placeholder="0"
              onChange={(e) => set('finalAmount', parseNum(e.target.value))} />
          </Field>
        </div>

        {!!gap && !deal.finalAmount && (
          <p className="rounded-xl bg-warning/20 px-3 py-2 text-[12.5px] font-medium text-warning">
            Gap of {fmtMoney(Math.abs(gap), sym)} between your quote and their offer
            {gap > 0 ? ' — decide your walk-away number before replying.' : ' — they came in above your quote.'}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next follow-up" hint={deal.followUpDate ? relativeDays(deal.followUpDate) : 'Leave blank if the ball is in your court'}>
            <div className="flex gap-2">
              <Input type="date" value={deal.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} className="flex-1" />
              {!deal.followUpDate && (
                <Button
                  size="md"
                  onClick={() => {
                    const dt = new Date()
                    dt.setDate(dt.getDate() + 3)
                    set('followUpDate', dt.toISOString().slice(0, 10))
                  }}
                >
                  +3d
                </Button>
              )}
            </div>
          </Field>
          <div className="flex items-end gap-2">
            {deal.contactEmail && (
              <Button block onClick={() => window.open(`mailto:${deal.contactEmail}`)}><Mail size={14} /> Email</Button>
            )}
            {deal.contactPhone && (
              <Button block onClick={() => window.open(`tel:${deal.contactPhone}`)}><Phone size={14} /> Call</Button>
            )}
          </div>
        </div>

        <Field label="Notes">
          <Textarea
            rows={5}
            value={deal.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Brief details, sticking points, who signs off, what you promised…"
          />
        </Field>

        {!isNew && (
          <p className="text-[11.5px] text-faint">
            Added {fmtDate(deal.createdAt.slice(0, 10))}
            {deal.updatedAt !== deal.createdAt && ` · updated ${Math.abs(daysBetween(deal.updatedAt.slice(0, 10), today()))} days ago`}
          </p>
        )}
      </div>
    </Modal>
  )
}
