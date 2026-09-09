import type { jsPDF } from 'jspdf'
import { fmtDate } from '../utils'

const pdfLib = async () => (await import('jspdf')).jsPDF

const M = 18
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - M * 2

export interface DocSection {
  title: string
  body: string
  /** Render as a soft callout block rather than plain paragraphs. */
  boxed?: boolean
}

export interface DocSpec {
  title: string
  subtitle?: string
  meta?: [string, string][]
  sections: DocSection[]
  accent?: string
  footer?: string
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = (hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length !== 6) return [79, 70, 229]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * A clean, typographic one-pager used for scripts, SOP docs and idea dumps.
 * Flows onto extra pages only when the content genuinely needs them.
 */
export async function buildDocPDF(spec: DocSpec): Promise<jsPDF> {
  const JsPDF = await pdfLib()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const accent = hexToRgb(spec.accent || '#4f46e5')
  const INK: [number, number, number] = [24, 24, 28]
  const MUTED: [number, number, number] = [120, 120, 132]

  doc.setProperties({ title: spec.title, creator: 'Creator OS' })

  let y = M + 4

  // accent rule
  doc.setFillColor(...accent)
  doc.rect(M, y - 6, 26, 1.6, 'F')
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  const titleLines = doc.splitTextToSize(spec.title || 'Untitled', CONTENT_W) as string[]
  for (const l of titleLines) {
    doc.text(l, M, y)
    y += 8
  }

  if (spec.subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(spec.subtitle, CONTENT_W) as string[], M, y)
    y += 6
  }

  if (spec.meta?.length) {
    y += 1
    doc.setFontSize(8.5)
    let x = M
    for (const [k, v] of spec.meta) {
      if (!v) continue
      const text = `${k}: ${v}`
      const w = doc.getTextWidth(text) + 8
      if (x + w > M + CONTENT_W) {
        x = M
        y += 6
      }
      doc.setFillColor(246, 246, 249)
      doc.roundedRect(x, y - 3.6, w - 3, 6, 1.5, 1.5, 'F')
      doc.setTextColor(...MUTED)
      doc.setFont('helvetica', 'normal')
      doc.text(text, x + 2.5, y)
      x += w
    }
    y += 8
  }

  doc.setDrawColor(228, 228, 235)
  doc.setLineWidth(0.25)
  doc.line(M, y - 2, PAGE_W - M, y - 2)
  y += 8

  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - M - 8) {
      doc.addPage()
      y = M + 6
    }
  }

  for (const s of spec.sections) {
    if (!s.body?.trim() && !s.title) continue
    ensure(16)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...accent)
    doc.text(s.title.toUpperCase(), M, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)

    const body = (s.body || '—').replace(/\r/g, '')
    const paragraphs = body.split('\n')

    if (s.boxed) {
      const lines = paragraphs.flatMap((p) => (p ? (doc.splitTextToSize(p, CONTENT_W - 10) as string[]) : ['']))
      const h = lines.length * 5 + 8
      ensure(h)
      doc.setFillColor(248, 248, 251)
      doc.roundedRect(M, y - 5, CONTENT_W, h, 2, 2, 'F')
      let by = y + 1
      for (const l of lines) {
        if (by > PAGE_H - M - 8) {
          doc.addPage()
          y = M + 6
          by = y
        }
        doc.text(l, M + 5, by)
        by += 5
      }
      y = by + 8
    } else {
      for (const p of paragraphs) {
        if (!p.trim()) {
          y += 3.5
          continue
        }
        const lines = doc.splitTextToSize(p, CONTENT_W) as string[]
        for (const l of lines) {
          ensure(6)
          doc.text(l, M, y)
          y += 5.2
        }
      }
      y += 7
    }
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(spec.footer || `Generated ${fmtDate(new Date().toISOString().slice(0, 10))}`, M, PAGE_H - 10)
    if (pages > 1) doc.text(`${p} / ${pages}`, PAGE_W - M, PAGE_H - 10, { align: 'right' })
  }

  return doc
}

export const safeFilename = (s: string, ext = 'pdf') =>
  `${(s || 'document').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document'}.${ext}`

export const downloadDocPDF = async (spec: DocSpec) => {
  const doc = await buildDocPDF(spec)
  doc.save(safeFilename(spec.title))
}
