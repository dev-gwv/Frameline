import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { EVENT_PHOTO_LIMIT, PRESETS, defaultSettings, hash, tone } from '@frameline/shared'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { NotFound } from '../lib/errors'
import { newId, newShortId, nowIso } from '../lib/ids'

type EventTypeId = (typeof schema.events.$inferInsert)['type']
import { assertEventVisible, type Membership } from './access'

/** Loads an event by id or short id, scoped to the caller's studio (uploaders: assigned events only). Trashed events 404 unless asked for. */
export async function eventForMember(db: DB, m: Membership, idOrShort: string, opts: { includeDeleted?: boolean } = {}) {
  const e = schema.events
  const [row] = await db.select().from(e)
    .where(and(eq(e.studioId, m.studioId), or(eq(e.id, idOrShort), eq(e.shortId, idOrShort.toUpperCase())), opts.includeDeleted ? undefined : isNull(e.deletedAt)))
    .limit(1)
  if (!row) throw new NotFound('Event', idOrShort)
  assertEventVisible(m, row.id)
  return row
}

/** Loads an album of the caller's studio (trashed albums 404 unless asked for). */
export async function albumForMember(db: DB, m: Membership, albumId: string, opts: { includeDeleted?: boolean } = {}) {
  const [row] = await db.select().from(schema.albums).where(and(eq(schema.albums.id, albumId), eq(schema.albums.studioId, m.studioId), opts.includeDeleted ? undefined : isNull(schema.albums.deletedAt))).limit(1)
  if (!row) throw new NotFound('Album', albumId)
  assertEventVisible(m, row.eventId)
  return row
}

/**
 * Recomputes album counts/capture ranges and the event total (albums of kind 'store' are excluded).
 * Copies made by POST /photos/copy (e.g. a guest-picks album) share the original file and keep `copiedFrom`
 * set: they count in their own album's photoCount (so it displays correctly) but never a second time in the
 * event total, which is what plan/event photo limits are checked against.
 */
export function recountStatements(db: DB, eventId: string) {
  const a = schema.albums
  return [
    db.update(a).set({
      photoCount: sql`(SELECT count(*) FROM photos p WHERE p.album_id = ${a.id} AND p.deleted_at IS NULL)`,
      firstCapture: sql`(SELECT min(captured_at) FROM photos p WHERE p.album_id = ${a.id} AND p.deleted_at IS NULL)`,
      lastCapture: sql`(SELECT max(captured_at) FROM photos p WHERE p.album_id = ${a.id} AND p.deleted_at IS NULL)`,
    }).where(eq(a.eventId, eventId)),
    db.update(schema.events).set({
      photoCount: sql`(SELECT count(*) FROM photos p JOIN albums a2 ON a2.id = p.album_id WHERE a2.event_id = ${schema.events.id} AND a2.kind != 'store' AND a2.deleted_at IS NULL AND p.deleted_at IS NULL AND p.copied_from IS NULL)`,
    }).where(eq(schema.events.id, eventId)),
  ] as const
}

export async function recountEvent(db: DB, eventId: string): Promise<void> {
  await db.batch(recountStatements(db, eventId))
}

export interface NewEvent {
  name: string
  date: string
  city: string
  type: EventTypeId
  preset: keyof typeof PRESETS
  guestUploadLimit: number
  host?: { email: string; phone?: string }
  /** Settings that win over the preset's, e.g. a partner's own defaults. */
  overrides?: Partial<(typeof schema.events.$inferInsert)['settings']>
}

/**
 * Creates an event with its guest-uploads album and returns its id. The one way an event is made, whether
 * from the admin app (POST /events) or from a partner's project (POST /integrations/.../events).
 */
export async function createEvent(db: DB, studioId: string, input: NewEvent): Promise<string> {
  const id = newId('ev')
  const t = hash(id)
  const date = new Date(input.date)
  const now = nowIso()
  let shortId = newShortId()
  for (let i = 0; i < 5; i++) {
    const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.shortId, shortId)).limit(1)
    if (!taken) break
    shortId = newShortId()
  }
  const row: typeof schema.events.$inferInsert = {
    id, studioId, shortId, name: input.name, type: input.type, date: date.toISOString(), city: input.city,
    status: 'draft', photoCount: 0, photoLimit: EVENT_PHOTO_LIMIT, visits: { web: 0, android: 0, ios: 0 }, faceMatches: 0,
    expiresAt: galleryExpiry(date.toISOString()), createdAt: now,
    coverTones: [tone(t), tone(t + 3), tone(t + 7)],
    settings: defaultSettings({ ...PRESETS[input.preset].settings, ...input.overrides, guestUploadLimit: input.guestUploadLimit, pin: newPin() }),
    hosts: input.host ? [{ id: newId('h'), name: input.host.email.split('@')[0], email: input.host.email, phone: input.host.phone, role: 'client', access: 'full', status: 'invited', invitedAt: now }] : [],
    highlights: true, plan: 'subscription',
  }
  // A studio whose Drive is connected and set as the default keeps new events' originals there.
  const [drive] = await db.select({ status: schema.driveConnections.status, def: schema.driveConnections.defaultForNewEvents }).from(schema.driveConnections).where(eq(schema.driveConnections.studioId, studioId)).limit(1)
  if (drive?.status === 'ok' && drive.def) row.originalsIn = 'drive'
  await db.batch([
    db.insert(schema.events).values(row),
    db.insert(schema.albums).values({ id: `${id}_guest`, eventId: id, studioId, name: 'Guest uploads', order: 99, photoCount: 0, kind: 'guest', createdAt: now }),
  ])
  return id
}

/**
 * When guests lose access: a year after the event, or a year from today for an event already past (a studio
 * putting up last season's weddings), never earlier than `current`.
 */
export function galleryExpiry(date: string, current?: string): string {
  const year = Math.max(Date.parse(date), Date.now()) + 365 * 86_400_000
  return new Date(Math.max(year, current ? Date.parse(current) : 0)).toISOString()
}

/** Random 4-digit gallery PIN, never equal to `avoid` (the event's other PIN). */
export function newPin(avoid?: string): string {
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    const pin = String(1000 + (buf[0] % 9000))
    if (pin !== avoid) return pin
  }
}
