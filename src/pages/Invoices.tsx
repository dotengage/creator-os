import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, ChevronRight, Copy, Download, FileText, MoreVertical,
  Plus, Receipt, RotateCcw, Trash2,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { Invoice } from '../lib/types'
import {
  cx, fmtDate, fmtMoney, invoiceTotals, invoiceView, INVOICE_VIEW_META,
  matches, relativeDays, sortBy, today, uid,
} from '../lib/utils'
import type { InvoiceView } from '../lib/utils'
import { dealsAwaitingInvoice } from '../lib/selectors'
import { exportCSV, exportXLSX } from '../lib/export'
import { downloadInvoicePDF } from '../lib/pdf/invoice'
import {
  Badge, Button, Card, EmptyState, ExportMenu, IconButton, Item, List, Menu, MenuItem,
  PageHeader, SearchInput, useConfirm, useMediaQuery, useToast,
} from '../components/ui'

type Filter = 'all' | 'outstanding' | 'overdue' | 'paid' | 'draft'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
  { id: 'draft', label: 'Drafts' },
  { id: 'all', label: 'All' },
]

export default function Invoices() {
  const { state, settings, put, patch, remove } = useStore()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const sym = settings.currencySymbol

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('outstanding')

  const awaiting = useMemo(() => dealsAwaitingInvoice(state), [state])

  const withTotals = useMemo(
    () => state.invoices.map((i) => ({ inv: i, total: invoiceTotals(i).total, view: invoiceView(i) })),
    [state.invoices],
  )

  const summary = useMemo(() => {
    let outstanding = 0, overdue = 0, paidAll = 0, drafts = 0
    for (const { total, view } of withTotals) {
      if (view === 'draft') drafts++
      else if (view === 'paid') paidAll += total
      else { outstanding += total; if (view === 'overdue') overdue += total }
    }
    return { outstanding, overdue, paidAll, drafts }
  }, [withTotals])

  const visible = useMemo(() => {
    const rows = withTotals.filter(({ inv, view }) => {
      const match = matches(query, inv.number, inv.to.name, inv.to.email, inv.items.map((x) => x.description).join(' '))
      if (!match) return false
      if (filter === 'all') return true
      if (filter === 'paid') return view === 'paid'
      if (filter === 'draft') return view === 'draft'
      if (filter === 'overdue') return view === 'overdue'
      return view === 'pending' || view === 'due-soon' || view === 'overdue'
    })
    return sortBy(rows, ({ inv, view }) => (view === 'paid' ? inv.paidDate || inv.date : inv.dueDate), filter === 'paid' ? 'desc' : 'asc')
  }, [withTotals, query, filter])

  const markPaid = (inv: Invoice, paid: boolean) => {
    patch('invoices', inv.id, paid
      ? { status: 'paid', paidDate: today() }
      : { status: 'sent', paidDate: undefined })
    toast(paid ? `${inv.number} marked paid — it is in your earnings now` : `${inv.number} reopened`, paid ? 'good' : 'info')
  }

  const duplicate = (inv: Invoice) => {
    const copy: Invoice = {
      ...structuredClone(inv),
      id: uid('i'),
      number: `${settings.invoicePrefix}${String(settings.nextInvoiceNumber).padStart(3, '0')}`,
      status: 'draft',
      paidDate: undefined,
      date: today(),
      createdAt: new Date().toISOString(),
    }
    put('invoices', copy)
    navigate(`/invoices/${copy.id}`)
  }

  const del = async (inv: Invoice) => {
    const ok = await confirm({
      title: `Delete invoice ${inv.number}?`,
      message: 'It disappears from the tracker and from your earnings.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    remove('invoices', inv.id)
    toast('Invoice deleted', 'info')
  }

  const columns = [
    { header: 'Invoice No.', value: (r: typeof withTotals[number]) => r.inv.number },
    { header: 'Client', value: (r: typeof withTotals[number]) => r.inv.to.name, width: 26 },
    { header: 'Client Email', value: (r: typeof withTotals[number]) => r.inv.to.email, width: 26 },
    { header: 'Invoice Date', value: (r: typeof withTotals[number]) => r.inv.date },
    { header: 'Due Date', value: (r: typeof withTotals[number]) => r.inv.dueDate },
    { header: 'Items', value: (r: typeof withTotals[number]) => r.inv.items.map((i) => `${i.description} (${i.qty}×${i.rate})`).join('; '), width: 42 },
    { header: `Subtotal (${settings.currency})`, value: (r: typeof withTotals[number]) => invoiceTotals(r.inv).subtotal },
    { header: `Tax (${settings.currency})`, value: (r: typeof withTotals[number]) => invoiceTotals(r.inv).taxAmount },
    { header: `Total (${settings.currency})`, value: (r: typeof withTotals[number]) => r.total },
    { header: 'Status', value: (r: typeof withTotals[number]) => INVOICE_VIEW_META[r.view].label },
    { header: 'Paid On', value: (r: typeof withTotals[number]) => r.inv.paidDate ?? '' },
  ]

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Raise it, send it, and know exactly what is still owed."
        actions={
          <>
            <ExportMenu
              disabled={!state.invoices.length}
              onXLSX={() => exportXLSX(visible, columns, 'invoices', 'Invoices')}
              onCSV={() => exportCSV(visible, columns, 'invoices')}
            />
            <Button variant="primary" onClick={() => navigate('/invoices/new')}>
              <Plus size={15} /> New invoice
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="Outstanding" value={fmtMoney(summary.outstanding, sym)} hint="Sent, not yet collected" />
          <SummaryCard label="Overdue" value={fmtMoney(summary.overdue, sym)} tone={summary.overdue ? 'bad' : undefined} hint="Past the due date" />
          <SummaryCard label="Collected all-time" value={fmtMoney(summary.paidAll, sym)} tone="good" hint="Marked paid" />
          <SummaryCard label="Drafts" value={String(summary.drafts)} hint="Not sent yet" />
        </div>

        {!!awaiting.length && (
          <Card className="flex flex-wrap items-center gap-3 border-accent/40 bg-accent-soft p-3.5">
            <Receipt size={17} className="shrink-0 text-accent" />
            <p className="min-w-0 flex-1 text-[13px] text-ink">
              <strong className="font-bold">{awaiting.length} won {awaiting.length === 1 ? 'deal is' : 'deals are'} waiting to be invoiced.</strong>{' '}
              <span className="text-muted">{awaiting.map((d) => d.brand).slice(0, 3).join(', ')}{awaiting.length > 3 ? '…' : ''}</span>
            </p>
            <div className="flex gap-2">
              {awaiting.slice(0, 1).map((d) => (
                <Button key={d.id} size="sm" variant="primary" onClick={() => navigate(`/invoices/new?deal=${d.id}`)}>
                  Invoice {d.brand}
                </Button>
              ))}
              <Button size="sm" onClick={() => navigate('/outreach')}>View deals</Button>
            </div>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search number, client, line item…" className="sm:max-w-xs" />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cx(
                  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 active:scale-95',
                  filter === f.id ? 'border-accent bg-accent text-accent-ink shadow-soft'
                    : 'border-line bg-surface text-muted hover:border-faint hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {!visible.length ? (
        <EmptyState
          icon={<FileText size={22} />}
          title={state.invoices.length ? 'Nothing here' : 'No invoices yet'}
          description={
            state.invoices.length
              ? 'Try another filter — your other invoices are still there.'
              : 'Build your first invoice in about a minute. Your business details get saved so the next one is faster.'
          }
          action={<Button variant="primary" onClick={() => navigate('/invoices/new')}><Plus size={15} /> New invoice</Button>}
        />
      ) : isMobile ? (
        <List className="space-y-2.5">
          {visible.map(({ inv, total, view }) => (
            <Item key={inv.id}>
              <Card onClick={() => navigate(`/invoices/${inv.id}`)} className="cursor-pointer p-4 active:scale-[.99]">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-ink">{inv.to.name || 'No client'}</p>
                    <p className="text-[12px] text-muted">{inv.number} · {fmtDate(inv.date)}</p>
                  </div>
                  <StatusBadge view={view} />
                </div>
                <div className="mt-3 flex items-end justify-between border-t border-line pt-2.5">
                  <div>
                    <p className="text-[19px] font-bold tracking-[-0.02em] text-ink">{fmtMoney(total, sym)}</p>
                    <p className={cx('text-[12px]', view === 'overdue' ? 'font-semibold text-danger' : 'text-muted')}>
                      {view === 'paid' ? `Paid ${fmtDate(inv.paidDate || '')}` : `Due ${relativeDays(inv.dueDate)}`}
                    </p>
                  </div>
                  {view !== 'paid' && view !== 'draft' && (
                    <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); markPaid(inv, true) }}>
                      <CheckCircle2 size={13} /> Mark paid
                    </Button>
                  )}
                </div>
              </Card>
            </Item>
          ))}
        </List>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-elevated/50 text-[11px] uppercase tracking-[0.05em] text-muted">
                  <th className="px-3 py-2.5 pl-4 font-semibold">Invoice</th>
                  <th className="px-3 py-2.5 font-semibold">Client</th>
                  <th className="px-3 py-2.5 font-semibold">Issued</th>
                  <th className="px-3 py-2.5 font-semibold">Due</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 pr-3 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ inv, total, view }) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="row-hover cursor-pointer border-b border-line last:border-0"
                  >
                    <td className="whitespace-nowrap px-3 py-3 pl-4 font-semibold text-ink">{inv.number}</td>
                    <td className="max-w-[240px] px-3 py-3">
                      <p className="truncate text-ink">{inv.to.name || '—'}</p>
                      <p className="truncate text-[12px] text-muted">{inv.items[0]?.description ?? ''}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{fmtDate(inv.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={cx(view === 'overdue' ? 'font-semibold text-danger' : view === 'due-soon' ? 'font-semibold text-warning' : 'text-muted')}>
                        {fmtDate(inv.dueDate)}
                      </span>
                      {view !== 'paid' && view !== 'draft' && (
                        <span className="ml-1.5 text-[11.5px] text-faint">{relativeDays(inv.dueDate)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-ink">{fmtMoney(total, sym)}</td>
                    <td className="px-3 py-3"><StatusBadge view={view} /></td>
                    <td className="px-3 py-3 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {view !== 'paid' && view !== 'draft' && (
                          <IconButton label="Mark as paid" onClick={() => markPaid(inv, true)}>
                            <CheckCircle2 size={15} />
                          </IconButton>
                        )}
                        <Menu
                          trigger={({ onClick, ref }) => (
                            <IconButton ref={ref} label="More actions" onClick={onClick}><MoreVertical size={15} /></IconButton>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem icon={<Download size={14} />} onClick={() => { void downloadInvoicePDF(inv, sym); close() }}>
                                Download PDF
                              </MenuItem>
                              {view === 'paid' ? (
                                <MenuItem icon={<RotateCcw size={14} />} onClick={() => { markPaid(inv, false); close() }}>
                                  Mark unpaid
                                </MenuItem>
                              ) : (
                                <MenuItem icon={<CheckCircle2 size={14} />} onClick={() => { markPaid(inv, true); close() }}>
                                  Mark as paid
                                </MenuItem>
                              )}
                              <MenuItem icon={<Copy size={14} />} onClick={() => { duplicate(inv); close() }}>Duplicate</MenuItem>
                              <MenuItem icon={<Trash2 size={14} />} tone="danger" onClick={() => { del(inv); close() }}>Delete</MenuItem>
                            </>
                          )}
                        </Menu>
                        <ChevronRight size={15} className="text-faint" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- pieces */
const StatusBadge = ({ view }: { view: InvoiceView }) => {
  const meta = INVOICE_VIEW_META[view]
  return (
    <Badge tone={meta.tone === 'good' ? 'good' : meta.tone === 'bad' ? 'bad' : meta.tone === 'warn' ? 'warn' : meta.tone === 'info' ? 'info' : 'neutral'}>
      {view === 'overdue' && <AlertCircle size={11} />}
      {meta.label}
    </Badge>
  )
}

const SummaryCard = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) => (
  <Card className="p-3.5">
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
    <p className={cx('mt-1 text-[18px] font-bold tracking-[-0.02em]',
      tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-positive' : 'text-ink')}>
      {value}
    </p>
    {hint && <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>}
  </Card>
)
