import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { NotFound } from '../lib/errors'
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

/** Random 4-digit gallery PIN. */
export function newPin(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(1000 + (buf[0] % 9000))
}
