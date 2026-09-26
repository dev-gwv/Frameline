import { useMemo } from 'react'
import { DEMO_NOW, type LedgerEntry, type Purchase } from '@frameline/shared'
import { useLedger, useStoreSettings } from '../../lib/queries'
import { round2 } from './lib'

/** Ledger from the API (newest first). `balance` is the payout balance on the newest line. */
export function useWallet() {
  const q = useLedger()
  const store = useStoreSettings()
  const ledger = useMemo<LedgerEntry[] | undefined>(() => q.data && [...q.data].sort((a, b) => b.at.localeCompare(a.at)), [q.data])
  const balance = ledger?.[0]?.balance ?? 0

  const now = Math.max(Date.now(), DEMO_NOW)
  const today = new Date(now)
  const thisMonth = (iso: string) => { const d = new Date(iso); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() }
  const earned = ledger?.filter((l) => (l.type === 'sale' || l.type === 'renewal-markup') && thisMonth(l.at)).reduce((s, l) => s + l.amount, 0) ?? 0
  // Sales are held for 3 days in case of refunds.
  const held = ledger?.filter((l) => l.type === 'sale' && now - new Date(l.at).getTime() < 3 * 86_400_000) ?? []
  const pending = held.reduce((s, l) => s + l.amount, 0)
  const releaseDays = held.length ? Math.max(1, Math.ceil((Math.min(...held.map((l) => new Date(l.at).getTime())) + 3 * 86_400_000 - now) / 86_400_000)) : 0

  const payout = store.data?.payout
  const destination = payout?.accountLast4 ? `${payout.bank || 'Bank'} ••${payout.accountLast4}` : 'No bank account yet'
  return { ...q, ledger, balance, earned: round2(earned), pending: round2(pending), releaseDays, payout, destination }
}

/** GST on a Frameline purchase: 18% on card/UPI payments; none on coupons, and none on credits (GST was charged when the credits were bought). */
export const purchaseGst = (p: Purchase) => (p.method === 'card' || p.method === 'upi' ? round2(p.amount * 0.18) : 0)
export const PURCHASE_METHOD: Record<Purchase['method'], string> = { card: 'Card', upi: 'UPI', credits: 'Wallet credits', coupon: 'Coupon' }

export const LEDGER_TYPES: Record<LedgerEntry['type'], { label: string; tone: 'ok' | 'neutral' | 'warn' | 'accent' }> = {
  sale: { label: 'Sale', tone: 'ok' },
  payout: { label: 'Payout', tone: 'neutral' },
  refund: { label: 'Refund', tone: 'warn' },
  'renewal-markup': { label: 'Renewal markup', tone: 'ok' },
  'credits-used': { label: 'Credits used', tone: 'neutral' },
  'credits-added': { label: 'Credits added', tone: 'accent' },
}
