import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, CheckCircle2, Download, Eye, Link2, Palette,
  Plus, RotateCcw, Trash2, X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { GstType, Invoice, InvoiceItem, InvoiceTemplate, Party } from '../lib/types'
import {
  addDays, cx, deliverableSummary, fmtDate, fmtMoney, invoiceTotals, parseNum, today, uid,
} from '../lib/utils'
import { downloadInvoicePDF, invoicePreviewURL } from '../lib/pdf/invoice'
import {
  Badge, Button, Card, Field, IconButton, Input, Modal, Select, Textarea,
  useConfirm, useDebounced, useMediaQuery, useToast,
} from '../components/ui'

const THEME_SWATCHES = [
  '#4f46e5', '#0f766e', '#b45309', '#be123c', '#1d4ed8',
  '#7c3aed', '#0e7490', '#15803d', '#c2410c', '#1f2937',
]

const TEMPLATE_INFO: { id: InvoiceTemplate; label: string; blurb: string }[] = [
  { id: 'modern', label: 'Modern', blurb: 'Colour band header, zebra rows' },
  { id: 'classic', label: 'Classic', blurb: 'Centred serif, ruled table' },
  { id: 'minimal', label: 'Minimal', blurb: 'Whitespace, hairline rules' },
]

const emptyItem = (): InvoiceItem => ({ id: uid('it'), description: '', qty: 1, rate: 0 })

export default function InvoiceEditor() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state, settings, put, patch, remove, update, setSettings } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  // The side-by-side preview needs >=1024px; below that offer it on demand
  // instead, so tablets are not left without a way to see the PDF.
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const sym = settings.currencySymbol

  const [createdId, setCreatedId] = useState<string | null>(null)
  const creating = useRef(false)
  const assignedNumber = useRef<string | null>(null)

  /* ---------------------------------------------------- create-on-open */
  useEffect(() => {
    if (id !== 'new' || creating.current) return
    creating.current = true

    const dealId = params.get('deal') || undefined
    const deal = dealId ? state.deals.find((d) => d.id === dealId) : undefined
    const number = `${settings.invoicePrefix}${String(settings.nextInvoiceNumber).padStart(3, '0')}`
    const newId = uid('i')

    const inv: Invoice = {
      id: newId,
      number,
      date: today(),
      dueDate: addDays(today(), settings.defaultDueDays),
      status: 'draft',
      from: { ...settings.business },
      to: {
        name: deal?.brand ?? '',
        address: '',
        gstin: '',
        email: deal?.contactEmail ?? '',
        phone: deal?.contactPhone ?? '',
      },
      items: deal
        ? [{ id: uid('it'), description: deliverableSummary(deal), qty: 1, rate: deal.finalAmount || deal.statedAmount || deal.quotedAmount || 0 }]
        : [emptyItem()],
      gstType: settings.defaultGstType,
      gstRate: settings.defaultGstRate,
      discount: 0,
      notes: '',
      terms: settings.defaultTerms,
      bankDetails: settings.defaultBankDetails,
      template: settings.defaultTemplate,
      themeColor: settings.defaultThemeColor,
      currency: settings.currency,
      dealId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    put('invoices', inv)
    assignedNumber.current = number
    setSettings({ nextInvoiceNumber: settings.nextInvoiceNumber + 1 })
    setCreatedId(newId)
    navigate(`/invoices/${newId}`, { replace: true })
  }, [id, params, state.deals, settings, put, setSettings, navigate])

  const invoice = state.invoices.find((i) => i.id === (id === 'new' ? createdId : id))

  /* ------------------------------------- discard an untouched new draft */
  const touchedRef = useRef(false)
  useEffect(() => {
    return () => {
      if (!createdId || touchedRef.current) return
      // The user opened a blank invoice and walked away: drop it, and hand the
      // reserved number back so the sequence has no holes in it.
      update((d) => {
        const i = d.invoices.findIndex((x) => x.id === createdId)
        if (i >= 0) d.invoices.splice(i, 1)
        const last = `${d.settings.invoicePrefix}${String(d.settings.nextInvoiceNumber - 1).padStart(3, '0')}`
        if (assignedNumber.current === last) d.settings.nextInvoiceNumber -= 1
      })
    }
  }, [createdId, update])

  const set = useCallback(
    (changes: Partial<Invoice>) => {
      if (!invoice) return
      touchedRef.current = true
      patch('invoices', invoice.id, changes)
    },
    [invoice, patch],
  )

  const setParty = (which: 'from' | 'to', changes: Partial<Party>) =>
    invoice && set({ [which]: { ...invoice[which], ...changes } } as Partial<Invoice>)

  const setItem = (itemId: string, changes: Partial<InvoiceItem>) =>
    invoice && set({ items: invoice.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)) })

  const totals = useMemo(() => (invoice ? invoiceTotals(invoice) : null), [invoice])

  /* ------------------------------------------------------- pdf preview */
  const debounced = useDebounced(invoice, 500)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (!debounced || isMobile) return
    let url: string | null = null
    let cancelled = false
    void (async () => {
      try {
        const next = await invoicePreviewURL(debounced, sym)
        if (cancelled) {
          URL.revokeObjectURL(next)
          return
        }
        url = next
        setPreviewUrl(next)
      } catch {
        if (!cancelled) setPreviewUrl(null)
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [debounced, sym, isMobile])

  const openMobilePreview = async () => {
    if (!invoice) return
    try {
      // Open the tab first: browsers block window.open after an await.
      const tab = window.open('', '_blank')
      const url = await invoicePreviewURL(invoice, sym)
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
    } catch {
      toast('Could not render the preview', 'bad')
    }
  }

  if (!invoice) {
    return (
      <div className="py-24 text-center">
        <p className="text-[15px] font-semibold text-ink">Invoice not found</p>
        <p className="mt-1 text-[13px] text-muted">It may have been deleted.</p>
        <Button className="mt-5" onClick={() => navigate('/invoices')}><ArrowLeft size={15} /> Back to invoices</Button>
      </div>
    )
  }

  const linkedDeal = invoice.dealId ? state.deals.find((d) => d.id === invoice.dealId) : undefined
  const isPaid = invoice.status === 'paid'

  const del = async () => {
    const ok = await confirm({
      title: `Delete invoice ${invoice.number}?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    touchedRef.current = true
    remove('invoices', invoice.id)
    navigate('/invoices')
  }

  return (
    <>
      {/* -------------------------------------------------------- header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <IconButton label="Back" onClick={() => navigate('/invoices')} className="shrink-0">
          <ArrowLeft size={18} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[20px] font-bold tracking-[-0.02em] text-ink sm:text-[24px]">{invoice.number}</h1>
            <Badge tone={isPaid ? 'good' : invoice.status === 'draft' ? 'neutral' : 'info'}>
              {isPaid ? 'Paid' : invoice.status === 'draft' ? 'Draft' : 'Sent'}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {invoice.to.name || 'No client yet'} · {totals ? fmtMoney(totals.total, sym) : ''} · changes save as you type
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isMobile && <Button onClick={() => void openMobilePreview()}><Eye size={15} /> Preview</Button>}
          <Button onClick={() => { void downloadInvoicePDF(invoice, sym); toast('PDF downloaded') }}>
            <Download size={15} /> PDF
          </Button>
          {isPaid ? (
            <Button onClick={() => { set({ status: 'sent', paidDate: undefined }); toast('Reopened', 'info') }}>
              <RotateCcw size={15} /> Reopen
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                set({ status: 'paid', paidDate: today() })
                toast('Marked paid — added to your earnings')
              }}
            >
              <CheckCircle2 size={15} /> Mark paid
            </Button>
          )}
        </div>
      </div>

      {invoice.status === 'draft' && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3.5">
          <p className="min-w-0 flex-1 text-[12.5px] text-muted">
            This is a <strong className="font-semibold text-ink">draft</strong>. It stays out of your outstanding total until you send it.
          </p>
          <Button size="sm" variant="primary" onClick={() => { set({ status: 'sent' }); toast('Marked as sent — now tracked as outstanding') }}>
            Mark as sent
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        {/* ---------------------------------------------------------- form */}
        <div className="space-y-4">
          {linkedDeal && (
            <Card className="flex items-center gap-2.5 p-3">
              <Link2 size={15} className="shrink-0 text-accent" />
              <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                Linked to the <strong className="font-semibold text-ink">{linkedDeal.brand}</strong> deal
              </p>
              <Button size="sm" variant="ghost" onClick={() => navigate('/outreach')}>Open</Button>
            </Card>
          )}

          <Section title="Invoice details">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Invoice number" hint="Auto-set, edit if you need to">
                <Input value={invoice.number} onChange={(e) => set({ number: e.target.value })} />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={invoice.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Due date" hint={`${settings.defaultDueDays}-day default`}>
                <Input type="date" value={invoice.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section
            title="From (you)"
            action={
              <Button size="sm" variant="ghost" onClick={() => set({ from: { ...settings.business } })}>
                Use saved profile
              </Button>
            }
          >
            <PartyFields party={invoice.from} onChange={(c) => setParty('from', c)} namePlaceholder="Your studio name" />
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => { setSettings({ business: { ...invoice.from } }); toast('Saved as your default business profile') }}
            >
              <Check size={13} /> Save these as my defaults
            </Button>
          </Section>

          <Section title="Bill to (client)">
            <PartyFields party={invoice.to} onChange={(c) => setParty('to', c)} namePlaceholder="Brand name" />
          </Section>

          {/* items */}
          <Section
            title="Items"
            action={
              <Button size="sm" variant="ghost" onClick={() => set({ items: [...invoice.items, emptyItem()] })}>
                <Plus size={13} /> Add line
              </Button>
            }
          >
            <div className="space-y-2.5">
              <div className="hidden grid-cols-[1fr_72px_110px_110px_32px] gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint sm:grid">
                <span>Description</span><span className="text-center">Qty</span>
                <span className="text-right">Rate</span><span className="text-right">Amount</span><span />
              </div>
              {invoice.items.map((it) => (
                <div key={it.id} className="grid grid-cols-[1fr_32px] gap-2 sm:grid-cols-[1fr_72px_110px_110px_32px]">
                  <Input
                    value={it.description}
                    onChange={(e) => setItem(it.id, { description: e.target.value })}
                    placeholder="1 × Collab reel with 30-day usage"
                    className="col-span-2 sm:col-span-1"
                  />
                  <Input
                    type="number" min={0} value={it.qty}
                    onChange={(e) => setItem(it.id, { qty: parseNum(e.target.value) })}
                    className="text-center" aria-label="Quantity"
                  />
                  <Input
                    type="number" min={0} value={it.rate || ''} placeholder="0"
                    onChange={(e) => setItem(it.id, { rate: parseNum(e.target.value) })}
                    className="text-right" aria-label="Rate"
                  />
                  <div className="flex h-10 items-center justify-end rounded-xl bg-elevated px-3 text-[13px] font-semibold text-ink">
                    {fmtMoney((it.qty || 0) * (it.rate || 0), sym)}
                  </div>
                  <IconButton
                    label="Remove line" tone="danger" className="self-center"
                    onClick={() => set({ items: invoice.items.filter((x) => x.id !== it.id) })}
                  >
                    <X size={15} />
                  </IconButton>
                </div>
              ))}
              {!invoice.items.length && (
                <button
                  onClick={() => set({ items: [emptyItem()] })}
                  className="w-full rounded-xl border border-dashed border-line py-5 text-[12.5px] text-faint hover:border-accent hover:text-accent"
                >
                  Add your first line item
                </button>
              )}
            </div>
          </Section>

          {/* tax + totals */}
          <Section title="Tax & totals">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="GST treatment">
                <Select value={invoice.gstType} onChange={(e) => set({ gstType: e.target.value as GstType })}>
                  <option value="none">No GST</option>
                  <option value="cgst_sgst">CGST + SGST (same state)</option>
                  <option value="igst">IGST (inter-state)</option>
                </Select>
              </Field>
              <Field label="GST rate (%)">
                <Input
                  type="number" min={0} max={100} value={invoice.gstRate}
                  disabled={invoice.gstType === 'none'}
                  onChange={(e) => set({ gstRate: parseNum(e.target.value) })}
                />
              </Field>
              <Field label={`Discount (${sym})`}>
                <Input type="number" min={0} value={invoice.discount || ''} placeholder="0"
                  onChange={(e) => set({ discount: parseNum(e.target.value) })} />
              </Field>
            </div>

            {totals && (
              <div className="mt-4 space-y-1.5 rounded-xl bg-elevated p-3.5 text-[13px]">
                <Row label="Subtotal" value={fmtMoney(totals.subtotal, sym, 2)} />
                {!!totals.discount && <Row label="Discount" value={`- ${fmtMoney(totals.discount, sym, 2)}`} />}
                {invoice.gstType === 'cgst_sgst' && (
                  <>
                    <Row label={`CGST @ ${totals.taxRate / 2}%`} value={fmtMoney(totals.cgst, sym, 2)} />
                    <Row label={`SGST @ ${totals.taxRate / 2}%`} value={fmtMoney(totals.sgst, sym, 2)} />
                  </>
                )}
                {invoice.gstType === 'igst' && <Row label={`IGST @ ${totals.taxRate}%`} value={fmtMoney(totals.igst, sym, 2)} />}
                <div className="flex items-center justify-between border-t border-line pt-2 text-[15px] font-bold text-ink">
                  <span>Total due</span>
                  <span>{fmtMoney(totals.total, sym, 2)}</span>
                </div>
              </div>
            )}
          </Section>

          {/* design */}
          <Section title="Design">
            <div className="space-y-4">
              <div>
                <span className="label">Template</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TEMPLATE_INFO.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => set({ template: t.id })}
                      className={cx(
                        'rounded-xl border p-3 text-left transition-all duration-200 active:scale-[.98]',
                        invoice.template === t.id
                          ? 'border-accent bg-accent-soft shadow-soft'
                          : 'border-line bg-surface hover:border-faint',
                      )}
                    >
                      <TemplateThumb template={t.id} color={invoice.themeColor} active={invoice.template === t.id} />
                      <p className="mt-2 text-[13px] font-bold text-ink">{t.label}</p>
                      <p className="text-[11.5px] leading-snug text-muted">{t.blurb}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Theme colour</span>
                <div className="flex flex-wrap items-center gap-2">
                  {THEME_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => set({ themeColor: c })}
                      aria-label={`Theme colour ${c}`}
                      className={cx(
                        'h-8 w-8 rounded-full border-2 transition-transform duration-200 active:scale-90',
                        invoice.themeColor.toLowerCase() === c ? 'border-ink scale-110' : 'border-line',
                      )}
                      style={{ background: c }}
                    />
                  ))}
                  <label className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-semibold text-muted hover:text-ink">
                    <Palette size={13} />
                    Custom
                    <input
                      type="color"
                      value={invoice.themeColor}
                      onChange={(e) => set({ themeColor: e.target.value })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                  checked={settings.defaultTemplate === invoice.template && settings.defaultThemeColor === invoice.themeColor}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSettings({ defaultTemplate: invoice.template, defaultThemeColor: invoice.themeColor })
                      toast('Set as your default invoice style')
                    }
                  }}
                />
                <span className="text-[13px] text-ink">Make this template and colour my default</span>
              </label>
            </div>
          </Section>

          <Section title="Notes & terms">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment details" hint="Bank / UPI — shown on the invoice">
                <Textarea rows={4} value={invoice.bankDetails} onChange={(e) => set({ bankDetails: e.target.value })}
                  placeholder={'Account name\nAccount no.\nIFSC\nUPI'} />
              </Field>
              <Field label="Terms">
                <Textarea rows={4} value={invoice.terms} onChange={(e) => set({ terms: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes to client" className="mt-4">
              <Textarea rows={3} value={invoice.notes} onChange={(e) => set({ notes: e.target.value })}
                placeholder="Thanks for the collaboration…" />
            </Field>
          </Section>

          <div className="flex flex-wrap items-center gap-2 pb-2">
            <Button variant="ghost" className="text-danger" onClick={del}><Trash2 size={14} /> Delete invoice</Button>
            <span className="ml-auto text-[11.5px] text-faint">
              {isPaid && invoice.paidDate ? `Paid on ${fmtDate(invoice.paidDate)}` : `Created ${fmtDate(invoice.createdAt.slice(0, 10))}`}
            </span>
          </div>
        </div>

        {/* -------------------------------------------------------- preview */}
        {!isMobile && (
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">Live preview</p>
                <Button size="sm" variant="ghost" onClick={() => setShowPreview(true)}><Eye size={13} /> Full size</Button>
              </div>
              <Card className="overflow-hidden p-0">
                {previewUrl ? (
                  <iframe
                    key={previewUrl}
                    src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                    title="Invoice preview"
                    className="h-[min(74vh,860px)] w-full border-0 bg-elevated"
                  />
                ) : (
                  <div className="grid h-[420px] place-items-center text-[13px] text-faint">Rendering…</div>
                )}
              </Card>
              <p className="mt-2 text-center text-[11.5px] text-faint">This is the real PDF, not a mockup.</p>
            </div>
          </div>
        )}
      </div>

      <Modal open={showPreview} onClose={() => setShowPreview(false)} size="xl" title={`Preview · ${invoice.number}`}>
        {previewUrl && (
          <iframe src={previewUrl} title="Invoice full preview" className="h-[72vh] w-full rounded-xl border border-line bg-elevated" />
        )}
      </Modal>
    </>
  )
}

/* ----------------------------------------------------------------- pieces */
const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <Card className="p-4 sm:p-5">
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">{title}</h2>
      {action}
    </div>
    {children}
  </Card>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-muted">
    <span>{label}</span>
    <span className="font-medium text-ink">{value}</span>
  </div>
)

const PartyFields = ({ party, onChange, namePlaceholder }: {
  party: Party; onChange: (c: Partial<Party>) => void; namePlaceholder: string
}) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name">
        <Input value={party.name} onChange={(e) => onChange({ name: e.target.value })} placeholder={namePlaceholder} />
      </Field>
      <Field label="GSTIN" hint="Optional">
        <Input value={party.gstin} onChange={(e) => onChange({ gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" />
      </Field>
    </div>
    <Field label="Address">
      <Textarea rows={2} value={party.address} onChange={(e) => onChange({ address: e.target.value })} placeholder={'Street\nCity, State PIN'} />
    </Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Email">
        <Input type="email" value={party.email} onChange={(e) => onChange({ email: e.target.value })} />
      </Field>
      <Field label="Phone">
        <Input value={party.phone} onChange={(e) => onChange({ phone: e.target.value })} />
      </Field>
    </div>
  </div>
)

/** Tiny abstract render of each layout so the choice is visual, not verbal. */
const TemplateThumb = ({ template, color, active }: { template: InvoiceTemplate; color: string; active: boolean }) => (
  <div className={cx('h-16 w-full overflow-hidden rounded-lg border bg-white', active ? 'border-accent' : 'border-line')}>
    {template === 'modern' && (
      <div className="h-full w-full">
        <div className="h-[30%] w-full" style={{ background: color }} />
        <div className="space-y-1 p-1.5">
          <div className="h-1 w-2/3 rounded-full bg-neutral-200" />
          <div className="h-1 w-1/2 rounded-full bg-neutral-200" />
          <div className="h-1.5 w-full rounded-sm" style={{ background: color, opacity: 0.25 }} />
        </div>
      </div>
    )}
    {template === 'classic' && (
      <div className="flex h-full w-full flex-col items-center gap-1 p-1.5">
        <div className="h-1.5 w-1/2 rounded-full bg-neutral-300" />
        <div className="h-0.5 w-full" style={{ background: color }} />
        <div className="mt-1 h-1 w-3/4 rounded-full bg-neutral-200" />
        <div className="h-1 w-3/4 rounded-full bg-neutral-200" />
        <div className="h-1 w-3/4 rounded-full bg-neutral-200" />
      </div>
    )}
    {template === 'minimal' && (
      <div className="flex h-full w-full flex-col gap-1.5 p-2">
        <div className="flex items-center justify-between">
          <div className="h-1 w-1/4 rounded-full bg-neutral-300" />
          <div className="h-1.5 w-1/3 rounded-full" style={{ background: color }} />
        </div>
        <div className="h-px w-full bg-neutral-200" />
        <div className="h-1 w-2/3 rounded-full bg-neutral-200" />
        <div className="mt-auto h-1 w-1/3 self-end rounded-full" style={{ background: color }} />
      </div>
    )}
  </div>
)
