import type { AppState, Deal, Invoice, Transaction } from './types'
import {
  addDays, daysBetween, invoiceTotals, invoiceView, monthShort, parseISO,
  sortBy, toISODate, today,
} from './utils'

/* ------------------------------------------------------------------ range */
export type RangePreset = 'month' | 'quarter' | 'year' | 'all' | 'custom'

export interface DateRange {
  from: string
  to: string
  label: string
  preset: RangePreset
}

export const rangeFor = (preset: RangePreset, anchor = new Date()): DateRange => {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  switch (preset) {
    case 'month':
      return {
        preset, from: toISODate(new Date(y, m, 1)), to: toISODate(new Date(y, m + 1, 0)),
        label: `${monthShort(m)} ${y}`,
      }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return {
        preset, from: toISODate(new Date(y, q * 3, 1)), to: toISODate(new Date(y, q * 3 + 3, 0)),
        label: `Q${q + 1} ${y}`,
      }
    }
    case 'year':
      return { preset, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
    case 'all':
      return { preset, from: '1970-01-01', to: '2999-12-31', label: 'All time' }
    default:
      return { preset: 'custom', from: toISODate(new Date(y, m, 1)), to: today(), label: 'Custom' }
  }
}

export const shiftRange = (r: DateRange, dir: -1 | 1): DateRange => {
  const d = parseISO(r.from)
  if (r.preset === 'month') return rangeFor('month', new Date(d.getFullYear(), d.getMonth() + dir, 1))
  if (r.preset === 'quarter') return rangeFor('quarter', new Date(d.getFullYear(), d.getMonth() + dir * 3, 1))
  if (r.preset === 'year') return rangeFor('year', new Date(d.getFullYear() + dir, 0, 1))
  return r
}

export const inRange = (iso: string, r: DateRange) => !!iso && iso >= r.from && iso <= r.to

/* ----------------------------------------------------------- transactions */
/**
 * One flat, signed ledger built from invoices, non-invoice income and expenses.
 * An invoice lands on its paid date once collected, otherwise on its issue date
 * so it still shows up as money owed in the period it was billed.
 */
export const buildTransactions = (state: AppState): Transaction[] => {
  const txs: Transaction[] = []

  for (const inv of state.invoices) {
    if (inv.status === 'draft') continue
    const total = invoiceTotals(inv).total
    const collected = inv.status === 'paid'
    txs.push({
      id: `inv:${inv.id}`,
      kind: 'invoice',
      date: (collected && inv.paidDate) || inv.date,
      title: inv.to.name || 'Untitled client',
      subtitle: `Invoice ${inv.number}`,
      amount: total,
      collected,
      sourceId: inv.id,
    })
  }

  for (const oi of state.otherIncome) {
    txs.push({
      id: `oi:${oi.id}`,
      kind: 'income',
      date: oi.date,
      title: oi.description || oi.source,
      subtitle: oi.source,
      amount: oi.amount,
      collected: true,
      sourceId: oi.id,
    })
  }

  for (const ex of state.expenses) {
    txs.push({
      id: `ex:${ex.id}`,
      kind: 'expense',
      date: ex.date,
      title: ex.description || ex.category,
      subtitle: ex.category,
      amount: -Math.abs(ex.amount),
      collected: true,
      sourceId: ex.id,
    })
  }

  return sortBy(txs, (t) => t.date, 'desc')
}

/* --------------------------------------------------------------- earnings */
export interface EarningsSummary {
  collected: number
  pending: number
  expenses: number
  net: number
  invoiceCount: number
  transactions: Transaction[]
}

export const earningsFor = (txs: Transaction[], r: DateRange): EarningsSummary => {
  const scoped = txs.filter((t) => inRange(t.date, r))
  let collected = 0
  let pending = 0
  let expenses = 0
  for (const t of scoped) {
    if (t.kind === 'expense') expenses += Math.abs(t.amount)
    else if (t.collected) collected += t.amount
    else pending += t.amount
  }
  return {
    collected,
    pending,
    expenses,
    net: collected - expenses,
    invoiceCount: scoped.filter((t) => t.kind === 'invoice').length,
    transactions: scoped,
  }
}

/* ---------------------------------------------------------------- buckets */
export interface Bucket {
  key: string
  label: string
  collected: number
  expenses: number
  net: number
  pending: number
}

type Grain = 'day' | 'week' | 'month' | 'year'

export const grainFor = (r: DateRange, txs: Transaction[]): Grain => {
  let from = r.from
  let to = r.to
  if (r.preset === 'all') {
    const dates = txs.map((t) => t.date).filter(Boolean).sort()
    if (!dates.length) return 'month'
    from = dates[0]
    to = dates[dates.length - 1]
  }
  const span = daysBetween(from, to)
  if (span <= 45) return 'day'
  if (span <= 120) return 'week'
  if (span <= 800) return 'month'
  return 'year'
}

const bucketKey = (iso: string, grain: Grain): string => {
  const d = parseISO(iso)
  if (grain === 'year') return String(d.getFullYear())
  if (grain === 'month') return iso.slice(0, 7)
  if (grain === 'week') {
    const s = new Date(d)
    s.setDate(s.getDate() - s.getDay())
    return toISODate(s)
  }
  return iso
}

const bucketLabel = (key: string, grain: Grain): string => {
  if (grain === 'year') return key
  if (grain === 'month') {
    const [y, m] = key.split('-').map(Number)
    return `${monthShort(m - 1)} ${String(y).slice(2)}`
  }
  const d = parseISO(key)
  return `${d.getDate()} ${monthShort(d.getMonth())}`
}

/** Continuous series (gaps filled with zeroes) so the chart never lies about pace. */
export const bucketize = (txs: Transaction[], r: DateRange): Bucket[] => {
  const grain = grainFor(r, txs)
  const scoped = txs.filter((t) => inRange(t.date, r))
  if (!scoped.length) return []

  const dates = scoped.map((t) => t.date).sort()
  const start = r.preset === 'all' ? dates[0] : r.from
  const end = r.preset === 'all' ? dates[dates.length - 1] : r.to

  const map = new Map<string, Bucket>()
  const push = (key: string) => {
    if (!map.has(key)) map.set(key, { key, label: bucketLabel(key, grain), collected: 0, expenses: 0, net: 0, pending: 0 })
    return map.get(key)!
  }

  // Seed every slot in the window so sparse months still render.
  let cursor = bucketKey(start, grain)
  const endKey = bucketKey(end, grain)
  let guard = 0
  while (guard++ < 3000) {
    push(cursor)
    if (cursor >= endKey) break
    const d = parseISO(grain === 'month' ? `${cursor}-01` : grain === 'year' ? `${cursor}-01-01` : cursor)
    if (grain === 'day') d.setDate(d.getDate() + 1)
    else if (grain === 'week') d.setDate(d.getDate() + 7)
    else if (grain === 'month') d.setMonth(d.getMonth() + 1)
    else d.setFullYear(d.getFullYear() + 1)
    cursor = bucketKey(toISODate(d), grain)
  }

  for (const t of scoped) {
    const b = push(bucketKey(t.date, grain))
    if (t.kind === 'expense') b.expenses += Math.abs(t.amount)
    else if (t.collected) b.collected += t.amount
    else b.pending += t.amount
  }

  const out = Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1))
  for (const b of out) b.net = b.collected - b.expenses
  return out
}

/* ------------------------------------------------------------- attention */
export const upcomingInvoices = (state: AppState, withinDays = 30): Invoice[] =>
  sortBy(
    state.invoices.filter((i) => {
      if (i.status !== 'sent') return false
      const gap = daysBetween(today(), i.dueDate)
      return gap <= withinDays
    }),
    (i) => i.dueDate,
    'asc',
  )

export const overdueInvoices = (state: AppState): Invoice[] =>
  state.invoices.filter((i) => invoiceView(i) === 'overdue')

/** Deals that are won but have no invoice raised yet — money left on the table. */
export const dealsAwaitingInvoice = (state: AppState): Deal[] => {
  const invoiced = new Set(state.invoices.map((i) => i.dealId).filter(Boolean) as string[])
  return state.deals.filter((d) => (d.stage === 'closed' || d.stage === 'delivered') && !invoiced.has(d.id))
}

export const openDeals = (state: AppState): Deal[] =>
  state.deals.filter((d) => d.stage !== 'closed' && d.stage !== 'lost')

export const dueFollowUps = (state: AppState): Deal[] =>
  sortBy(
    openDeals(state).filter((d) => d.followUpDate && d.followUpDate <= addDays(today(), 3)),
    (d) => d.followUpDate,
    'asc',
  )

export const pipelineValue = (state: AppState): number =>
  openDeals(state).reduce((s, d) => s + (d.finalAmount || d.statedAmount || d.quotedAmount || 0), 0)

export const contentDueToday = (state: AppState) =>
  state.content.filter((c) => c.status !== 'published' && c.postDate === today())

export const contentThisWeek = (state: AppState) => {
  const end = addDays(today(), 7)
  return sortBy(
    state.content.filter((c) => c.status !== 'published' && c.postDate && c.postDate >= today() && c.postDate <= end),
    (c) => c.postDate,
    'asc',
  )
}

/* -------------------------------------------------------- goal autotrack */
/** Resolve auto-tracked goals against live data without mutating state. */
export const resolvedGoalValue = (state: AppState, goal: { kind: string; autoTrack: boolean; startDate: string; deadline: string; currentValue: number }): number => {
  if (!goal.autoTrack) return goal.currentValue
  const r: DateRange = { from: goal.startDate, to: goal.deadline, label: '', preset: 'custom' }
  if (goal.kind === 'earnings') {
    const txs = buildTransactions(state)
    return earningsFor(txs, r).collected
  }
  if (goal.kind === 'content') {
    return state.content.filter((c) => c.status === 'published' && inRange(c.postDate, r)).length
  }
  return goal.currentValue
}
