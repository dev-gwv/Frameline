import { useCallback, useState } from 'react'
import type { ChipTone } from '@frameline/ui'
import { fmt, STORE_COMMISSION, type Order } from '@frameline/shared'

/*
 * Page-local helpers shared by the Business and Account screens (store, wallet, reports, plan, settings).
 * Kept here because apps/admin/src/lib is lead-owned.
 */

/** Real file download via Blob + anchor. */
export function downloadFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (v: string | number | undefined | null) => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: (string | number | undefined | null)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')
export const downloadCsv = (filename: string, rows: (string | number | undefined | null)[][]) =>
  downloadFile(filename, '﻿' + toCsv(rows), 'text/csv;charset=utf-8')

/** useState persisted to localStorage (per-browser convenience; never throws). */
export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readLocal(key, initial))
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      writeLocal(key, next)
      return next
    })
  }, [key])
  return [value, set]
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback) ? { ...fallback, ...parsed } : parsed
  } catch { return fallback }
}
export function writeLocal<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode or quota */ }
}

/* ---------------- Validation ---------------- */
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const PIN_RE = /^[1-9][0-9]{5}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

/* ---------------- Billing details form shape (stored on Studio.billing, see billing.ts) ---------------- */
export interface Billing { name: string; gstin: string; address: string; state: string; email: string }

/* ---------------- Money & orders ---------------- */
export const GST = 0.18
export const round2 = (n: number) => Math.round(n * 100) / 100

export const ORDER_STATUS: Record<Order['status'], { label: string; tone: ChipTone }> = {
  paid: { label: 'Paid', tone: 'ok' },
  printing: { label: 'Printing', tone: 'accent' },
  refunded: { label: 'Refunded', tone: 'warn' },
  pending: { label: 'Payment pending', tone: 'neutral' },
  'paid-direct': { label: 'Paid direct', tone: 'ok' },
}

/** Split of one order: platform commission (incl. its GST), GST inside the seller's price, and the seller's share. */
export function orderBreakdown(o: Order) {
  const direct = o.status === 'paid-direct'
  const commission = direct ? 0 : round2(o.paid * STORE_COMMISSION)
  const platformGst = round2(commission - commission / (1 + GST))
  const sellerGst = round2(o.paid - o.paid / (1 + GST))
  return { commission, platformGst, sellerGst, share: o.share }
}

export const money = (n: number, currency: Order['currency'] = 'INR', decimals = false) =>
  currency === 'USD' ? `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}` : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`

/* ---------------- Table styling ---------------- */
export const th = 'border-b border-line px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-3 whitespace-nowrap'
export const td = 'border-b border-line px-4 py-2.5 align-middle'

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export function exportOrdersCsv(orders: Order[], name = 'frameline-orders') {
  downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Order', 'Date', 'Buyer', 'Buyer email', 'Payment', 'Event', 'Items', 'Currency', 'Paid', 'Your share', 'Status'],
    ...orders.map((o) => [o.number, fmt.fullDateTime(o.at), o.buyer, o.buyerEmail ?? '', o.method ?? '', o.eventName, o.items, o.currency, o.paid, o.share, ORDER_STATUS[o.status].label]),
  ])
}

