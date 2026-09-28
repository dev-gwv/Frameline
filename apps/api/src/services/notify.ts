import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { nowIso } from '../lib/ids'
import { visiblePhotos } from './faces'

/**
 * "Notify me" delivery. There is no SMS/WhatsApp provider yet, so each message is a structured log line
 * (`guest notify (simulated)`), which is what a provider adapter would send. Requests are marked notified_at.
 */
export async function sendGuestNotice(env: Env, to: { phone: string }, text: string): Promise<void> {
  console.log(JSON.stringify({ level: 'info', msg: 'guest notify (simulated SMS/WhatsApp — not sent)', to: to.phone, text, env: env.ENVIRONMENT }))
}

/**
 * Sends every waiting "Notify me" request whose gallery now has photos guests can see.
 * Called when events go live (queue consumer) and every minute (cron) as a sweep. Returns how many were sent.
 */
export async function notifyWaitingGuests(env: Env, eventIds?: string[]): Promise<number> {
  const db = getDb(env.DB)
  const n = schema.notifyRequests
  const waiting = await db.select({ r: n, name: schema.events.name, shortId: schema.events.shortId, studio: schema.studios.name }).from(n)
    .innerJoin(schema.events, eq(schema.events.id, n.eventId))
    .innerJoin(schema.studios, eq(schema.studios.id, n.studioId))
    .where(and(isNull(n.notifiedAt), isNull(n.cancelledAt), isNull(schema.events.deletedAt), eventIds?.length ? inArray(n.eventId, eventIds.slice(0, 80)) : undefined))
    .limit(500)
  if (!waiting.length) return 0
  const ready = new Set<string>()
  for (const id of new Set(waiting.map((w) => w.r.eventId))) {
    const [row] = await db.select({ one: sql<number>`1` }).from(schema.photos).where(and(eq(schema.photos.eventId, id), visiblePhotos())).limit(1)
    if (row) ready.add(id)
  }
  const gallery = (env.GALLERY_URL ?? '').replace(/\/$/, '')
  let sent = 0
  for (const w of waiting) {
    if (!ready.has(w.r.eventId)) continue
    // Claim the row first so two sweeps never message twice.
    const res = await db.update(n).set({ notifiedAt: nowIso() }).where(and(eq(n.id, w.r.id), isNull(n.notifiedAt))).run()
    if (!res.meta.changes) continue
    await sendGuestNotice(env, { phone: w.r.phone }, `${w.studio}: the photos from ${w.name} are here. ${gallery}/${w.shortId.toLowerCase()}`).catch(() => undefined)
    sent++
  }
  return sent
}
