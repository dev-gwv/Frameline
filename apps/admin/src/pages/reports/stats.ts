import { DEMO_NOW, fmt, type PhotoEvent, type StudioStats } from '@frameline/shared'

/* "This month" numbers for Reports: the totals come from api.getStudioStats(); this file only words them. */

const monthStart = (offset = 0) => {
  const d = new Date(DEMO_NOW)
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime()
}
const inMonth = (iso: string, offset = 0) => {
  const t = new Date(iso).getTime()
  return t >= monthStart(offset) && t < monthStart(offset + 1)
}
export const monthLabel = (offset = 0) => new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date(monthStart(offset)))

export interface MonthStat { label: string; value: string; sub: string }

const prevLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date(y, m - 2, 1))
}

/** The four "this month" tiles from the API's studio totals (this month vs the month before). */
export function monthStats(s: StudioStats): MonthStat[] {
  const pm = prevLabel(s.month)
  const compare = (now: number, before: number, show: (n: number) => string) =>
    before > 0 ? (now >= before ? `Up ${Math.round(((now - before) / before) * 100)}% on ${pm}` : `${show(before)} in ${pm}`) : `Nothing in ${pm}`
  const t = s.thisMonth, l = s.lastMonth
  return [
    { label: 'Gallery visits', value: fmt.count(t.visits), sub: compare(t.visits, l.visits, fmt.count) },
    { label: 'Downloads', value: fmt.count(t.downloads), sub: compare(t.downloads, l.downloads, fmt.count) },
    { label: 'Face searches', value: fmt.count(t.faceSearches), sub: compare(t.faceSearches, l.faceSearches, fmt.count) },
    { label: 'Photo sales', value: fmt.rupees(t.sales), sub: compare(t.sales, l.sales, fmt.rupees) },
  ]
}

/** "September" for a 'YYYY-MM' month. */
export const labelOf = (month: string) => { const [y, m] = month.split('-').map(Number); return new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date(y, m - 1, 1)) }

/** Photos added per month (by event date), for the last `n` months ending this month. */
export function photosByMonth(events: PhotoEvent[], n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const offset = i - (n - 1)
    const photos = events.filter((e) => !e.deletedAt && inMonth(e.date, offset)).reduce((s, e) => s + e.photoCount, 0)
    const start = new Date(monthStart(offset))
    return {
      key: start.toISOString().slice(0, 7),
      short: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(start),
      long: new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(start),
      photos,
    }
  })
}
