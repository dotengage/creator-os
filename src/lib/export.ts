import { today } from './utils'

/**
 * SheetJS is ~400kB and only needed the moment someone clicks Export, so it is
 * pulled in on demand rather than shipped in the initial bundle.
 */
const sheetjs = () => import('xlsx')

export type Cell = string | number | boolean | null | undefined

export interface Column<T> {
  header: string
  value: (row: T) => Cell
  width?: number
}

export const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const stamp = (base: string, ext: string) => `${base}-${today()}.${ext}`

const cellToText = (v: Cell): string => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCSV<T>(rows: T[], columns: Column<T>[], basename: string) {
  const head = columns.map((c) => cellToText(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => cellToText(c.value(r))).join(','))
  // BOM keeps Excel happy with ₹ and other non-ASCII characters.
  const csv = '﻿' + [head, ...body].join('\r\n')
  download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), stamp(basename, 'csv'))
}

export async function exportXLSX<T>(rows: T[], columns: Column<T>[], basename: string, sheetName = 'Sheet1') {
  const XLSX = await sheetjs()
  const aoa: Cell[][] = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r)))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? Math.max(12, Math.min(42, c.header.length + 6)) }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, stamp(basename, 'xlsx'))
}

/** Multi-sheet workbook — used for the full-backup export. */
export async function exportWorkbook(sheets: { name: string; aoa: Cell[][] }[], basename: string) {
  const XLSX = await sheetjs()
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa)
    const widths = (s.aoa[0] ?? []).map((h) => ({ wch: Math.max(12, Math.min(42, String(h ?? '').length + 6)) }))
    ws['!cols'] = widths
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, stamp(basename, 'xlsx'))
}

export function sheetFrom<T>(rows: T[], columns: Column<T>[]): Cell[][] {
  return [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r)))]
}

export const exportJSON = (data: unknown, basename: string) =>
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), stamp(basename, 'json'))
