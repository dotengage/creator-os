import { useRef, useState } from 'react'
import {
  AlertTriangle, Database, Download, FileJson, Palette, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { demoState, emptyState, useStore } from '../lib/store'
import type { AppState, GstType, InvoiceTemplate, ThemeName } from '../lib/types'
import { THEMES } from '../lib/types'
import { cx, deliverableSummary, invoiceTotals, parseNum, uniq } from '../lib/utils'
import { exportJSON, exportWorkbook, sheetFrom } from '../lib/export'
import {
  Badge, Button, Card, Field, Input, PageHeader, Select, Textarea,
  useConfirm, useToast,
} from '../components/ui'

const CURRENCIES = [
  { code: 'INR', symbol: '₹' }, { code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' }, { code: 'AUD', symbol: 'A$' }, { code: 'CAD', symbol: 'C$' },
  { code: 'SGD', symbol: 'S$' }, { code: 'AED', symbol: 'AED ' },
]

export default function Settings() {
  const { state, settings, setSettings, setTheme, replaceAll } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const setBusiness = (patch: Partial<typeof settings.business>) =>
    setSettings({ business: { ...settings.business, ...patch } })

  /* ------------------------------------------------------------ backups */
  const exportEverything = async () => {
    const s = state
    await exportWorkbook(
      [
        {
          name: 'Deals',
          aoa: sheetFrom(s.deals, [
            { header: 'Brand', value: (d) => d.brand },
            { header: 'Contact', value: (d) => d.contactName },
            { header: 'Email', value: (d) => d.contactEmail },
            { header: 'Phone', value: (d) => d.contactPhone },
            { header: 'Date Contacted', value: (d) => d.dateContacted },
            { header: 'Deliverables', value: (d) => deliverableSummary(d) },
            { header: 'Ad Rights (months)', value: (d) => d.adRightsMonths },
            { header: 'Quoted', value: (d) => d.quotedAmount },
            { header: 'Brand Offered', value: (d) => d.statedAmount },
            { header: 'Agreed', value: (d) => d.finalAmount },
            { header: 'Stage', value: (d) => d.stage },
            { header: 'Follow Up', value: (d) => d.followUpDate },
            { header: 'Notes', value: (d) => d.notes },
          ]),
        },
        {
          name: 'Invoices',
          aoa: sheetFrom(s.invoices, [
            { header: 'Number', value: (i) => i.number },
            { header: 'Client', value: (i) => i.to.name },
            { header: 'Date', value: (i) => i.date },
            { header: 'Due Date', value: (i) => i.dueDate },
            { header: 'Status', value: (i) => i.status },
            { header: 'Paid On', value: (i) => i.paidDate ?? '' },
            { header: 'Subtotal', value: (i) => invoiceTotals(i).subtotal },
            { header: 'Tax', value: (i) => invoiceTotals(i).taxAmount },
            { header: 'Total', value: (i) => invoiceTotals(i).total },
          ]),
        },
        {
          name: 'Expenses',
          aoa: sheetFrom(s.expenses, [
            { header: 'Date', value: (e) => e.date },
            { header: 'Category', value: (e) => e.category },
            { header: 'Description', value: (e) => e.description },
            { header: 'Amount', value: (e) => e.amount },
            { header: 'Notes', value: (e) => e.notes },
          ]),
        },
        {
          name: 'Other Income',
          aoa: sheetFrom(s.otherIncome, [
            { header: 'Date', value: (i) => i.date },
            { header: 'Source', value: (i) => i.source },
            { header: 'Description', value: (i) => i.description },
            { header: 'Amount', value: (i) => i.amount },
          ]),
        },
        {
          name: 'Content',
          aoa: sheetFrom(s.content, [
            { header: 'Title', value: (c) => c.title },
            { header: 'Stage', value: (c) => c.status },
            { header: 'Platform', value: (c) => c.platform },
            { header: 'Shoot', value: (c) => c.shootDate },
            { header: 'Edit', value: (c) => c.editDate },
            { header: 'Post', value: (c) => c.postDate },
            { header: 'Script', value: (c) => c.script },
            { header: 'Caption', value: (c) => c.caption },
          ]),
        },
        {
          name: 'Ideas',
          aoa: sheetFrom(s.ideas, [
            { header: 'Title', value: (i) => i.title },
            { header: 'Category', value: (i) => i.category },
            { header: 'Notes', value: (i) => i.body },
            { header: 'Created', value: (i) => i.createdAt.slice(0, 10) },
          ]),
        },
        {
          name: 'Templates',
          aoa: sheetFrom(s.templates, [
            { header: 'Title', value: (t) => t.title },
            { header: 'Category', value: (t) => t.category },
            { header: 'Body', value: (t) => t.body },
          ]),
        },
        {
          name: 'Inspiration',
          aoa: sheetFrom(s.inspirations, [
            { header: 'Name', value: (i) => i.name },
            { header: 'Handle', value: (i) => i.handle },
            { header: 'Platform', value: (i) => i.platform },
            { header: 'URL', value: (i) => i.url },
            { header: 'Category', value: (i) => i.category },
            { header: 'Notes', value: (i) => i.notes },
          ]),
        },
        {
          name: 'Goals',
          aoa: sheetFrom(s.goals, [
            { header: 'Title', value: (g) => g.title },
            { header: 'Type', value: (g) => g.kind },
            { header: 'Current', value: (g) => g.currentValue },
            { header: 'Target', value: (g) => g.targetValue },
            { header: 'Deadline', value: (g) => g.deadline },
          ]),
        },
      ],
      'creator-os-full-export',
    )
    toast('Workbook exported')
  }

  const importJSON = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<AppState>
      if (!parsed || typeof parsed !== 'object' || !('settings' in parsed)) {
        throw new Error('not a Creator OS backup')
      }
      const ok = await confirm({
        title: 'Replace everything with this backup?',
        message: 'Your current data will be overwritten. Export a backup first if you are unsure.',
        confirmLabel: 'Restore backup',
        tone: 'danger',
      })
      if (!ok) return
      const base = emptyState()
      replaceAll({ ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings ?? {}) } } as AppState)
      toast('Backup restored')
    } catch {
      toast('That file is not a Creator OS backup', 'bad')
    }
  }

  const loadDemo = async () => {
    const hasData = state.deals.length || state.invoices.length || state.content.length || state.ideas.length
    if (hasData) {
      const ok = await confirm({
        title: 'Load sample data?',
        message: 'This replaces what is currently here. Export a backup first if you want to keep it.',
        confirmLabel: 'Load samples',
        tone: 'danger',
      })
      if (!ok) return
    }
    const seeded = demoState(emptyState())
    // Keep whatever theme they picked — sample data is about content, not looks.
    replaceAll({ ...seeded, settings: { ...seeded.settings, theme: settings.theme } })
    toast('Sample data loaded — poke around, then reset when you are ready')
  }

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Erase everything?',
      message: 'Every deal, invoice, idea and template on this device will be deleted. There is no undo.',
      confirmLabel: 'Erase everything',
      tone: 'danger',
    })
    if (!ok) return
    replaceAll({ ...emptyState(), settings: { ...emptyState().settings, theme: settings.theme } })
    toast('Everything cleared', 'info')
  }

  const counts = [
    ['Deals', state.deals.length], ['Invoices', state.invoices.length],
    ['Content', state.content.length], ['Ideas', state.ideas.length],
    ['Templates', state.templates.length], ['Profiles', state.inspirations.length],
    ['Goals', state.goals.length], ['Expenses', state.expenses.length],
  ] as [string, number][]

  return (
    <>
      <PageHeader title="Settings" subtitle="Set this up once and the rest of the app stops asking." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* -------------------------------------------------------- theme */}
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <SectionTitle icon={<Palette size={15} />} title="Appearance" hint="Everything else recolours to match." />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as ThemeName)}
                className={cx(
                  'rounded-xl border p-3 text-left transition-all duration-200 active:scale-[.97]',
                  settings.theme === t.id ? 'border-accent bg-accent-soft shadow-soft' : 'border-line hover:border-faint',
                )}
              >
                <span className="mb-2 flex h-10 w-full items-end gap-1 overflow-hidden rounded-lg border border-line p-1.5"
                  style={{ background: t.swatch }}>
                  <span className="h-2.5 flex-1 rounded-full" style={{ background: t.ring }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.ring, opacity: 0.4 }} />
                </span>
                <span className="block text-[12.5px] font-bold text-ink">{t.label}</span>
                <span className="block text-[11px] capitalize text-muted">{t.group}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* ------------------------------------------------------ business */}
        <Card className="p-4 sm:p-5">
          <SectionTitle title="Your business" hint="Pre-fills the “from” side of every invoice." />
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" hint="Shown in the sidebar">
                <Input value={settings.creatorName} onChange={(e) => setSettings({ creatorName: e.target.value })}
                  placeholder="Your name or studio" />
              </Field>
              <Field label="Legal / billing name">
                <Input value={settings.business.name} onChange={(e) => setBusiness({ name: e.target.value })}
                  placeholder="Appears on invoices" />
              </Field>
            </div>
            <Field label="Address">
              <Textarea rows={3} value={settings.business.address} onChange={(e) => setBusiness({ address: e.target.value })}
                placeholder={'Street\nCity, State PIN'} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GSTIN" hint="Optional">
                <Input value={settings.business.gstin} onChange={(e) => setBusiness({ gstin: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={settings.business.email} onChange={(e) => setBusiness({ email: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input value={settings.business.phone} onChange={(e) => setBusiness({ phone: e.target.value })} />
              </Field>
              <Field label="Currency">
                <Select
                  value={settings.currency}
                  onChange={(e) => {
                    const c = CURRENCIES.find((x) => x.code === e.target.value)
                    if (c) setSettings({ currency: c.code, currencySymbol: c.symbol })
                  }}
                >
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol.trim()})</option>)}
                </Select>
              </Field>
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------------ invoicing */}
        <Card className="p-4 sm:p-5">
          <SectionTitle title="Invoice defaults" hint="Applied to every new invoice you create." />
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Number prefix">
                <Input value={settings.invoicePrefix} onChange={(e) => setSettings({ invoicePrefix: e.target.value })} />
              </Field>
              <Field label="Next number">
                <Input type="number" min={1} value={settings.nextInvoiceNumber}
                  onChange={(e) => setSettings({ nextInvoiceNumber: Math.max(1, parseNum(e.target.value)) })} />
              </Field>
              <Field label="Due in (days)">
                <Input type="number" min={0} value={settings.defaultDueDays}
                  onChange={(e) => setSettings({ defaultDueDays: Math.max(0, parseNum(e.target.value)) })} />
              </Field>
            </div>

            <p className="rounded-xl bg-elevated px-3 py-2 text-[12.5px] text-muted">
              Next invoice will be{' '}
              <strong className="font-semibold text-ink">
                {settings.invoicePrefix}{String(settings.nextInvoiceNumber).padStart(3, '0')}
              </strong>
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default template">
                <Select value={settings.defaultTemplate} onChange={(e) => setSettings({ defaultTemplate: e.target.value as InvoiceTemplate })}>
                  <option value="modern">Modern</option>
                  <option value="classic">Classic</option>
                  <option value="minimal">Minimal</option>
                </Select>
              </Field>
              <Field label="Default theme colour">
                <div className="flex items-center gap-2">
                  <label className="relative h-10 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line"
                    style={{ background: settings.defaultThemeColor }}>
                    <input type="color" value={settings.defaultThemeColor}
                      onChange={(e) => setSettings({ defaultThemeColor: e.target.value })}
                      className="absolute inset-0 cursor-pointer opacity-0" />
                  </label>
                  <Input value={settings.defaultThemeColor} onChange={(e) => setSettings({ defaultThemeColor: e.target.value })}
                    className="font-mono text-[12.5px]" />
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default GST">
                <Select value={settings.defaultGstType} onChange={(e) => setSettings({ defaultGstType: e.target.value as GstType })}>
                  <option value="none">No GST</option>
                  <option value="cgst_sgst">CGST + SGST</option>
                  <option value="igst">IGST</option>
                </Select>
              </Field>
              <Field label="Default GST rate (%)">
                <Input type="number" min={0} max={100} value={settings.defaultGstRate}
                  onChange={(e) => setSettings({ defaultGstRate: parseNum(e.target.value) })} />
              </Field>
            </div>

            <Field label="Default payment details">
              <Textarea rows={3} value={settings.defaultBankDetails}
                onChange={(e) => setSettings({ defaultBankDetails: e.target.value })}
                placeholder={'Account name\nAccount no.\nIFSC\nUPI id'} />
            </Field>

            <Field label="Default terms">
              <Textarea rows={2} value={settings.defaultTerms} onChange={(e) => setSettings({ defaultTerms: e.target.value })} />
            </Field>
          </div>
        </Card>

        {/* ----------------------------------------------------- categories */}
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <SectionTitle title="Categories" hint="Used across templates, ideas and inspiration." />
          <div className="grid gap-5 sm:grid-cols-3">
            <CategoryEditor
              label="Template categories"
              values={settings.templateCategories}
              onChange={(v) => setSettings({ templateCategories: v })}
            />
            <CategoryEditor
              label="Idea categories"
              values={settings.ideaCategories}
              onChange={(v) => setSettings({ ideaCategories: v })}
            />
            <CategoryEditor
              label="Inspiration categories"
              values={settings.inspirationCategories}
              onChange={(v) => setSettings({ inspirationCategories: v })}
            />
          </div>
        </Card>

        {/* ----------------------------------------------------------- data */}
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <SectionTitle icon={<Database size={15} />} title="Your data"
            hint="Everything lives in this browser on this device. Nothing is uploaded anywhere." />

          <div className="mb-4 flex flex-wrap gap-1.5">
            {counts.map(([label, n]) => (
              <Badge key={label} tone={n ? 'info' : 'neutral'}>{label} {n}</Badge>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void exportEverything()}><Download size={14} /> Export everything (.xlsx)</Button>
            <Button onClick={() => { exportJSON(state, 'creator-os-backup'); toast('Backup saved') }}>
              <FileJson size={14} /> Save backup (.json)
            </Button>
            <Button onClick={() => fileRef.current?.click()}><Upload size={14} /> Restore backup</Button>
            <Button onClick={loadDemo}><Sparkles size={14} /> Load sample data</Button>
            <Button variant="ghost" className="text-danger" onClick={resetAll}><Trash2 size={14} /> Erase everything</Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJSON(f)
              e.target.value = ''
            }}
          />

          <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning/20 px-3 py-2.5 text-[12.5px] text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Because it is stored locally, clearing your browser data wipes it. Save a JSON backup every so often —
              that file restores everything exactly as it was.
            </span>
          </p>
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- pieces */
const SectionTitle = ({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) => (
  <div className="mb-4">
    <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.01em] text-ink">
      {icon && <span className="text-accent">{icon}</span>}
      {title}
    </h2>
    {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
  </div>
)

function CategoryEditor({ label, values, onChange }: {
  label: string; values: string[]; onChange: (v: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange(uniq([...values, v]))
    setDraft('')
  }
  return (
    <div>
      <span className="label">{label}</span>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-elevated px-2.5 py-1 text-[12px] font-medium text-ink">
            {c}
            <button
              onClick={() => onChange(values.filter((x) => x !== c))}
              aria-label={`Remove ${c}`}
              className="text-faint transition-colors hover:text-danger"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {!values.length && <span className="text-[12px] text-faint">None yet</span>}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add category"
        />
        <Button onClick={add} disabled={!draft.trim()}>Add</Button>
      </div>
    </div>
  )
}
