import type { DB } from '../db/client'
import { schema } from '../db/client'
import { newId, nowIso } from '../lib/ids'

export interface DownloadLogRow {
  studioId: string
  eventId: string
  photoId: string
  filename: string
  guestId?: string | null
  kind: 'single' | 'zip'
}

/**
 * Logs one row per photo actually downloaded (a guest single-photo download, or one row per photo when a ZIP is
 * generated). This is the source of truth other download counts read from (getEventStats' `downloads`, the
 * Guests tab stat) — never a second, separately-incremented counter.
 */
export function logDownload(db: DB, row: DownloadLogRow) {
  const at = nowIso()
  return db.insert(schema.downloadEvents).values({ id: newId('dl'), createdAt: at, guestId: row.guestId ?? null, ...row }).run()
}

/** Batched insert for a ZIP's photos (chunked by the caller to stay under D1's statement limits). */
export function logDownloadsBatch(db: DB, rows: DownloadLogRow[]) {
  if (!rows.length) return Promise.resolve()
  const at = nowIso()
  const stmts = rows.map((row) => db.insert(schema.downloadEvents).values({ id: newId('dl'), createdAt: at, guestId: row.guestId ?? null, ...row }))
  return db.batch(stmts as unknown as [typeof stmts[number]])
}
