import { DEMO_NOW, type LedgerEntry, type Order } from '@frameline/shared'

export interface DayPoint { iso: string; date: Date; revenue: number; orders: number; usd: number; /** 7-day moving average of revenue (for the trend line). */ avg: number }

const DAY = 86_400_000
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** Orders that count as money in: paid, printing and paid-direct (refunded and pending don't). */
export const counts = (o: Order) => o.status === 'paid' || o.status === 'printing' || o.status === 'paid-direct'

/** "Today" for the store: the later of the real clock, the demo clock and the newest order. */
export function storeNow(orders: Order[] = []) {
  return Math.max(Date.now(), DEMO_NOW, ...orders.map((o) => Date.parse(o.at)))
}

/** Daily totals of real orders for the last `days` days (days without sales are zero). */
export function revenueSeries(orders: Order[], days = 90): DayPoint[] {
  const today = new Date(storeNow(orders))
  today.setHours(12, 0, 0, 0)
  const points: DayPoint[] = []
  const index = new Map<string, DayPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY)
    const p: DayPoint = { iso: date.toISOString(), date, revenue: 0, orders: 0, usd: 0, avg: 0 }
    points.push(p)
    index.set(dayKey(date), p)
  }
  for (const o of orders) {
    if (!counts(o)) continue
    const p = index.get(dayKey(new Date(o.at)))
    if (!p) continue
    if (o.currency === 'USD') p.usd += o.paid
    else { p.revenue += o.paid; p.orders += 1 }
  }
  points.forEach((p, i) => {
    const win = points.slice(Math.max(0, i - 6), i + 1)
    p.avg = win.reduce((s, x) => s + x.revenue, 0) / win.length
  })
  return points
}

/** This month's totals from orders (gross) and the ledger (what you actually earned). */
export function monthTotals(orders: Order[], ledger: LedgerEntry[] = []) {
  const now = new Date(storeNow(orders))
  const inMonth = (iso: string) => { const d = new Date(iso); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }
  const month = orders.filter((o) => inMonth(o.at))
  const paid = month.filter(counts)
  return {
    revenue: paid.filter((o) => o.currency === 'INR').reduce((s, o) => s + o.paid, 0),
    usd: paid.filter((o) => o.currency === 'USD').reduce((s, o) => s + o.paid, 0),
    orders: paid.length,
    earned: Math.round(ledger.filter((l) => inMonth(l.at) && (l.type === 'sale' || l.type === 'renewal-markup' || l.type === 'refund')).reduce((s, l) => s + l.amount, 0) * 100) / 100,
    monthLabel: now.toLocaleString('en-IN', { month: 'short' }),
  }
}
