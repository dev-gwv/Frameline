/*
 * Page-local file helpers for the tools pages (copied from pages/wallet/lib.ts, owned by D; lib/ is lead-owned).
 */

/** Real file download via Blob + anchor. */
export function downloadFile(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Cell = string | number | undefined | null
const csvCell = (v: Cell) => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')
export const downloadCsv = (filename: string, rows: Cell[][]) => downloadFile(filename, '﻿' + toCsv(rows), 'text/csv;charset=utf-8')

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Table cell styles (no uppercase labels, rule 3). */
export const th = 'border-b border-line px-4 py-2.5 text-left text-[12.5px] font-bold text-ink-3 whitespace-nowrap'
export const td = 'border-b border-line px-4 py-3 align-middle'

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
