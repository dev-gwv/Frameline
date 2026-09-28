import { fmt, STORE_COMMISSION, type LedgerEntry, type Order, type StoreSettings } from '@frameline/shared'
import type { ChipTone } from '@frameline/ui'
import { downloadCsv, round2 } from '../wallet/lib'

/* Page-local helpers for the selling area (lib/ is lead-owned). */

export const ORDER_STATUS: Record<Order['status'], { label: string; tone: ChipTone }> = {
  paid: { label: 'Paid', tone: 'ok' },
  printing: { label: 'Printing', tone: 'accent' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  pending: { label: 'Payment pending', tone: 'warn' },
  'paid-direct': { label: 'Paid to you directly', tone: 'ok' },
}

export const money = (n: number, currency: Order['currency'] = 'INR', decimals = false) =>
  currency === 'USD'
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`
    : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`

export const refundable = (o: Order) => o.status === 'paid' || o.status === 'printing'
export const isPrint = (o: Order) => /print/i.test(o.items) || !!o.shipping

/** Price → Frameline fee → payment fee → what the studio gets (the share is the API's number). */
export function orderBreakdown(o: Order) {
  if (o.status === 'paid-direct') return { price: o.paid, fee: 0, paymentFee: 0, youGet: o.share }
  const fee = round2(o.paid * STORE_COMMISSION)
  // Whatever the share doesn't cover after our fee is the payment provider's cut (0 when the fee includes it).
  const paymentFee = Math.max(0, round2(o.paid - fee - o.share))
  return { price: o.paid, fee, paymentFee, youGet: o.share }
}

/** Money from a sale is held this long (refund window) before it counts as withdrawable in the wallet. */
export const HOLD_DAYS = 3
const DAY = 86_400_000

export function orderStatusNote(o: Order, now = Date.now()) {
  switch (o.status) {
    case 'refunded': return `Refunded${o.refundedAt ? ` on ${fmt.date(o.refundedAt)}` : ''}${o.refundReason ? ` · “${o.refundReason}”` : ''}. The download link no longer works.`
    case 'pending': return 'The buyer started paying but it hasn’t gone through yet. Nothing reaches your wallet until it does.'
    case 'paid-direct': return 'Paid to you directly by a buyer abroad. Frameline takes no fee, so it doesn’t pass through your wallet.'
    default: {
      const at = Date.parse(o.at) + HOLD_DAYS * DAY
      return at <= now ? `In your wallet since ${fmt.date(new Date(at).toISOString())}.` : `Reaches your wallet on ${fmt.date(new Date(at).toISOString())}, after the ${HOLD_DAYS}-day refund window.`
    }
  }
}

export function exportOrdersCsv(orders: Order[], name = 'frameline-orders') {
  downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Order', 'Date', 'Buyer', 'Buyer email', 'Payment', 'Event', 'Items', 'Currency', 'Price', 'You get', 'Status'],
    ...orders.map((o) => [o.number, fmt.fullDateTime(o.at), o.buyer, o.buyerEmail ?? '', o.method ?? '', o.eventName, o.items, o.currency, o.paid, o.share, ORDER_STATUS[o.status].label]),
  ])
}

/* ---------------- Wallet ledger ---------------- */
export const LEDGER_TYPES: Record<LedgerEntry['type'], { label: string; tone: ChipTone }> = {
  sale: { label: 'Sale', tone: 'ok' },
  payout: { label: 'Payout', tone: 'neutral' },
  refund: { label: 'Refund', tone: 'warn' },
  'renewal-markup': { label: 'Renewal markup', tone: 'ok' },
  'credits-used': { label: 'Paid from wallet', tone: 'neutral' },
  'credits-added': { label: 'Money added', tone: 'accent' },
}
export type LedgerFilter = 'all' | 'in' | 'sale' | 'payout' | 'refund' | 'renewal-markup' | 'spent'
export const LEDGER_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'in', label: 'Money in' }, { value: 'sale', label: 'Sales' }, { value: 'payout', label: 'Payouts' },
  { value: 'refund', label: 'Refunds' }, { value: 'renewal-markup', label: 'Renewals' }, { value: 'spent', label: 'Spent' },
]
export const ledgerMatches = (f: LedgerFilter, l: LedgerEntry) =>
  f === 'all' || (f === 'in' ? l.amount > 0 : f === 'spent' ? l.type === 'credits-used' : l.type === f)

export function exportLedgerCsv(rows: LedgerEntry[]) {
  downloadCsv(`wallet-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Date & time', 'Description', 'Type', 'Amount (INR)'],
    ...rows.map((l) => [fmt.fullDateTime(l.at), l.description, LEDGER_TYPES[l.type].label, l.amount.toFixed(2)]),
  ])
}

/* ---------------- Selling set-up ---------------- */
export function setupState(s: StoreSettings | undefined, sellingEvents: number) {
  const k = s?.kyc
  const business = !!k && !!k.legalName.trim() && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(k.pan) && !!k.address.street && !!k.address.city && !!k.address.state && !!k.address.postal
  const payout = !!s?.payout.accountLast4
  const prices = sellingEvents > 0
  return { business, payout, prices, live: business && payout && prices, done: [business, payout, prices].filter(Boolean).length }
}

/** Payout account state for the UI, from the API's ₹1 check (StoreSettings.payout.check). */
export type PayoutState = 'none' | 'checking' | 'verified' | 'mismatch' | 'failed'
export function payoutState(s: StoreSettings | undefined): PayoutState {
  if (!s?.payout.accountLast4) return 'none'
  const c = s.payout.check
  if (c?.status === 'name_mismatch') return 'mismatch'
  if (c?.status === 'failed') return 'failed'
  if (s.payout.verified || c?.status === 'verified') return 'verified'
  return 'checking'
}
