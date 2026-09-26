import { useLocalState } from './lib'

/** Something the studio bought from Frameline (plans, packs, credits). */
export interface Purchase {
  id: string
  at: string
  item: string
  kind: 'plan' | 'pack' | 'credits' | 'renewal'
  amount: number // before GST
  gst: number
  paidWith: 'Card' | 'UPI' | 'Wallet credits' | 'Net banking'
  invoice: string
}

/** History before this browser session. The mock API has no purchases endpoint, so it is derived here. */
export const BASE_PURCHASES: Purchase[] = [
  { id: 'pu5', at: '2026-09-21T11:30:00+05:30', item: '3,000-photo pack · Riya & Kabir Wedding', kind: 'pack', amount: 1350, gst: 243, paidWith: 'Wallet credits', invoice: 'FL-2026-0921' },
  { id: 'pu4', at: '2026-03-03T10:12:00+05:30', item: 'Starter yearly · renewal', kind: 'plan', amount: 8490, gst: 1528.2, paidWith: 'UPI', invoice: 'FL-2026-0303' },
  { id: 'pu3', at: '2025-11-14T16:40:00+05:30', item: '1,000-photo pack · Kapoor Engagement', kind: 'pack', amount: 700, gst: 126, paidWith: 'Card', invoice: 'FL-2025-1114' },
  { id: 'pu2', at: '2025-06-02T12:05:00+05:30', item: '1,000-photo pack · Greenfield School', kind: 'pack', amount: 1000, gst: 180, paidWith: 'Card', invoice: 'FL-2025-0602' },
  { id: 'pu1', at: '2025-03-03T09:30:00+05:30', item: 'Starter yearly', kind: 'plan', amount: 8490, gst: 1528.2, paidWith: 'Card', invoice: 'FL-2025-0303' },
]

export const PURCHASES_KEY = 'frameline.purchases'

/** Base history + purchases made on the Plan page in this browser (newest first). */
export function usePurchases() {
  const [extra, setExtra] = useLocalState<Purchase[]>(PURCHASES_KEY, [])
  const all = [...extra, ...BASE_PURCHASES].sort((a, b) => b.at.localeCompare(a.at))
  const add = (p: Omit<Purchase, 'id' | 'invoice' | 'at' | 'gst'> & { gst?: number }) => {
    const at = new Date().toISOString()
    const item: Purchase = { gst: Math.round(p.amount * 0.18 * 100) / 100, ...p, id: `pu_${Date.now()}`, at, invoice: `FL-${at.slice(0, 4)}-${at.slice(5, 7)}${at.slice(8, 10)}-${String(Date.now()).slice(-3)}` }
    setExtra((l) => [item, ...l])
    return item
  }
  return { purchases: all, add }
}
