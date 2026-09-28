import type { AccessRequest, ID, NeedsYouItem, PhotoEvent } from './types'
import { count as fmtCount, dayMonth } from './format'

/** Events whose gallery closes within this many days reach "Needs you". */
export const NEEDS_YOU_EXPIRY_DAYS = 14
/** Expired galleries stay in "Needs you" during the grace period (they can still be renewed). */
export const EXPIRY_GRACE_DAYS = 7
/** Face search data is kept this many days after the event date unless the event is renewed (simulated retention rule). */
export const FACE_RETENTION_DAYS = 45

const DAY = 86_400_000
const daysUntil = (iso: string, now: number) => Math.ceil((Date.parse(iso) - now) / DAY)
const plural = (n: number, one: string, many = `${one}s`) => `${fmtCount(n)} ${n === 1 ? one : many}`
const inDays = (d: number) => (d > 1 ? `in ${d} days` : d === 1 ? 'tomorrow' : d === 0 ? 'today' : `${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'} ago`)

/** A guest's note in one pair of curly quotes, whatever quotes they typed themselves (null when empty). */
export function quoteNote(note: string | undefined): string | null {
  const bare = (note ?? '').trim().replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, '').trim()
  return bare ? `“${bare}”` : null
}

export interface NeedsYouSource {
  events: Pick<PhotoEvent, 'id' | 'name' | 'status' | 'date' | 'expiresAt' | 'photoCount' | 'deletedAt' | 'settings'>[]
  accessRequests: Pick<AccessRequest, 'id' | 'eventId' | 'name' | 'note' | 'createdAt'>[]
  /** Guest photos awaiting review, per event. */
  pendingUploads: { eventId: ID; count: number; latestAt: string }[]
}

/**
 * Builds Home's "Needs you" list. Used by the mock API and apps/api so both return the same items.
 * Order: access requests (newest first), guest uploads to review, events expiring (soonest first), face data expiring.
 */
export function buildNeedsYou(src: NeedsYouSource, now = Date.now()): NeedsYouItem[] {
  const events = new Map(src.events.filter((e) => !e.deletedAt).map((e) => [e.id, e]))
  const out: NeedsYouItem[] = []

  for (const r of [...src.accessRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const e = events.get(r.eventId)
    if (!e) continue
    out.push({
      id: `access-request:${r.id}`, kind: 'access-request', eventId: e.id, eventName: e.name, accessRequestId: r.id, at: r.createdAt,
      title: `${r.name} wants to see the ${e.name} photos`,
      detail: quoteNote(r.note) ?? 'Asked for access to the gallery',
    })
  }

  for (const u of [...src.pendingUploads].sort((a, b) => b.latestAt.localeCompare(a.latestAt))) {
    const e = events.get(u.eventId)
    if (!e || u.count <= 0) continue
    out.push({
      id: `guest-uploads:${e.id}`, kind: 'guest-uploads', eventId: e.id, eventName: e.name, count: u.count, at: u.latestAt,
      title: `${plural(u.count, 'guest photo')} waiting for review`, detail: e.name,
    })
  }

  const expiring = new Set<ID>()
  const expiry: NeedsYouItem[] = []
  for (const e of events.values()) {
    if (e.status === 'archived' || e.settings.disabled) continue
    const d = daysUntil(e.expiresAt, now)
    if (d > NEEDS_YOU_EXPIRY_DAYS || d < -EXPIRY_GRACE_DAYS) continue
    if (e.status === 'draft' && e.photoCount === 0) continue
    expiring.add(e.id)
    expiry.push({
      id: `event-expiring:${e.id}`, kind: 'event-expiring', eventId: e.id, eventName: e.name, daysLeft: d, at: e.expiresAt,
      title: d >= 0 ? `${e.name} expires ${inDays(d)}` : `${e.name} expired ${inDays(d)}`,
      detail: `${plural(e.photoCount, 'photo')} · guests ${d >= 0 ? 'lose' : 'lost'} access on ${dayMonth(e.expiresAt)}`,
    })
  }
  expiry.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
  out.push(...expiry)

  const faces: NeedsYouItem[] = []
  for (const e of events.values()) {
    if (expiring.has(e.id) || e.status === 'archived' || !e.settings.faceSearch || e.photoCount === 0) continue
    const until = new Date(Date.parse(e.date) + FACE_RETENTION_DAYS * DAY).toISOString()
    const d = daysUntil(until, now)
    if (d < 0 || d > NEEDS_YOU_EXPIRY_DAYS) continue
    faces.push({
      id: `face-data-expiring:${e.id}`, kind: 'face-data-expiring', eventId: e.id, eventName: e.name, daysLeft: d, at: until,
      title: `Face search for ${e.name} ends ${inDays(d)}`,
      detail: 'Renew the event to keep “Find my photos” working',
    })
  }
  faces.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
  out.push(...faces)
  return out
}
