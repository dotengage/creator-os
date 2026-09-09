import type { jsPDF } from 'jspdf'
import type { Invoice } from '../types'

/** jsPDF (plus its html2canvas/dompurify friends) loads only when a PDF is asked for. */
const pdfLib = async () => (await import('jspdf')).jsPDF
import { fmtDate, invoiceTotals } from '../utils'

/* ------------------------------------------------------------------ utils */
type RGB = [number, number, number]

const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length !== 6) return [79, 70, 229]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (c: RGB, white: number): RGB =>
  c.map((v) => Math.round(v + (255 - v) * white)) as RGB

const luminance = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
const readableOn = (c: RGB): RGB => (luminance(c) > 0.62 ? [26, 26, 30] : [255, 255, 255])

/**
 * jsPDF core fonts use WinAnsi, which has no rupee glyph. Swap it for a
 * text equivalent so totals never render as garbage.
 */
const safeSymbol = (symbol: string): string => {
  const map: Record<string, string> = { '₹': 'Rs.', '₨': 'Rs.', '₩': 'W', '₺': 'TL', '₴': 'UAH', '₦': 'NGN', '₱': 'PHP', '฿': 'THB' }
  return map[symbol] ?? symbol
}

const money = (n: number, symbol: string) => {
  const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}${safeSymbol(symbol)}${s}`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const twoDigits = (n: number): string =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`

/** Indian numbering (lakh / crore) — matches how invoices read locally. */
export const amountInWords = (amount: number, currency = 'INR'): string => {
  const n = Math.floor(Math.abs(amount))
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const hundred = Math.floor((n % 1000) / 100)
  const rest = n % 100
  if (crore) parts.push(`${twoDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (hundred) parts.push(`${ONES[hundred]} Hundred`)
  if (rest) parts.push(`${parts.length ? 'and ' : ''}${twoDigits(rest)}`)
  const unit = currency === 'INR' ? 'Rupees' : currency
  const paise = Math.round((Math.abs(amount) - n) * 100)
  const tail = paise ? ` and ${twoDigits(paise)} Paise` : ''
  return `${unit} ${parts.join(' ')}${tail} Only`
}

/* -------------------------------------------------------------- rendering */
const M = 16 // page margin, mm
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - M * 2

interface Ctx {
  doc: jsPDF
  inv: Invoice
  accent: RGB
  symbol: string
  serif: boolean
}

const setInk = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2])
const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2])
const setStroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

const INK: RGB = [26, 26, 30]
const MUTED: RGB = [122, 122, 134]
const LINE: RGB = [222, 222, 230]

const font = (ctx: Ctx, style: 'normal' | 'bold' | 'italic' = 'normal') =>
  ctx.doc.setFont(ctx.serif ? 'times' : 'helvetica', style)

/** Multi-line block; returns the y after the block. */
const block = (ctx: Ctx, lines: string[], x: number, y: number, w: number, size: number, lead = 1.35): number => {
  const { doc } = ctx
  doc.setFontSize(size)
  let cy = y
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, w) as string[]
    for (const wl of wrapped) {
      doc.text(wl, x, cy)
      cy += size * 0.3528 * lead
    }
  }
  return cy
}

const partyLines = (p: { name: string; address: string; gstin: string; email: string; phone: string }): string[] => {
  const out: string[] = []
  if (p.address) out.push(...p.address.split('\n').filter(Boolean))
  if (p.gstin) out.push(`GSTIN: ${p.gstin}`)
  if (p.email) out.push(p.email)
  if (p.phone) out.push(p.phone)
  return out
}

/* --------------------------------------------------------------- template */
export async function buildInvoicePDF(inv: Invoice, currencySymbol = '₹'): Promise<jsPDF> {
  const JsPDF = await pdfLib()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const accent = hexToRgb(inv.themeColor || '#4f46e5')
  const ctx: Ctx = { doc, inv, accent, symbol: currencySymbol, serif: inv.template === 'classic' }
  const t = invoiceTotals(inv)

  doc.setProperties({
    title: `Invoice ${inv.number}`,
    subject: `Invoice for ${inv.to.name}`,
    author: inv.from.name || 'Creator OS',
    creator: 'Creator OS',
  })

  let y = header(ctx)
  y = parties(ctx, y)
  y = itemsTable(ctx, y)
  y = totalsBlock(ctx, y, t)
  footer(ctx, y, t)

  return doc
}

/* ------------------------------------------------------------ 1. header */
function header(ctx: Ctx): number {
  const { doc, inv, accent } = ctx
  const tpl = inv.template

  if (tpl === 'modern') {
    setFill(doc, accent)
    doc.rect(0, 0, PAGE_W, 44, 'F')
    const on = readableOn(accent)

    font(ctx, 'bold')
    doc.setFontSize(26)
    setInk(doc, on)
    doc.text('INVOICE', M, 22)

    font(ctx, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(on[0], on[1], on[2])
    doc.text(inv.number, M, 30)

    // right-aligned issuer identity
    font(ctx, 'bold')
    doc.setFontSize(13)
    doc.text(inv.from.name || 'Your Studio', PAGE_W - M, 19, { align: 'right' })
    font(ctx, 'normal')
    doc.setFontSize(8.5)
    const lines = partyLines(inv.from).slice(0, 3)
    let ly = 25
    for (const l of lines) {
      doc.text(l, PAGE_W - M, ly, { align: 'right' })
      ly += 4
    }
    return 56
  }

  if (tpl === 'classic') {
    font(ctx, 'bold')
    doc.setFontSize(20)
    setInk(doc, INK)
    doc.text((inv.from.name || 'Your Studio').toUpperCase(), PAGE_W / 2, 22, { align: 'center' })

    font(ctx, 'normal')
    doc.setFontSize(9)
    setInk(doc, MUTED)
    const meta = partyLines(inv.from).join('  •  ')
    doc.text(doc.splitTextToSize(meta, CONTENT_W) as string[], PAGE_W / 2, 28, { align: 'center' })

    setStroke(doc, accent)
    doc.setLineWidth(0.9)
    doc.line(M, 38, PAGE_W - M, 38)
    doc.setLineWidth(0.25)
    doc.line(M, 39.6, PAGE_W - M, 39.6)

    font(ctx, 'bold')
    doc.setFontSize(13)
    setInk(doc, INK)
    doc.text('INVOICE', PAGE_W / 2, 48, { align: 'center' })
    return 58
  }

  // minimal
  font(ctx, 'bold')
  doc.setFontSize(11)
  setInk(doc, INK)
  doc.text(inv.from.name || 'Your Studio', M, 24)

  font(ctx, 'normal')
  doc.setFontSize(28)
  setInk(doc, accent)
  doc.text('Invoice', PAGE_W - M, 26, { align: 'right' })

  setStroke(doc, LINE)
  doc.setLineWidth(0.3)
  doc.line(M, 34, PAGE_W - M, 34)
  return 46
}

/* ------------------------------------------------------------ 2. parties */
function parties(ctx: Ctx, y: number): number {
  const { doc, inv, accent } = ctx
  const colW = (CONTENT_W - 10) / 2
  const rightX = M + colW + 10
  const soft = mix(accent, 0.9)

  const heading = (text: string, x: number, cy: number) => {
    font(ctx, 'bold')
    doc.setFontSize(7.5)
    setInk(doc, MUTED)
    doc.text(text.toUpperCase(), x, cy)
  }

  if (inv.template === 'minimal') {
    heading('Billed to', M, y)
    heading('Details', rightX, y)
  } else {
    setFill(doc, soft)
    doc.roundedRect(M, y - 5, colW, 8, 1.5, 1.5, 'F')
    doc.roundedRect(rightX, y - 5, colW, 8, 1.5, 1.5, 'F')
    heading('Billed to', M + 3, y)
    heading('Invoice details', rightX + 3, y)
  }

  const padX = inv.template === 'minimal' ? 0 : 3
  let ly = y + 7

  font(ctx, 'bold')
  doc.setFontSize(11)
  setInk(doc, INK)
  doc.text(inv.to.name || 'Client name', M + padX, ly)
  ly += 5

  font(ctx, 'normal')
  setInk(doc, MUTED)
  const leftEnd = block(ctx, partyLines(inv.to), M + padX, ly, colW - padX * 2, 8.5)

  // right column: dates + issuer GSTIN
  let ry = y + 7
  const rows: [string, string][] = [
    ['Invoice no.', inv.number],
    ['Invoice date', fmtDate(inv.date)],
    ['Due date', fmtDate(inv.dueDate)],
  ]
  if (inv.from.gstin) rows.push(['Your GSTIN', inv.from.gstin])
  if (inv.to.gstin) rows.push(['Client GSTIN', inv.to.gstin])

  doc.setFontSize(8.5)
  for (const [k, v] of rows) {
    font(ctx, 'normal')
    setInk(doc, MUTED)
    doc.text(k, rightX + padX, ry)
    font(ctx, 'bold')
    setInk(doc, INK)
    doc.text(v || '—', rightX + colW - padX, ry, { align: 'right' })
    ry += 5.2
  }

  return Math.max(leftEnd, ry) + 8
}

/* -------------------------------------------------------------- 3. items */
function itemsTable(ctx: Ctx, y: number): number {
  const { doc, inv, accent } = ctx
  const tpl = inv.template
  const cols = { desc: M, qty: M + CONTENT_W - 74, rate: M + CONTENT_W - 46, amt: M + CONTENT_W }
  const headH = 9

  const drawHead = (cy: number): number => {
    if (tpl === 'modern') {
      setFill(doc, accent)
      doc.roundedRect(M, cy, CONTENT_W, headH, 1.5, 1.5, 'F')
      setInk(doc, readableOn(accent))
    } else if (tpl === 'classic') {
      setFill(doc, mix(accent, 0.88))
      doc.rect(M, cy, CONTENT_W, headH, 'F')
      setInk(doc, INK)
    } else {
      setStroke(doc, LINE)
      doc.setLineWidth(0.3)
      doc.line(M, cy + headH, M + CONTENT_W, cy + headH)
      setInk(doc, MUTED)
    }
    font(ctx, 'bold')
    doc.setFontSize(8)
    const ty = cy + 6
    doc.text('DESCRIPTION', cols.desc + (tpl === 'minimal' ? 0 : 3), ty)
    doc.text('QTY', cols.qty, ty, { align: 'right' })
    doc.text('RATE', cols.rate, ty, { align: 'right' })
    doc.text('AMOUNT', cols.amt - (tpl === 'minimal' ? 0 : 3), ty, { align: 'right' })
    return cy + headH + 6
  }

  let cy = drawHead(y)
  const items = inv.items.length ? inv.items : [{ id: 'x', description: '—', qty: 0, rate: 0 }]

  items.forEach((it, i) => {
    // splitTextToSize measures with the *current* font, so set the row font
    // before wrapping — otherwise long descriptions run into the QTY column.
    font(ctx, 'normal')
    doc.setFontSize(9.5)
    const descLines = doc.splitTextToSize(it.description || '—', CONTENT_W - 88) as string[]
    const rowH = Math.max(8, descLines.length * 4.2 + 3.5)

    if (cy + rowH > PAGE_H - 60) {
      doc.addPage()
      cy = drawHead(M + 6)
    }

    if (tpl === 'modern' && i % 2 === 1) {
      setFill(doc, [249, 249, 251])
      doc.rect(M, cy - 4.5, CONTENT_W, rowH, 'F')
    }

    font(ctx, 'normal')
    doc.setFontSize(9.5)
    setInk(doc, INK)
    let dy = cy
    for (const l of descLines) {
      doc.text(l, cols.desc + (tpl === 'minimal' ? 0 : 3), dy)
      dy += 4.2
    }
    doc.text(String(it.qty ?? 0), cols.qty, cy, { align: 'right' })
    doc.text(money(it.rate ?? 0, ctx.symbol), cols.rate, cy, { align: 'right' })
    font(ctx, 'bold')
    doc.text(money((it.qty || 0) * (it.rate || 0), ctx.symbol), cols.amt - (tpl === 'minimal' ? 0 : 3), cy, { align: 'right' })

    cy += rowH

    if (tpl !== 'modern') {
      setStroke(doc, LINE)
      doc.setLineWidth(0.2)
      doc.line(M, cy - 4, M + CONTENT_W, cy - 4)
    }
  })

  return cy + 4
}

/* ------------------------------------------------------------- 4. totals */
function totalsBlock(ctx: Ctx, y: number, t: ReturnType<typeof invoiceTotals>): number {
  const { doc, inv, accent } = ctx
  const boxW = 84
  const x = M + CONTENT_W - boxW

  const rows: [string, string][] = [['Subtotal', money(t.subtotal, ctx.symbol)]]
  if (t.discount) rows.push(['Discount', `- ${money(t.discount, ctx.symbol)}`])
  if (inv.gstType === 'cgst_sgst') {
    rows.push([`CGST @ ${t.taxRate / 2}%`, money(t.cgst, ctx.symbol)])
    rows.push([`SGST @ ${t.taxRate / 2}%`, money(t.sgst, ctx.symbol)])
  } else if (inv.gstType === 'igst') {
    rows.push([`IGST @ ${t.taxRate}%`, money(t.igst, ctx.symbol)])
  }

  let cy = y + 4
  if (cy + rows.length * 6 + 30 > PAGE_H - 30) {
    doc.addPage()
    cy = M + 10
  }

  doc.setFontSize(9)
  for (const [k, v] of rows) {
    font(ctx, 'normal')
    setInk(doc, MUTED)
    doc.text(k, x, cy)
    setInk(doc, INK)
    doc.text(v, M + CONTENT_W, cy, { align: 'right' })
    cy += 6
  }

  cy += 1
  const on = readableOn(accent)
  if (inv.template === 'minimal') {
    setStroke(doc, accent)
    doc.setLineWidth(0.6)
    doc.line(x, cy - 1, M + CONTENT_W, cy - 1)
    cy += 6
    font(ctx, 'bold')
    doc.setFontSize(12)
    setInk(doc, INK)
    doc.text('Total due', x, cy)
    setInk(doc, accent)
    doc.text(money(t.total, ctx.symbol), M + CONTENT_W, cy, { align: 'right' })
    cy += 8
  } else {
    setFill(doc, accent)
    doc.roundedRect(x, cy, boxW, 13, 2, 2, 'F')
    font(ctx, 'bold')
    doc.setFontSize(10)
    setInk(doc, on)
    doc.text('TOTAL DUE', x + 4, cy + 8.4)
    doc.setFontSize(12)
    doc.text(money(t.total, ctx.symbol), M + CONTENT_W - 4, cy + 8.4, { align: 'right' })
    cy += 19
  }

  // amount in words, left of the totals column
  font(ctx, 'italic')
  doc.setFontSize(8)
  setInk(doc, MUTED)
  const words = amountInWords(t.total, inv.currency || 'INR')
  doc.text(doc.splitTextToSize(`Amount in words: ${words}`, CONTENT_W - boxW - 6) as string[], M, y + 8)

  return cy + 4
}

/* ------------------------------------------------------------- 5. footer */
function footer(ctx: Ctx, y: number, _t: ReturnType<typeof invoiceTotals>) {
  const { doc, inv, accent } = ctx
  let cy = Math.max(y, PAGE_H - 74)
  if (y > PAGE_H - 70) {
    doc.addPage()
    cy = M + 10
  }

  setStroke(doc, LINE)
  doc.setLineWidth(0.25)
  doc.line(M, cy, PAGE_W - M, cy)
  cy += 8

  const colW = (CONTENT_W - 10) / 2
  const sections: [string, string][] = []
  if (inv.bankDetails) sections.push(['Payment details', inv.bankDetails])
  if (inv.terms) sections.push(['Terms', inv.terms])
  if (inv.notes) sections.push(['Notes', inv.notes])

  let col = 0
  let maxY = cy
  for (const [title, body] of sections) {
    const x = M + col * (colW + 10)
    let sy = cy
    ctx.doc.setFont(ctx.serif ? 'times' : 'helvetica', 'bold')
    doc.setFontSize(7.5)
    setInk(doc, MUTED)
    doc.text(title.toUpperCase(), x, sy)
    sy += 4.5
    ctx.doc.setFont(ctx.serif ? 'times' : 'helvetica', 'normal')
    setInk(doc, INK)
    sy = block(ctx, body.split('\n'), x, sy, colW, 8.2)
    maxY = Math.max(maxY, sy)
    col = (col + 1) % 2
    if (col === 0) cy = maxY + 5
  }

  // page numbers + signature line
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    ctx.doc.setFont(ctx.serif ? 'times' : 'helvetica', 'normal')
    doc.setFontSize(7.5)
    setInk(doc, MUTED)
    doc.text(`${inv.number}`, M, PAGE_H - 10)
    if (pages > 1) doc.text(`Page ${p} of ${pages}`, PAGE_W / 2, PAGE_H - 10, { align: 'center' })
    doc.text(inv.from.name || '', PAGE_W - M, PAGE_H - 10, { align: 'right' })
    setFill(doc, accent)
    doc.rect(0, PAGE_H - 3.5, PAGE_W, 3.5, 'F')
  }
}

/* ------------------------------------------------------------------ entry */
export const invoiceFilename = (inv: Invoice) =>
  `${inv.number.replace(/[^\w.-]+/g, '-')}${inv.to.name ? '-' + inv.to.name.replace(/[^\w]+/g, '-') : ''}.pdf`

export async function downloadInvoicePDF(inv: Invoice, symbol = '₹') {
  const doc = await buildInvoicePDF(inv, symbol)
  doc.save(invoiceFilename(inv))
}

export async function invoicePreviewURL(inv: Invoice, symbol = '₹'): Promise<string> {
  const doc = await buildInvoicePDF(inv, symbol)
  return doc.output('bloburl') as unknown as string
}
