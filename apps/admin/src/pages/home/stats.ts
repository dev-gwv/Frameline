import { DEMO_NOW, fmt, type Order, type PhotoEvent, type Studio, type Website, type WatermarkSettings } from '@frameline/shared'

/** Month boundaries for "this month" relative to demo time. */
const monthStart = (offset = 0) => {
  const d = new Date(DEMO_NOW)
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime()
}
const inMonth = (iso: string, offset = 0) => {
  const t = new Date(iso).getTime()
  return t >= monthStart(offset) && t < monthStart(offset + 1)
}
export const monthLabel = (offset = 0) => new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(monthStart(offset)))

const visitsOf = (e: PhotoEvent) => e.visits.web + e.visits.android + e.visits.ios
const isRevenue = (o: Order) => o.currency === 'INR' && o.status !== 'refunded' && o.status !== 'pending'

/** Cumulative series across the month so far, in 7 buckets (for a sparkline). */
function cumulative<T>(items: T[], at: (x: T) => string, value: (x: T) => number) {
  const start = monthStart()
  const span = Math.max(1, DEMO_NOW - start)
  const buckets = Array.from({ length: 7 }, (_, i) => start + (span * (i + 1)) / 7)
  return buckets.map((end) => items.filter((x) => new Date(at(x)).getTime() <= end).reduce((s, x) => s + value(x), 0))
}

export interface MonthStat { label: string; value: string; spark: number[]; trend?: string; sub?: string }

export function monthStats(events: PhotoEvent[], orders: Order[]): MonthStat[] {
  const cur = events.filter((e) => inMonth(e.date))
  const prev = events.filter((e) => inMonth(e.date, -1))
  const curOrders = orders.filter((o) => inMonth(o.at) && isRevenue(o))
  const prevOrders = orders.filter((o) => inMonth(o.at, -1) && isRevenue(o))
  const m = monthLabel(), pm = monthLabel(-1)

  const compare = (now: number, before: number, money = false) => {
    if (before > 0 && now >= before) return { trend: `+${Math.round(((now - before) / before) * 100)}% vs ${pm}` }
    return { sub: before > 0 ? `${money ? fmt.rupees(before) : fmt.count(before)} in ${pm}` : `First month with data` }
  }

  const photos = cur.reduce((s, e) => s + e.photoCount, 0)
  const visits = cur.reduce((s, e) => s + visitsOf(e), 0)
  const faces = cur.reduce((s, e) => s + e.faceMatches, 0)
  const revenue = curOrders.reduce((s, o) => s + o.paid, 0)

  return [
    { label: `Photos delivered · ${m}`, value: fmt.count(photos), spark: cumulative(cur, (e) => e.date, (e) => e.photoCount), ...compare(photos, prev.reduce((s, e) => s + e.photoCount, 0)) },
    { label: `Gallery visits · ${m}`, value: fmt.count(visits), spark: cumulative(cur, (e) => e.date, visitsOf), ...compare(visits, prev.reduce((s, e) => s + visitsOf(e), 0)) },
    { label: `Face searches · ${m}`, value: fmt.count(faces), spark: cumulative(cur, (e) => e.date, (e) => e.faceMatches), ...compare(faces, prev.reduce((s, e) => s + e.faceMatches, 0)) },
    { label: `Store revenue · ${m}`, value: fmt.rupees(revenue), spark: cumulative(curOrders, (o) => o.at, (o) => o.paid), ...compare(revenue, prevOrders.reduce((s, o) => s + o.paid, 0), true) },
  ]
}

/** Events that need renewing soon (status expiring, or validity ends within 10 days). */
export function expiringEvents(events: PhotoEvent[]) {
  return events
    .filter((e) => e.status !== 'archived' && (e.status === 'expiring' || fmt.daysUntil(e.expiresAt, DEMO_NOW) <= 10))
    .map((e) => ({ event: e, days: Math.max(0, fmt.daysUntil(e.expiresAt, DEMO_NOW)) }))
    .sort((a, b) => a.days - b.days)
}

/** Face data is kept for 45 days after the event unless extended (simulated retention rule). */
export const FACE_RETENTION_DAYS = 45
export function expiringFaceData(events: PhotoEvent[]) {
  return events
    .filter((e) => e.status !== 'archived' && e.settings.faceSearch && e.photoCount > 0)
    .map((e) => ({ event: e, days: fmt.daysUntil(new Date(new Date(e.date).getTime() + FACE_RETENTION_DAYS * 86_400_000).toISOString(), DEMO_NOW) }))
    .filter((x) => x.days >= 0 && x.days <= 10)
}

export interface ChecklistItem { label: string; done: boolean; to: string }
export function setupChecklist(studio?: Studio, events?: PhotoEvent[], watermark?: WatermarkSettings, website?: Website): ChecklistItem[] {
  return [
    { label: 'Add studio name', done: !!studio?.name?.trim(), to: '/settings/profile' },
    { label: 'Upload logo', done: !!studio?.logoUrl, to: '/settings/profile' },
    { label: 'Create first event', done: (events?.length ?? 0) > 0, to: '/events?new=1' },
    { label: 'Set a watermark', done: !!watermark && (watermark.mode === 'logo' || !!watermark.text.trim()) && watermark.applyTo.previews, to: '/watermarks' },
    { label: 'Publish your website', done: !!website?.published, to: '/website' },
  ]
}

export function greeting(now = DEMO_NOW) {
  const h = new Date(now).getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
export const longDay = (now = DEMO_NOW) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(now))
