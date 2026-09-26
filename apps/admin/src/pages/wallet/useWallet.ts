import { useMemo } from 'react'
import { DEMO_NOW, type LedgerEntry } from '@frameline/shared'
import { useLedger } from '../../lib/queries'
import { round2, useLocalState } from './lib'

export interface LocalPayout { id: string; at: string; amount: number }
export const PAYOUTS_KEY = 'frameline.payouts'
export const PAYOUT_DEST = 'HDFC ••4471'

/**
 * Ledger from the API plus payouts requested in this browser (the mock API has no withdraw call yet).
 * Newest first, with a running balance.
 */
export function useWallet() {
  const q = useLedger()
  const [payouts, setPayouts] = useLocalState<LocalPayout[]>(PAYOUTS_KEY, [])
  const ledger = useMemo<LedgerEntry[] | undefined>(() => {
    if (!q.data) return undefined
    const base = [...q.data].sort((a, b) => b.at.localeCompare(a.at))
    let bal = base[0]?.balance ?? 0
    const local = [...payouts].sort((a, b) => a.at.localeCompare(b.at)).map((p) => {
      bal = round2(bal - p.amount)
      return { id: p.id, at: p.at, description: `Payout to ${PAYOUT_DEST} · requested`, type: 'payout' as const, amount: -p.amount, balance: bal }
    })
    return [...local.reverse(), ...base]
  }, [q.data, payouts])
  const balance = ledger?.[0]?.balance ?? 0

  const now = new Date(DEMO_NOW)
  const thisMonth = (iso: string) => { const d = new Date(iso); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }
  const earned = ledger?.filter((l) => (l.type === 'sale' || l.type === 'renewal-markup') && thisMonth(l.at)).reduce((s, l) => s + l.amount, 0) ?? 0
  // Sales are held for 3 days in case of refunds.
  const held = ledger?.filter((l) => l.type === 'sale' && DEMO_NOW - new Date(l.at).getTime() < 3 * 86_400_000) ?? []
  const pending = held.reduce((s, l) => s + l.amount, 0)
  const releaseDays = held.length ? Math.max(1, Math.ceil((Math.min(...held.map((l) => new Date(l.at).getTime())) + 3 * 86_400_000 - DEMO_NOW) / 86_400_000)) : 0

  const withdraw = (amount: number) => setPayouts((l) => [...l, { id: `lp_${Date.now()}`, at: new Date().toISOString(), amount: round2(amount) }])
  return { ...q, ledger, balance, earned: round2(earned), pending: round2(pending), releaseDays, withdraw }
}

export const LEDGER_TYPES: Record<LedgerEntry['type'], { label: string; tone: 'ok' | 'neutral' | 'warn' | 'accent' }> = {
  sale: { label: 'Sale', tone: 'ok' },
  payout: { label: 'Payout', tone: 'neutral' },
  refund: { label: 'Refund', tone: 'warn' },
  'renewal-markup': { label: 'Renewal markup', tone: 'ok' },
  'credits-used': { label: 'Credits used', tone: 'neutral' },
  'credits-added': { label: 'Credits added', tone: 'accent' },
}
