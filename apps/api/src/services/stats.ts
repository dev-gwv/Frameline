import { sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { schema } from '../db/client'

export type DailyCounter = 'visits' | 'downloads' | 'faceSearches' | 'photoViews'
const COLUMN: Record<DailyCounter, string> = { visits: 'visits', downloads: 'downloads', faceSearches: 'face_searches', photoViews: 'photo_views' }

/** 'YYYY-MM-DD' (UTC) for a date. */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10)

/**
 * Adds `n` to one of an event's daily counters (event_daily_stats), creating today's row when needed.
 * These rows feed GET /v1/studio/stats; the all-time numbers on the event itself stay where they were.
 */
export function bumpDaily(db: DB, studioId: string, eventId: string, counter: DailyCounter, n = 1, day = utcDay()) {
  const col = sql.raw(COLUMN[counter])
  return db.run(sql`INSERT INTO ${schema.eventDailyStats} (event_id, day, studio_id, ${col}) VALUES (${eventId}, ${day}, ${studioId}, ${n})
    ON CONFLICT (event_id, day) DO UPDATE SET ${col} = ${col} + ${n}`)
}
