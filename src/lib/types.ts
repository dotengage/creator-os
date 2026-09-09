/* ------------------------------------------------------------------ theme */
export type ThemeName = 'light' | 'dark' | 'sand' | 'mint' | 'lavender' | 'blush' | 'sky'

export const THEMES: { id: ThemeName; label: string; group: 'core' | 'pastel'; swatch: string; ring: string }[] = [
  { id: 'light', label: 'Light', group: 'core', swatch: '#ffffff', ring: '#6366f1' },
  { id: 'dark', label: 'Charcoal', group: 'core', swatch: '#1b1b1e', ring: '#818cf8' },
  { id: 'sand', label: 'Sand', group: 'pastel', swatch: '#faf6f0', ring: '#be743a' },
  { id: 'mint', label: 'Mint', group: 'pastel', swatch: '#f0f9f4', ring: '#0d946a' },
  { id: 'lavender', label: 'Lavender', group: 'pastel', swatch: '#f7f5fd', ring: '#7c5cdc' },
  { id: 'blush', label: 'Blush', group: 'pastel', swatch: '#fdf5f6', ring: '#d44c6a' },
  { id: 'sky', label: 'Sky', group: 'pastel', swatch: '#f3f8fe', ring: '#1a74c7' },
]

/* --------------------------------------------------------------- template */
export interface Template {
  id: string
  title: string
  category: string
  body: string
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------- deal */
export type DealStage = 'contacted' | 'in-talks' | 'negotiating' | 'confirmed' | 'delivered' | 'closed' | 'lost'

export const DEAL_STAGES: { id: DealStage; label: string; tone: 'neutral' | 'info' | 'warn' | 'good' | 'bad' }[] = [
  { id: 'contacted', label: 'Contacted', tone: 'neutral' },
  { id: 'in-talks', label: 'In Talks', tone: 'info' },
  { id: 'negotiating', label: 'Negotiating', tone: 'warn' },
  { id: 'confirmed', label: 'Confirmed', tone: 'info' },
  { id: 'delivered', label: 'Delivered', tone: 'info' },
  { id: 'closed', label: 'Closed / Won', tone: 'good' },
  { id: 'lost', label: 'Lost', tone: 'bad' },
]

export const DELIVERABLE_TYPES = [
  'UGC Video',
  'Collab Reel',
  'Non-Collab Reel',
  'Static Post',
  'Story Set',
  'YouTube Integration',
  'YouTube Dedicated',
  'Carousel',
  'Podcast Mention',
  'Event / Appearance',
] as const

export interface Deliverable {
  id: string
  type: string
  qty: number
}

export interface Deal {
  id: string
  brand: string
  contactName: string
  contactEmail: string
  contactPhone: string
  dateContacted: string
  deliverables: Deliverable[]
  adRightsMonths: number
  quotedAmount: number
  statedAmount: number
  finalAmount: number
  stage: DealStage
  followUpDate: string
  notes: string
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------- invoice */
export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type InvoiceTemplate = 'modern' | 'classic' | 'minimal'
export type GstType = 'none' | 'igst' | 'cgst_sgst'

export interface Party {
  name: string
  address: string
  gstin: string
  email: string
  phone: string
}

export interface InvoiceItem {
  id: string
  description: string
  qty: number
  rate: number
}

export interface Invoice {
  id: string
  number: string
  date: string
  dueDate: string
  status: InvoiceStatus
  from: Party
  to: Party
  items: InvoiceItem[]
  gstType: GstType
  gstRate: number
  discount: number
  notes: string
  terms: string
  bankDetails: string
  template: InvoiceTemplate
  themeColor: string
  currency: string
  dealId?: string
  paidDate?: string
  createdAt: string
  updatedAt: string
}

/* --------------------------------------------------------------- finances */
export interface Expense {
  id: string
  date: string
  category: string
  description: string
  amount: number
  notes: string
  createdAt: string
}

export interface OtherIncome {
  id: string
  date: string
  source: string
  description: string
  amount: number
  notes: string
  createdAt: string
}

export const EXPENSE_CATEGORIES = [
  'Gear', 'Software', 'Travel', 'Props & Wardrobe', 'Editing / Freelancer',
  'Location', 'Marketing', 'Taxes & Fees', 'Other',
] as const

export const INCOME_SOURCES = [
  'AdSense / Platform Payout', 'Affiliate', 'Digital Product', 'Consulting',
  'Speaking', 'Tips / Donations', 'Other',
] as const

/* ------------------------------------------------------------------ ideas */
export interface Idea {
  id: string
  title: string
  category: string
  body: string
  starred: boolean
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------ inspiration */
export interface Inspiration {
  id: string
  name: string
  handle: string
  url: string
  platform: string
  category: string
  notes: string
  createdAt: string
}

export const PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'X / Twitter', 'LinkedIn', 'Website', 'Other'] as const

/* --------------------------------------------------------------- content */
export type ContentStatus = 'scripting' | 'to-shoot' | 'editing' | 'published'

export const CONTENT_STATUSES: { id: ContentStatus; label: string; hint: string }[] = [
  { id: 'scripting', label: 'Scripting', hint: 'Writing the idea out' },
  { id: 'to-shoot', label: 'To Shoot', hint: 'Script locked, camera next' },
  { id: 'editing', label: 'Editing', hint: 'Footage in, cutting it down' },
  { id: 'published', label: 'Published', hint: 'Live and out there' },
]

export interface ContentPiece {
  id: string
  title: string
  status: ContentStatus
  platform: string
  inspirationUrl: string
  script: string
  caption: string
  hashtags: string
  shootDate: string
  editDate: string
  postDate: string
  notes: string
  order: number
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ goals */
export type GoalKind = 'followers' | 'earnings' | 'content' | 'custom'

export const GOAL_KINDS: { id: GoalKind; label: string; unit: string; hint: string }[] = [
  { id: 'followers', label: 'Followers', unit: 'followers', hint: 'Grow an audience on a platform' },
  { id: 'earnings', label: 'Earnings', unit: '', hint: 'Auto-tracked from collected payments' },
  { id: 'content', label: 'Content Output', unit: 'posts', hint: 'Auto-tracked from published pieces' },
  { id: 'custom', label: 'Custom', unit: '', hint: 'Anything you want to move' },
]

export interface GoalCheckpoint {
  date: string
  value: number
}

export interface Goal {
  id: string
  kind: GoalKind
  title: string
  platform: string
  startValue: number
  currentValue: number
  targetValue: number
  unit: string
  startDate: string
  deadline: string
  autoTrack: boolean
  history: GoalCheckpoint[]
  createdAt: string
  updatedAt: string
}

/* --------------------------------------------------------------- settings */
export interface Settings {
  theme: ThemeName
  /** Replaces "Creator OS" in the top-left corner. */
  appName: string
  /** Square data URL shown instead of the default mark. Empty = default. */
  avatar: string
  creatorName: string
  currency: string
  currencySymbol: string
  business: Party
  invoicePrefix: string
  nextInvoiceNumber: number
  defaultDueDays: number
  defaultTemplate: InvoiceTemplate
  defaultThemeColor: string
  defaultGstType: GstType
  defaultGstRate: number
  defaultTerms: string
  defaultBankDetails: string
  templateCategories: string[]
  ideaCategories: string[]
  inspirationCategories: string[]
  onboarded: boolean
}

/* ------------------------------------------------------------------ state */
export interface AppState {
  version: number
  settings: Settings
  templates: Template[]
  deals: Deal[]
  invoices: Invoice[]
  expenses: Expense[]
  otherIncome: OtherIncome[]
  ideas: Idea[]
  inspirations: Inspiration[]
  content: ContentPiece[]
  goals: Goal[]
}

/* --------------------------------------------------- derived transactions */
export type TxKind = 'invoice' | 'income' | 'expense'

export interface Transaction {
  id: string
  kind: TxKind
  date: string
  title: string
  subtitle: string
  amount: number
  collected: boolean
  sourceId: string
}
