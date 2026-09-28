import { and, inArray, isNotNull, lt, type SQL } from 'drizzle-orm'
import { TRASH_DAYS } from '@frameline/shared'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { recountStatements } from './events'
import { vectorIndex } from './vectors'

const chunk = <T,>(xs: T[], n = 80): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/**
 * Deletes photo rows for good, then their R2 files (only objects no remaining photo points at: copies share files)
 * and face vectors. Returns the events touched (for recounts).
 */
export async function hardDeletePhotos(env: Env, where: SQL): Promise<Set<string>> {
  const db = getDb(env.DB)
  const p = schema.photos
  const doomed = await db.select({ id: p.id, key: p.r2Key, eventId: p.eventId }).from(p).where(where).limit(5000)
  if (!doomed.length) return new Set()
  const vectorIds: string[] = []
  for (const ids of chunk(doomed.map((d) => d.id))) {
    const f = await db.select({ v: schema.faces.vectorId }).from(schema.faces).where(inArray(schema.faces.photoId, ids))
    vectorIds.push(...f.map((x) => x.v).filter((v): v is string => !!v))
    await db.delete(p).where(inArray(p.id, ids)).run()
  }
  const keys = [...new Set(doomed.flatMap((d) => (d.key ? [d.key] : [])))]
  const stillUsed = new Set<string>()
  for (const part of chunk(keys)) for (const r of await db.select({ k: p.r2Key }).from(p).where(inArray(p.r2Key, part))) if (r.k) stillUsed.add(r.k)
  for (const part of chunk(keys.filter((k) => !stillUsed.has(k)), 1000)) if (part.length) await env.MEDIA.delete(part)
  const faces = vectorIndex(env)
  if (faces) for (const part of chunk(vectorIds, 1000)) if (part.length) await faces.deleteByIds(part).catch(() => undefined)
  return new Set(doomed.map((d) => d.eventId))
}

/**
 * Daily: permanently deletes albums, photos, QR codes and broadcasts that have been in the trash longer than
 * TRASH_DAYS (events are purged by purgeTrash in routes/events).
 */
export async function purgeTrashedItems(env: Env, now = Date.now()): Promise<{ photos: number; albums: number; qrs: number; broadcasts: number }> {
  const db = getDb(env.DB)
  const cutoff = new Date(now - TRASH_DAYS * 86_400_000).toISOString()
  const a = schema.albums
  const oldAlbums = await db.select({ id: a.id, eventId: a.eventId }).from(a).where(and(isNotNull(a.deletedAt), lt(a.deletedAt, cutoff))).limit(200)
  const events = new Set<string>()
  let photos = 0
  for (const part of chunk(oldAlbums.map((x) => x.id))) {
    const touched = await hardDeletePhotos(env, inArray(schema.photos.albumId, part))
    touched.forEach((e) => events.add(e))
    await db.delete(a).where(inArray(a.id, part)).run()
  }
  const p = schema.photos
  const before = await db.select({ id: p.id }).from(p).where(and(isNotNull(p.deletedAt), lt(p.deletedAt, cutoff))).limit(5000)
  photos += before.length
  if (before.length) (await hardDeletePhotos(env, and(isNotNull(p.deletedAt), lt(p.deletedAt, cutoff))!)).forEach((e) => events.add(e))
  oldAlbums.forEach((x) => events.add(x.eventId))
  for (const e of events) await db.batch(recountStatements(db, e))
  const q = await db.delete(schema.smartQrs).where(and(isNotNull(schema.smartQrs.deletedAt), lt(schema.smartQrs.deletedAt, cutoff))).run()
  const b = await db.delete(schema.broadcasts).where(and(isNotNull(schema.broadcasts.deletedAt), lt(schema.broadcasts.deletedAt, cutoff))).run()
  return { photos, albums: oldAlbums.length, qrs: q.meta.changes ?? 0, broadcasts: b.meta.changes ?? 0 }
}
