import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppState, Invoice, Settings, ThemeName } from './types'
import { today, uid } from './utils'

const STORAGE_KEY = 'creator-os.state.v1'
const STATE_VERSION = 1

/* ---------------------------------------------------------------- defaults */
export const defaultSettings = (): Settings => ({
  theme: 'light',
  creatorName: '',
  currency: 'INR',
  currencySymbol: '₹',
  business: { name: '', address: '', gstin: '', email: '', phone: '' },
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1,
  defaultDueDays: 15,
  defaultTemplate: 'modern',
  defaultThemeColor: '#4f46e5',
  defaultGstType: 'none',
  defaultGstRate: 18,
  defaultTerms: 'Payment due within the stated period. Please include the invoice number in the payment reference.',
  defaultBankDetails: '',
  templateCategories: ['Brand Replies', 'Scripting', 'Negotiation', 'Admin'],
  ideaCategories: ['Reels', 'Long Form', 'Series', 'Experiments'],
  inspirationCategories: ['Same Niche', 'Editing Style', 'Hooks', 'Storytelling'],
  onboarded: false,
})

export const emptyState = (): AppState => ({
  version: STATE_VERSION,
  settings: defaultSettings(),
  templates: [],
  deals: [],
  invoices: [],
  expenses: [],
  otherIncome: [],
  ideas: [],
  inspirations: [],
  content: [],
  goals: [],
})

/* --------------------------------------------------------------- load/save */
/**
 * A blank invoice is created the moment the editor opens so everything can
 * autosave. If the tab is closed before anything is typed, the in-app cleanup
 * never runs — so sweep those abandoned shells on the next load.
 */
const isAbandonedDraft = (inv: Invoice): boolean => {
  if (inv.status !== 'draft') return false
  if (inv.to.name.trim() || inv.notes.trim()) return false
  if (inv.items.some((i) => i.description.trim() || i.rate > 0)) return false
  const ageHours = (Date.now() - new Date(inv.createdAt).getTime()) / 3600000
  return ageHours > 12
}

const load = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = emptyState()
    if (parsed.invoices) parsed.invoices = parsed.invoices.filter((i) => !isAbandonedDraft(i))
    return {
      ...base,
      ...parsed,
      version: STATE_VERSION,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      // guard against a partially written / older payload
      templates: parsed.templates ?? [],
      deals: parsed.deals ?? [],
      invoices: parsed.invoices ?? [],
      expenses: parsed.expenses ?? [],
      otherIncome: parsed.otherIncome ?? [],
      ideas: parsed.ideas ?? [],
      inspirations: parsed.inspirations ?? [],
      content: parsed.content ?? [],
      goals: parsed.goals ?? [],
    }
  } catch {
    return emptyState()
  }
}

/* ------------------------------------------------------------------ types */
type ListKey = {
  [K in keyof AppState]: AppState[K] extends { id: string }[] ? K : never
}[keyof AppState]

type ItemOf<K extends ListKey> = AppState[K][number]

export interface Store {
  state: AppState
  settings: Settings
  /** Mutate a structural copy of state; returns nothing. */
  update: (recipe: (draft: AppState) => void) => void
  setSettings: (patch: Partial<Settings>) => void
  setTheme: (theme: ThemeName) => void
  /** Insert or replace by id. Stamps updatedAt when the field exists. */
  put: <K extends ListKey>(key: K, item: ItemOf<K>) => void
  patch: <K extends ListKey>(key: K, id: string, changes: Partial<ItemOf<K>>) => void
  remove: <K extends ListKey>(key: K, id: string) => void
  replaceAll: (next: AppState) => void
  storageError: string | null
}

const StoreCtx = createContext<Store | null>(null)

/* --------------------------------------------------------------- provider */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const [storageError, setStorageError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced persistence keeps typing in long text areas smooth.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        setStorageError((e) => (e ? null : e))
      } catch (err) {
        setStorageError(
          err instanceof Error && err.name === 'QuotaExceededError'
            ? 'Local storage is full — export a backup from Settings and trim old records.'
            : 'Could not save to this browser. Changes are in memory only.',
        )
      }
    }, 250)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state])

  // Flush immediately if the tab closes mid-debounce.
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        /* nothing useful to do while unloading */
      }
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [state])

  // Apply the theme to <html> so CSS variables cascade everywhere.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.settings.theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      const bg = getComputedStyle(document.body).backgroundColor
      meta.setAttribute('content', bg)
    }
  }, [state.settings.theme])

  const update = useCallback((recipe: (draft: AppState) => void) => {
    setState((prev) => {
      const draft = structuredClone(prev) as AppState
      recipe(draft)
      return draft
    })
  }, [])

  const setSettings = useCallback(
    (patchObj: Partial<Settings>) => update((d) => { d.settings = { ...d.settings, ...patchObj } }),
    [update],
  )

  const setTheme = useCallback((theme: ThemeName) => setSettings({ theme }), [setSettings])

  const put = useCallback(
    <K extends ListKey>(key: K, item: ItemOf<K>) =>
      update((d) => {
        const list = d[key] as ItemOf<K>[]
        const stamped = { ...item, updatedAt: new Date().toISOString() } as ItemOf<K>
        const next = 'updatedAt' in (item as object) ? stamped : item
        const i = list.findIndex((x) => x.id === item.id)
        if (i >= 0) list[i] = next
        else list.unshift(next)
      }),
    [update],
  )

  const patch = useCallback(
    <K extends ListKey>(key: K, id: string, changes: Partial<ItemOf<K>>) =>
      update((d) => {
        const list = d[key] as ItemOf<K>[]
        const i = list.findIndex((x) => x.id === id)
        if (i < 0) return
        const merged = { ...list[i], ...changes } as ItemOf<K>
        if ('updatedAt' in (list[i] as object)) {
          ;(merged as { updatedAt: string }).updatedAt = new Date().toISOString()
        }
        list[i] = merged
      }),
    [update],
  )

  const remove = useCallback(
    <K extends ListKey>(key: K, id: string) =>
      update((d) => {
        const list = d[key] as ItemOf<K>[]
        const i = list.findIndex((x) => x.id === id)
        if (i >= 0) list.splice(i, 1)
      }),
    [update],
  )

  const replaceAll = useCallback((next: AppState) => setState(next), [])

  const value = useMemo<Store>(
    () => ({ state, settings: state.settings, update, setSettings, setTheme, put, patch, remove, replaceAll, storageError }),
    [state, update, setSettings, setTheme, put, patch, remove, replaceAll, storageError],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

/** Convenience: money formatter bound to the configured currency symbol. */
export function useMoney() {
  const { settings } = useStore()
  return settings.currencySymbol || '₹'
}

/* ------------------------------------------------------------ next number */
export const nextInvoiceNumber = (settings: Settings): string =>
  `${settings.invoicePrefix}${String(settings.nextInvoiceNumber).padStart(3, '0')}`

/* --------------------------------------------------------------- demo data */
export function demoState(base: AppState): AppState {
  const d = structuredClone(base) as AppState
  const now = new Date().toISOString()
  const t = today()
  const back = (n: number) => {
    const dt = new Date()
    dt.setDate(dt.getDate() - n)
    return dt.toISOString().slice(0, 10)
  }
  const fwd = (n: number) => back(-n)

  d.settings = {
    ...d.settings,
    creatorName: d.settings.creatorName,
    business: {
      ...d.settings.business,
      name: d.settings.business.name || 'Your Studio',
      address: d.settings.business.address || '221B Creator Lane\nBengaluru, Karnataka 560001',
      email: d.settings.business.email || 'hello@yourstudio.com',
    },
    onboarded: true,
  }

  d.templates = [
    {
      id: uid('t'), title: 'Brand collab — first reply', category: 'Brand Replies', pinned: true,
      tags: ['outreach', 'email'], createdAt: now, updatedAt: now,
      body: 'Hi {{Name}},\n\nThanks so much for reaching out — I love what {{Brand}} is doing.\n\nBefore I share a quote, a few quick things:\n\n1. What deliverables are you after? (UGC, collab reel, static, stories)\n2. What is the usage window and are paid ads included?\n3. What is the timeline you are working with?\n4. Do you have a budget range in mind?\n\nOnce I have those, I will send a tailored proposal within 24 hours.\n\nBest,\n{{You}}',
    },
    {
      id: uid('t'), title: 'Rate card + usage rights explainer', category: 'Negotiation', pinned: true,
      tags: ['pricing'], createdAt: now, updatedAt: now,
      body: 'Base deliverable fee covers organic posting on my channel for 30 days.\n\nAdd-ons:\n• Paid usage (whitelisting / meta ads): +40% per 3 months\n• Exclusivity in category: +25% for the exclusivity window\n• Raw footage handover: +₹X\n• Extra revisions beyond 2: +₹Y each\n\nHappy to bundle if we lock multiple deliverables together.',
    },
    {
      id: uid('t'), title: 'Reel script framework — Hook / Hold / Payoff', category: 'Scripting',
      pinned: false, tags: ['framework', 'reels'], createdAt: now, updatedAt: now,
      body: '0-2s HOOK\nState the outcome or the contradiction. No greetings, no intro.\n\n2-8s HOLD\nRaise the stakes. Name the mistake most people make. Promise the fix.\n\n8-35s BODY\nThree beats, one idea each. Cut on every sentence. Show, do not narrate.\n\n35-45s PAYOFF\nDeliver the promised fix, then a single CTA. One ask only.\n\nCHECKLIST\n□ Would I stop scrolling at second one?\n□ Is there a visual change every 2 seconds?\n□ Can the caption stand alone?',
    },
    {
      id: uid('t'), title: 'Polite follow-up (no reply, 5 days)', category: 'Brand Replies',
      pinned: false, tags: ['followup'], createdAt: now, updatedAt: now,
      body: 'Hi {{Name}},\n\nFloating this back to the top of your inbox. Still keen to work on {{Campaign}} — my next open slot is {{Date}}.\n\nIf the timing has moved, no problem at all, just let me know and I will check back next quarter.\n\nBest,\n{{You}}',
    },
  ]

  const deals = [
    { brand: 'Lumen Skincare', contact: 'Priya Nair', stage: 'closed' as const, quoted: 85000, stated: 70000, final: 78000, days: 26, dl: [{ type: 'UGC Video', qty: 2 }, { type: 'Collab Reel', qty: 1 }], months: 3, notes: 'Loved the first cut. Wants a Q1 retainer conversation.' },
    { brand: 'Northwind Coffee', contact: 'Aman Shah', stage: 'delivered' as const, quoted: 45000, stated: 45000, final: 45000, days: 18, dl: [{ type: 'Collab Reel', qty: 1 }], months: 1, notes: 'Delivered on the 12th. Invoice next.' },
    { brand: 'Kite Athletics', contact: 'Rhea Menon', stage: 'negotiating' as const, quoted: 120000, stated: 80000, final: 0, days: 9, dl: [{ type: 'YouTube Integration', qty: 1 }, { type: 'Story Set', qty: 2 }], months: 6, notes: 'Gap is on paid usage. Offer 3 months instead of 6.' },
    { brand: 'Halo Audio', contact: 'Dev Kapoor', stage: 'in-talks' as const, quoted: 60000, stated: 0, final: 0, days: 4, dl: [{ type: 'Non-Collab Reel', qty: 1 }], months: 0, notes: 'Waiting on their brief.' },
    { brand: 'Verde Kitchen', contact: 'Sara Iyer', stage: 'contacted' as const, quoted: 0, stated: 35000, final: 0, days: 2, dl: [{ type: 'UGC Video', qty: 3 }], months: 2, notes: 'Inbound from Instagram DM.' },
  ]

  d.deals = deals.map((x, i) => ({
    id: uid('d'),
    brand: x.brand,
    contactName: x.contact,
    contactEmail: `${x.contact.split(' ')[0].toLowerCase()}@${x.brand.split(' ')[0].toLowerCase()}.com`,
    contactPhone: '',
    dateContacted: back(x.days),
    deliverables: x.dl.map((y) => ({ id: uid('dl'), type: y.type, qty: y.qty })),
    adRightsMonths: x.months,
    quotedAmount: x.quoted,
    statedAmount: x.stated,
    finalAmount: x.final,
    stage: x.stage,
    followUpDate: x.stage === 'closed' ? '' : fwd((i % 4) + 1),
    notes: x.notes,
    createdAt: now,
    updatedAt: now,
  }))

  const closedDeal = d.deals[0]
  const mkInvoice = (
    n: number, dealId: string | undefined, to: { name: string; email: string }, items: { description: string; qty: number; rate: number }[],
    dateAgo: number, dueIn: number, status: 'draft' | 'sent' | 'paid', paidAgo?: number,
  ) => ({
    id: uid('i'),
    number: `${d.settings.invoicePrefix}${String(n).padStart(3, '0')}`,
    date: back(dateAgo),
    dueDate: fwd(dueIn),
    status,
    from: d.settings.business,
    to: { name: to.name, address: '', gstin: '', email: to.email, phone: '' },
    items: items.map((it) => ({ id: uid('it'), ...it })),
    gstType: 'none' as const,
    gstRate: 18,
    discount: 0,
    notes: '',
    terms: d.settings.defaultTerms,
    bankDetails: '',
    template: 'modern' as const,
    themeColor: d.settings.defaultThemeColor,
    currency: 'INR',
    dealId,
    paidDate: paidAgo !== undefined ? back(paidAgo) : undefined,
    createdAt: now,
    updatedAt: now,
  })

  d.invoices = [
    mkInvoice(1, closedDeal.id, { name: 'Lumen Skincare', email: 'priya@lumen.com' },
      [{ description: 'UGC Video × 2 + Collab Reel', qty: 1, rate: 78000 }], 20, -5, 'paid', 6),
    mkInvoice(2, undefined, { name: 'Fern & Field', email: 'accounts@fernfield.com' },
      [{ description: 'Instagram Collab Reel', qty: 1, rate: 52000 }], 62, -40, 'paid', 44),
    mkInvoice(3, undefined, { name: 'Atlas Travel Co.', email: 'ap@atlastravel.com' },
      [{ description: 'YouTube Integration (60s)', qty: 1, rate: 95000 }], 95, -70, 'paid', 78),
    mkInvoice(4, undefined, { name: 'Northwind Coffee', email: 'aman@northwind.com' },
      [{ description: 'Collab Reel + 2 Stories', qty: 1, rate: 45000 }], 8, 4, 'sent'),
    mkInvoice(5, undefined, { name: 'Pixel Peripherals', email: 'finance@pixelp.com' },
      [{ description: 'Non-collab review reel', qty: 1, rate: 38000 }], 40, -9, 'sent'),
  ]
  d.settings.nextInvoiceNumber = 6

  d.expenses = [
    { id: uid('e'), date: back(12), category: 'Software', description: 'Editing suite — annual', amount: 14400, notes: '', createdAt: now },
    { id: uid('e'), date: back(35), category: 'Gear', description: 'Lav mic set', amount: 8900, notes: '', createdAt: now },
    { id: uid('e'), date: back(58), category: 'Editing / Freelancer', description: 'Editor — 4 reels', amount: 12000, notes: '', createdAt: now },
  ]

  d.otherIncome = [
    { id: uid('oi'), date: back(15), source: 'AdSense / Platform Payout', description: 'YouTube payout', amount: 21400, notes: '', createdAt: now },
    { id: uid('oi'), date: back(46), source: 'Affiliate', description: 'Gear affiliate commissions', amount: 7350, notes: '', createdAt: now },
  ]

  d.ideas = [
    { id: uid('id'), title: 'The 3 lights every creator gets wrong', category: 'Reels', starred: true, createdAt: back(1) + 'T09:00:00.000Z', updatedAt: now, body: 'Open on a badly lit shot, then flip to the fix.\n\nBeats:\n1. Key too close → harsh nose shadow\n2. No separation from the wall\n3. Mixing daylight and tungsten\n\nEnd with the 3-light diagram as a graphic.' },
    { id: uid('id'), title: 'I priced my first brand deal wrong — here is the math', category: 'Long Form', starred: false, createdAt: back(3) + 'T09:00:00.000Z', updatedAt: now, body: 'Break down actual numbers. Show the rate card evolution over 2 years. Be honest about the deal I lost.' },
    { id: uid('id'), title: 'Series: teardown of a viral reel every Friday', category: 'Series', starred: true, createdAt: back(6) + 'T09:00:00.000Z', updatedAt: now, body: 'Consistent format: hook analysis, retention guess, what I would change. 90 seconds max.' },
    { id: uid('id'), title: 'What happens if I post 3× a day for 30 days', category: 'Experiments', starred: false, createdAt: back(11) + 'T09:00:00.000Z', updatedAt: now, body: 'Document the burnout honestly. Track reach, follows, saves in a spreadsheet on screen.' },
  ]

  d.inspirations = [
    { id: uid('n'), name: 'Casey Neistat', handle: '@caseyneistat', url: 'https://youtube.com/@casey', platform: 'YouTube', category: 'Storytelling', notes: 'Pacing and the way b-roll carries narration.', createdAt: now },
    { id: uid('n'), name: 'Vox', handle: '@voxdotcom', url: 'https://youtube.com/@Vox', platform: 'YouTube', category: 'Editing Style', notes: 'Motion graphics that explain, not decorate.', createdAt: now },
    { id: uid('n'), name: 'Studio Ghibli Fanpage', handle: '@ghiblistills', url: 'https://instagram.com/ghiblistills', platform: 'Instagram', category: 'Hooks', notes: 'First frame is always the strongest frame.', createdAt: now },
  ]

  d.content = [
    { id: uid('c'), title: '3 lights every creator gets wrong', status: 'scripting', platform: 'Instagram', inspirationUrl: '', script: 'HOOK: This shot cost me nothing to fix.\n\n...', caption: 'Lighting is 80% of your look. Save this one.', hashtags: '#filmmaking #creatortips', shootDate: fwd(3), editDate: fwd(4), postDate: fwd(6), notes: '', order: 0, createdAt: now, updatedAt: now },
    { id: uid('c'), title: 'How I price brand deals', status: 'to-shoot', platform: 'YouTube', inspirationUrl: 'https://youtube.com/@Vox', script: 'Cold open with the invoice on screen.', caption: '', hashtags: '', shootDate: fwd(1), editDate: fwd(2), postDate: fwd(5), notes: 'Book the studio.', order: 0, createdAt: now, updatedAt: now },
    { id: uid('c'), title: 'Viral reel teardown #012', status: 'editing', platform: 'Instagram', inspirationUrl: '', script: '', caption: 'Teardown #012 — the 1.4s cut that saved this reel.', hashtags: '#reels', shootDate: back(2), editDate: t, postDate: fwd(1), notes: '', order: 0, createdAt: now, updatedAt: now },
    { id: uid('c'), title: 'My 2026 gear reset', status: 'published', platform: 'YouTube', inspirationUrl: '', script: '', caption: 'Everything I actually use.', hashtags: '', shootDate: back(14), editDate: back(10), postDate: back(7), notes: '', order: 0, createdAt: now, updatedAt: now },
    { id: uid('c'), title: 'Posting 3× a day — day 1', status: 'scripting', platform: 'Instagram', inspirationUrl: '', script: '', caption: '', hashtags: '', shootDate: '', editDate: '', postDate: t, notes: '', order: 1, createdAt: now, updatedAt: now },
  ]

  d.goals = [
    { id: uid('g'), kind: 'followers', title: 'Instagram to 100K', platform: 'Instagram', startValue: 42000, currentValue: 74600, targetValue: 100000, unit: 'followers', startDate: back(120), deadline: fwd(150), autoTrack: false, history: [{ date: back(120), value: 42000 }, { date: back(90), value: 51800 }, { date: back(60), value: 60200 }, { date: back(30), value: 68100 }, { date: t, value: 74600 }], createdAt: now, updatedAt: now },
    { id: uid('g'), kind: 'earnings', title: 'Collect ₹12L this year', platform: '', startValue: 0, currentValue: 0, targetValue: 1200000, unit: '₹', startDate: `${new Date().getFullYear()}-01-01`, deadline: `${new Date().getFullYear()}-12-31`, autoTrack: true, history: [], createdAt: now, updatedAt: now },
    { id: uid('g'), kind: 'content', title: 'Publish 120 pieces', platform: '', startValue: 0, currentValue: 0, targetValue: 120, unit: 'posts', startDate: `${new Date().getFullYear()}-01-01`, deadline: `${new Date().getFullYear()}-12-31`, autoTrack: true, history: [], createdAt: now, updatedAt: now },
  ]

  return d
}
