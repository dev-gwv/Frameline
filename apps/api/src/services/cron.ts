import { and, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { purgeTrash } from '../routes/events'
import { publishTopics } from './realtime'

/**
 * Every minute:
 * - Smart QR schedules that are due switch the QR to `scheduledEventId` and clear the schedule.
 * - Scheduled broadcasts that are due (and not cancelled) are marked sent (delivery fan-out is TODO).
 */
export async function runEveryMinute(env: Env, now = new Date()): Promise<{ qrs: number; broadcasts: number }> {
  const db = getDb(env.DB)
  const at = now.toISOString()
  const q = schema.smartQrs
  const dueQrs = await db.select({ id: q.id, studioId: q.studioId }).from(q).where(and(isNotNull(q.scheduledEventId), isNotNull(q.scheduledAt), lte(q.scheduledAt, at)))
  if (dueQrs.length) {
    await db.run(sql`UPDATE smart_qrs SET event_id = scheduled_event_id, scheduled_event_id = NULL, scheduled_at = NULL
      WHERE scheduled_event_id IS NOT NULL AND scheduled_at IS NOT NULL AND scheduled_at <= ${at}`)
  }
  const b = schema.broadcasts
  const dueBroadcasts = await db.select({ id: b.id, studioId: b.studioId }).from(b).where(and(isNull(b.sentAt), isNull(b.cancelledAt), isNotNull(b.scheduledAt), lte(b.scheduledAt, at)))
  if (dueBroadcasts.length) {
    await db.run(sql`UPDATE broadcasts SET sent_at = scheduled_at WHERE sent_at IS NULL AND cancelled_at IS NULL AND scheduled_at IS NOT NULL AND scheduled_at <= ${at}`)
  }
  const studios = new Set([...dueQrs, ...dueBroadcasts].map((r) => r.studioId))
  for (const s of studios) await publishTopics(env, s, ['misc']).catch(() => undefined)
  return { qrs: dueQrs.length, broadcasts: dueBroadcasts.length }
}

/** Daily: permanently delete events that have been in the trash for 30 days. */
export async function runDaily(env: Env): Promise<{ purged: number }> {
  return { purged: await purgeTrash(env) }
}

export async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  if (controller.cron === '0 3 * * *') await runDaily(env)
  else await runEveryMinute(env, new Date(controller.scheduledTime))
}
