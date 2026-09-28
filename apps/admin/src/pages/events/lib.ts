import { ApiError, TRASH_DAYS, fmt, type EventType, type PhotoEvent, type PresetId } from '@frameline/shared'
import { GALLERY_URL as SHELL_GALLERY_URL, galleryUrl } from '../../lib/url'

/** Kept for older imports (event settings); prefer `galleryUrl` from lib/url. */
export const GALLERY_URL: string = SHELL_GALLERY_URL
export const galleryLink = (e: Pick<PhotoEvent, 'shortId'>) => galleryUrl(e.shortId)

/** Status tabs on /events (`?f=`). `trash` is "Recently deleted". */
export type StatusFilter = 'all' | 'live' | 'draft' | 'expiring' | 'archived' | 'trash'
export type SortKey = 'recent' | 'name' | 'photos'

export const FILTERS: { value: Exclude<StatusFilter, 'trash'>; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'draft', label: 'Drafts' },
  { value: 'expiring', label: 'Expiring' }, { value: 'archived', label: 'Archived' },
]
export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Most recent' }, { value: 'name', label: 'Name' }, { value: 'photos', label: 'Photos' },
]

export const daysLeft = (e: PhotoEvent) => fmt.daysUntil(e.expiresAt, Date.now())
export const isExpiring = (e: PhotoEvent) => e.status !== 'archived' && e.status !== 'draft' && (e.status === 'expiring' || daysLeft(e) <= 14)

export function matchesStatus(e: PhotoEvent, f: StatusFilter) {
  switch (f) {
    case 'all': return true
    case 'live': return e.status === 'live' || e.status === 'uploading'
    case 'draft': return e.status === 'draft'
    case 'expiring': return isExpiring(e)
    case 'archived': return e.status === 'archived'
    case 'trash': return false
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

/** Live and uploading events first, then the most recent; for Home and the upload picker. */
export function recentFirst(list: PhotoEvent[]) {
  const rank = (e: PhotoEvent) => (e.status === 'uploading' ? 0 : e.status === 'live' || e.status === 'expiring' ? 1 : e.status === 'draft' ? 2 : 3)
  return [...list].sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date))
}

export const totalVisits = (e: PhotoEvent) => e.visits.web + e.visits.android + e.visits.ios
export const photoLine = (e: PhotoEvent) => (e.photoCount ? `${fmt.count(e.photoCount)} ${e.photoCount === 1 ? 'photo' : 'photos'}` : 'No photos yet')

export const SHORT_ID_RE = /^[A-Z0-9]{7}$/
export function shortIdError(value: string, events: PhotoEvent[], selfId?: string) {
  const v = value.trim().toUpperCase()
  if (!SHORT_ID_RE.test(v)) return 'Use exactly 7 letters or numbers, like 6402F9F.'
  if (events.some((e) => e.id !== selfId && e.shortId.toUpperCase() === v)) return 'Another event already uses this code. Try a different one.'
  return null
}

/** Inline message for a failed event code change (409 conflict / 422 from the API), or null when it's another kind of error. */
export function shortIdApiError(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 409 || /conflict|taken/.test(err.code)) return 'Another event already uses this code. Try a different one.'
  if (err.status === 422) return err.fieldError('shortId') ?? err.detail ?? 'This event code can’t be used. Try a different one.'
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

/** "Who should see the photos?": the three presets in plain words (New event and setup step 3). */
export const AUDIENCE: { value: PresetId; title: string; description: string }[] = [
  { value: 'private-family', title: 'Only the people in them', description: 'Guests take a selfie to see their own photos. PIN required.' },
  { value: 'open-corporate', title: 'Everyone with the link', description: 'Good for company events and parties.' },
  { value: 'race', title: 'Buyers (race or sports)', description: 'Guests find their photos and buy them.' },
]

// ── Recently deleted ──────────────────────────────────────────────────────────
export const PURGE_DAYS = TRASH_DAYS
const DAY = 86_400_000
/** Whole days since the event went to the trash, and days until it's removed for good. */
export function trashAge(e: PhotoEvent, now = Date.now()) {
  const since = e.deletedAt ? Math.max(0, Math.floor((now - Date.parse(e.deletedAt)) / DAY)) : 0
  return { since, left: Math.max(0, PURGE_DAYS - since) }
}

/** A sensible event type from the name and audience, until someone picks one under More options. */
export function guessType(name: string, preset: PresetId): EventType {
  const n = name.toLowerCase()
  const rules: [RegExp, EventType][] = [
    [/wedding|shaadi|sangeet|haldi|mehendi|reception|vivah/, 'wedding'], [/engage|roka|sagai/, 'engagement'],
    [/birthday|bday/, 'birthday'], [/baby|newborn|naming|annaprashan/, 'baby'], [/pre.?wedding|couple/, 'couple'],
    [/school|annual day|college|convocation|graduation/, 'school'], [/marathon|run|race|cycl|match|tournament|sports/, 'sports'],
    [/offsite|conference|summit|corporate|launch|meet/, 'corporate'], [/family|reunion|anniversary/, 'family'],
  ]
  for (const [re, t] of rules) if (re.test(n)) return t
  return preset === 'race' ? 'sports' : preset === 'open-corporate' ? 'corporate' : 'other'
}
