import { and, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { purgeTrash } from '../routes/events'
import { notifyWaitingGuests } from './notify'
import { publishTopics } from './realtime'
import { purgeTrashedItems } from './trash'

/**
 * Every minute:
 * - Smart QR schedules that are due switch the QR to `scheduledEventId` and clear the schedule.
 * - Scheduled broadcasts that are due (not cancelled, not in the trash) are marked sent (delivery fan-out is TODO).
 * - "Notify me" requests whose gallery now has photos are sent (simulated).
 */
export async function runEveryMinute(env: Env, now = new Date()): Promise<{ qrs: number; broadcasts: number; notified: number }> {
  const db = getDb(env.DB)
  const at = now.toISOString()
  const q = schema.smartQrs
  const dueQrs = await db.select({ id: q.id, studioId: q.studioId }).from(q).where(and(isNotNull(q.scheduledEventId), isNotNull(q.scheduledAt), lte(q.scheduledAt, at)))
  if (dueQrs.length) {
    await db.run(sql`UPDATE smart_qrs SET event_id = scheduled_event_id, scheduled_event_id = NULL, scheduled_at = NULL
      WHERE scheduled_event_id IS NOT NULL AND scheduled_at IS NOT NULL AND scheduled_at <= ${at}`)
  }
  const b = schema.broadcasts
  const dueBroadcasts = await db.select({ id: b.id, studioId: b.studioId }).from(b).where(and(isNull(b.sentAt), isNull(b.cancelledAt), isNull(b.deletedAt), isNotNull(b.scheduledAt), lte(b.scheduledAt, at)))
  if (dueBroadcasts.length) {
    await db.run(sql`UPDATE broadcasts SET sent_at = scheduled_at WHERE sent_at IS NULL AND cancelled_at IS NULL AND deleted_at IS NULL AND scheduled_at IS NOT NULL AND scheduled_at <= ${at}`)
  }
  const studios = new Set([...dueQrs, ...dueBroadcasts].map((r) => r.studioId))
  for (const s of studios) await publishTopics(env, s, ['misc']).catch(() => undefined)
  const notified = await notifyWaitingGuests(env).catch(() => 0)
  return { qrs: dueQrs.length, broadcasts: dueBroadcasts.length, notified }
}

/** Daily: permanently delete events, albums, photos, QR codes and broadcasts that have been in the trash for 30 days. */
export async function runDaily(env: Env, now = Date.now()): Promise<{ purged: number; photos: number; albums: number; qrs: number; broadcasts: number }> {
  const purged = await purgeTrash(env, now)
  const items = await purgeTrashedItems(env, now)
  return { purged, ...items }
}

export async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  if (controller.cron === '0 3 * * *') await runDaily(env)
  else await runEveryMinute(env, new Date(controller.scheduledTime))
}
