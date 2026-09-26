const inr = new Intl.NumberFormat('en-IN')
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 12480 → "12,480" (Indian grouping). */
export const count = (n: number) => inr.format(n)
/** 48200 → "₹48,200"; 31840 with decimals → "₹31,840.00" */
export const rupees = (n: number, decimals = false) => `₹${(decimals ? inr2 : inr).format(n)}`
export const money = (n: number, currency: 'INR' | 'USD', decimals = false) => (currency === 'USD' ? `$${n.toLocaleString('en-US')}` : rupees(n, decimals))
export const signedRupees = (n: number) => `${n >= 0 ? '+' : '−'} ${rupees(Math.abs(n), true)}`

export const bytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`)

const dShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const dDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const dTime = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const dFull = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

export const date = (iso: string) => dShort.format(new Date(iso))
export const dayMonth = (iso: string) => dDay.format(new Date(iso))
export const time = (iso: string) => dTime.format(new Date(iso))
export const dateTime = (iso: string) => `${dDay.format(new Date(iso))}, ${dTime.format(new Date(iso))}`
export const fullDateTime = (iso: string) => dFull.format(new Date(iso))

/** "12–14 Sep 2026" style range, or a single date. */
export function dateRange(start: string, end?: string) {
  if (!end) return date(start)
  const a = new Date(start), b = new Date(end)
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${date(end)}`
  return `${dayMonth(start)} – ${date(end)}`
}

/** "4 min ago", "2 h ago", "yesterday", "3 days ago". `now` is injectable for demo time. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 172800) return 'yesterday'
  return `${Math.round(s / 86400)} days ago`
}

export const daysUntil = (iso: string, now = Date.now()) => Math.ceil((new Date(iso).getTime() - now) / 86_400_000)

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

/** Demo "now" so sample data reads naturally (26 Sep 2026, 6 PM IST). */
export const DEMO_NOW = new Date('2026-09-26T18:00:00+05:30').getTime()
