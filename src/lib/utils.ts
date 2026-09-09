import type { ContentStatus, Deal, Goal, Invoice } from './types'

/* --------------------------------------------------------------------- id */
export const uid = (prefix = ''): string =>
  prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ dates */
/** Local-timezone ISO date (yyyy-mm-dd). Never use toISOString() — it shifts days. */
export const toISODate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const today = (): string => toISODate(new Date())

/** Parse yyyy-mm-dd as a *local* date at midnight. */
export const parseISO = (s: string): Date => {
  if (!s) return new Date(NaN)
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export const addDays = (s: string, days: number): string => {
  const d = parseISO(s)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export const addMonths = (s: string, months: number): string => {
  const d = parseISO(s)
  d.setMonth(d.getMonth() + months)
  return toISODate(d)
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)

export const isValidDate = (s: string) => !!s && !Number.isNaN(parseISO(s).getTime())

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const fmtDate = (s: string): string => {
  if (!isValidDate(s)) return '—'
  const d = parseISO(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const fmtDateShort = (s: string): string => {
  if (!isValidDate(s)) return '—'
  const d = parseISO(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const monthLabel = (year: number, month: number) => `${MONTHS_LONG[month]} ${year}`
export const monthShort = (month: number) => MONTHS[month]

/** "in 3 days" / "5 days ago" / "today" */
export const relativeDays = (iso: string, from = today()): string => {
  if (!isValidDate(iso)) return '—'
  const n = daysBetween(from, iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n > 0) return `in ${n} days`
  return `${Math.abs(n)} days ago`
}

/* --------------------------------------------------------------- currency */
export const fmtMoney = (n: number, symbol = '₹', decimals = 0): string => {
  const neg = n < 0
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${neg ? '-' : ''}${symbol}${s}`
}

export const fmtCompact = (n: number, symbol = ''): string => {
  const neg = n < 0
  const a = Math.abs(n)
  let out: string
  if (a >= 10000000) out = `${(a / 10000000).toFixed(a >= 100000000 ? 0 : 2)}Cr`
  else if (a >= 100000) out = `${(a / 100000).toFixed(a >= 1000000 ? 0 : 2)}L`
  else if (a >= 1000) out = `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}K`
  else out = String(Math.round(a))
  return `${neg ? '-' : ''}${symbol}${out}`
}

export const fmtNumber = (n: number): string => Math.round(n).toLocaleString('en-IN')

export const parseNum = (v: string | number): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/* --------------------------------------------------------- invoice totals */
export interface InvoiceTotals {
  subtotal: number
  discount: number
  taxableValue: number
  taxRate: number
  taxAmount: number
  cgst: number
  sgst: number
  igst: number
  total: number
}

export const invoiceTotals = (inv: Pick<Invoice, 'items' | 'discount' | 'gstType' | 'gstRate'>): InvoiceTotals => {
  const subtotal = inv.items.reduce((s, i) => s + (i.qty || 0) * (i.rate || 0), 0)
  const discount = Math.min(inv.discount || 0, subtotal)
  const taxableValue = subtotal - discount
  const taxRate = inv.gstType === 'none' ? 0 : inv.gstRate || 0
  const taxAmount = round2((taxableValue * taxRate) / 100)
  const half = round2(taxAmount / 2)
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    taxableValue: round2(taxableValue),
    taxRate,
    taxAmount,
    cgst: inv.gstType === 'cgst_sgst' ? half : 0,
    sgst: inv.gstType === 'cgst_sgst' ? taxAmount - half : 0,
    igst: inv.gstType === 'igst' ? taxAmount : 0,
    total: round2(taxableValue + taxAmount),
  }
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/* ------------------------------------------------------- invoice statuses */
export type InvoiceView = 'paid' | 'overdue' | 'due-soon' | 'pending' | 'draft'

export const invoiceView = (inv: Invoice, ref = today()): InvoiceView => {
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'draft') return 'draft'
  const gap = daysBetween(ref, inv.dueDate)
  if (!isValidDate(inv.dueDate)) return 'pending'
  if (gap < 0) return 'overdue'
  if (gap <= 7) return 'due-soon'
  return 'pending'
}

export const INVOICE_VIEW_META: Record<InvoiceView, { label: string; tone: 'good' | 'bad' | 'warn' | 'info' | 'neutral' }> = {
  paid: { label: 'Paid', tone: 'good' },
  overdue: { label: 'Overdue', tone: 'bad' },
  'due-soon': { label: 'Due soon', tone: 'warn' },
  pending: { label: 'Pending', tone: 'info' },
  draft: { label: 'Draft', tone: 'neutral' },
}

/* ------------------------------------------------------------------ misc */
export const deliverableSummary = (d: Deal): string =>
  d.deliverables.length
    ? d.deliverables.map((x) => (x.qty > 1 ? `${x.qty}× ${x.type}` : x.type)).join(', ')
    : '—'

export const goalProgress = (g: Goal): { pct: number; paceP: number; onTrack: boolean; remaining: number; daysLeft: number } => {
  const span = Math.max(1, g.targetValue - g.startValue)
  const done = g.currentValue - g.startValue
  const pct = clamp((done / span) * 100, 0, 100)
  const totalDays = Math.max(1, daysBetween(g.startDate, g.deadline))
  const elapsed = clamp(daysBetween(g.startDate, today()), 0, totalDays)
  const paceP = (elapsed / totalDays) * 100
  return {
    pct,
    paceP,
    onTrack: pct >= paceP - 0.5,
    remaining: Math.max(0, g.targetValue - g.currentValue),
    daysLeft: daysBetween(today(), g.deadline),
  }
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** Strip a leading protocol + www for display. */
export const prettyUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')

export const ensureProtocol = (url: string) =>
  !url || /^https?:\/\//i.test(url) ? url : `https://${url}`

export const contentDateFor = (c: { status: ContentStatus; shootDate: string; editDate: string; postDate: string }): string =>
  c.postDate || c.editDate || c.shootDate || ''

/** Debounce helper for search inputs. */
export const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let t: ReturnType<typeof setTimeout>
  return (...a: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

/** Naive fuzzy-ish search: every whitespace-separated term must appear. */
export const matches = (query: string, ...fields: (string | undefined | null)[]): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = fields.filter(Boolean).join('   ').toLowerCase()
  return q.split(/\s+/).every((t) => hay.includes(t))
}

export const uniq = <T,>(arr: T[]): T[] => Array.from(new Set(arr))

export const sortBy = <T,>(arr: T[], key: (t: T) => string | number, dir: 'asc' | 'desc' = 'asc'): T[] =>
  [...arr].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka === kb) return 0
    return (ka > kb ? 1 : -1) * (dir === 'asc' ? 1 : -1)
  })
