import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { chunk } from '../routes/photos'
import { visiblePhotos as visible } from './faces'

type PhotoRow = typeof schema.photos.$inferSelect
type ZipRow = typeof schema.zipRequests.$inferSelect
type EventRow = typeof schema.events.$inferSelect

/**
 * A big export comes as numbered ZIPs, each under 2 GB and 400 files: a plain ZIP stops at 4 GiB (a 2,000-photo
 * wedding's originals are ~20 GB, and the rest used to be left out without a word), and each part is streamed by
 * one Worker request, which has CPU and subrequest limits.
 */
const PART_BYTES = 2 * 1024 ** 3
const PART_FILES = 400

/** The photos a ZIP request covers right now, in capture order. */
export async function zipPhotos(db: DB, z: ZipRow): Promise<PhotoRow[]> {
  const p = schema.photos
  // A guest ZIP follows the gallery: a photo hidden, trashed or unreviewed since the request is left out.
  // A studio export takes every photo that isn't deleted.
  const allowed = z.requestedBy === 'guest' ? visible(p) : and(isNull(p.deletedAt), eq(p.status, 'ready'))
  if (z.photoIds?.length) {
    const rows: PhotoRow[] = []
    for (const part of chunk(z.photoIds)) rows.push(...await db.select().from(p).where(and(eq(p.eventId, z.eventId), inArray(p.id, part), allowed)))
    return rows
  }
  return db.select().from(p).where(and(eq(p.eventId, z.eventId), allowed,
    z.albumId ? eq(p.albumId, z.albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${z.eventId} AND kind = 'album' AND deleted_at IS NULL)`))
    .orderBy(asc(p.capturedAt), asc(p.id)).limit(ZIP_MAX_PHOTOS)
}

/** Photos one ZIP request covers at most (the rows are held in memory to split them into parts). */
export const ZIP_MAX_PHOTOS = 20_000

/** About how many bytes a photo adds to this ZIP: the original for exports and full-size galleries, else a web copy. */
export function zipFileSize(z: ZipRow, ev: EventRow, r: PhotoRow): number {
  const original = r.exif?.sizeBytes || 25 * 1024 ** 2
  return z.requestedBy !== 'guest' || ev.settings.originalDownloads ? original : Math.min(original, 3 * 1024 ** 2)
}

/** Splits the photos into parts that each fit one ZIP. */
export function zipParts(rows: PhotoRow[], size: (r: PhotoRow) => number): PhotoRow[][] {
  const parts: PhotoRow[][] = []
  let cur: PhotoRow[] = []
  let bytes = 0
  for (const r of rows) {
    const s = size(r)
    if (cur.length && (cur.length >= PART_FILES || bytes + s > PART_BYTES)) { parts.push(cur); cur = []; bytes = 0 }
    cur.push(r)
    bytes += s
  }
  if (cur.length) parts.push(cur)
  return parts
}
