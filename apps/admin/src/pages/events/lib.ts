import { ApiError, DEMO_NOW, fmt, type PhotoEvent } from '@frameline/shared'

export const GALLERY_URL: string = import.meta.env.VITE_GALLERY_URL ?? 'http://localhost:5174'
export const galleryLink = (e: Pick<PhotoEvent, 'shortId'>) => `${GALLERY_URL}/${e.shortId}`

export type StatusFilter = 'all' | 'live' | 'draft' | 'expiring' | 'archived'
export type SortKey = 'recent' | 'name' | 'photos'

export const daysLeft = (e: PhotoEvent) => Math.max(0, fmt.daysUntil(e.expiresAt, DEMO_NOW))
export const isExpiring = (e: PhotoEvent) => e.status !== 'archived' && (e.status === 'expiring' || fmt.daysUntil(e.expiresAt, DEMO_NOW) <= 10)

export function matchesStatus(e: PhotoEvent, f: StatusFilter) {
  switch (f) {
    case 'all': return true
    case 'live': return e.status === 'live' || e.status === 'uploading'
    case 'draft': return e.status === 'draft'
    case 'expiring': return isExpiring(e)
    case 'archived': return e.status === 'archived'
  }
}

export function matchesQuery(e: PhotoEvent, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return e.name.toLowerCase().includes(s) || e.shortId.toLowerCase().includes(s) || e.city.toLowerCase().includes(s)
}

export function sortEvents(list: PhotoEvent[], key: SortKey) {
  const out = [...list]
  if (key === 'name') out.sort((a, b) => a.name.localeCompare(b.name))
  else if (key === 'photos') out.sort((a, b) => b.photoCount - a.photoCount)
  else out.sort((a, b) => b.date.localeCompare(a.date))
  return out
}

export const totalVisits = (e: PhotoEvent) => e.visits.web + e.visits.android + e.visits.ios

export const SHORT_ID_RE = /^[A-Z0-9]{7}$/
export function shortIdError(value: string, events: PhotoEvent[], selfId?: string) {
  const v = value.trim().toUpperCase()
  if (!SHORT_ID_RE.test(v)) return 'Use exactly 7 letters or numbers, like 6402F9F.'
  if (events.some((e) => e.id !== selfId && e.shortId.toUpperCase() === v)) return 'Another event already uses this ID. Try a different one.'
  return null
}

/** Inline message for a failed Event ID change (409 conflict / 422 from the API), or null when it's another kind of error. */
export function shortIdApiError(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 409 || /conflict|taken/.test(err.code)) return 'Another event already uses this ID. Try a different one.'
  if (err.status === 422) return err.fieldError('shortId') ?? err.detail ?? 'This Event ID can’t be used. Try a different one.'
  return null
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PHONE_RE = /^\+?[\d\s-]{8,16}$/

/** yyyy-mm-dd for <input type="date">. */
export const toDateInput = (iso: string | number) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
