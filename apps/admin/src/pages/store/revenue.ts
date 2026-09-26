import { DEMO_NOW, hash, rng, type Order } from '@frameline/shared'

export interface DayPoint { iso: string; date: Date; revenue: number; orders: number; usd: number }

const DAY = 86_400_000
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * Deterministic daily sales for the last 90 days. The mock API only stores a handful of orders,
 * so a seeded baseline (seeded by those orders) fills the chart and the real orders are added on top.
 */
export function revenueSeries(orders: Order[], days = 90): DayPoint[] {
  const r = rng(hash(orders.map((o) => o.id).join('|') || 'none'))
  const today = new Date(DEMO_NOW)
  today.setHours(12, 0, 0, 0)
  const points: DayPoint[] = []
  const index = new Map<string, DayPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const trend = 1 + (days - i) / days * 0.5
    const n = Math.max(0, Math.round((0.6 + r() * 2.4) * (weekend ? 1.5 : 1) * trend))
    let revenue = 0
    for (let k = 0; k < n; k++) revenue += [149, 447, 999, 399, 258, 1199][Math.floor(r() * 6)]
    const usd = r() < 0.12 ? 12 * (1 + Math.floor(r() * 3)) : 0
    const p: DayPoint = { iso: date.toISOString(), date, revenue, orders: n, usd }
    points.push(p)
    index.set(dayKey(date), p)
  }
  for (const o of orders) {
    if (o.status === 'refunded') continue
    const p = index.get(dayKey(new Date(o.at)))
    if (!p) continue
    if (o.currency === 'USD') p.usd += o.paid
    else { p.revenue += o.paid; p.orders += 1 }
  }
  return points
}

export function monthTotals(points: DayPoint[]) {
  const now = new Date(DEMO_NOW)
  const inMonth = points.filter((p) => p.date.getMonth() === now.getMonth() && p.date.getFullYear() === now.getFullYear())
  return {
    revenue: inMonth.reduce((s, p) => s + p.revenue, 0),
    usd: inMonth.reduce((s, p) => s + p.usd, 0),
    orders: inMonth.reduce((s, p) => s + p.orders, 0),
    monthLabel: now.toLocaleString('en-IN', { month: 'short' }),
  }
}
