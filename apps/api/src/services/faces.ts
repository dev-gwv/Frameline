import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { hash } from '@frameline/shared'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { ServiceUnavailable, ValidationFailed } from '../lib/errors'
import { vectorIndex } from './vectors'

/** Photos a guest may see: not hidden, processed, and not waiting for review. */
export const visiblePhotos = (p = schema.photos): SQL => and(eq(p.hidden, false), eq(p.status, 'ready'), or(isNull(p.reviewStatus), eq(p.reviewStatus, 'approved')))!

const chunk = <T,>(xs: T[], n = 80): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/**
 * Face match inside one event. Vectorize (namespace = event id) when configured and an embedding is given;
 * in development/test a deterministic fallback on `key` (unnamed people first, hash(key) % n — same as the mock).
 */
export async function matchFaces(env: Env, eventId: string, key: string, embedding?: number[], minScore = 0.5): Promise<{ personId: string | null; photoIds: string[] }> {
  const db = getDb(env.DB)
  const dev = env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test'
  const index = vectorIndex(env)
  let personId: string | null = null
  let photoIds: string[] = []
  if (index && embedding) {
    let result: VectorizeMatches
    try {
      result = await index.query(embedding, { topK: 100, namespace: eventId, returnMetadata: 'none', returnValues: false })
    } catch (err) {
      if (/dimension/i.test(String(err))) throw new ValidationFailed([{ field: 'embedding', in: 'body', message: 'Embedding has the wrong number of dimensions for this index', code: 'dimension_mismatch' }])
      throw new ServiceUnavailable('Face search is not available right now.', 'face_search_unavailable')
    }
    const ids = result.matches.filter((mt) => mt.score >= minScore).map((mt) => mt.id)
    const faces: { photoId: string; personId: string | null }[] = []
    for (const part of chunk(ids)) faces.push(...await db.select({ photoId: schema.faces.photoId, personId: schema.faces.personId }).from(schema.faces).where(and(eq(schema.faces.eventId, eventId), inArray(schema.faces.vectorId, part))))
    const votes = new Map<string, number>()
    for (const f of faces) if (f.personId) votes.set(f.personId, (votes.get(f.personId) ?? 0) + 1)
    personId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    photoIds = [...new Set(faces.map((f) => f.photoId))]
  } else if (dev) {
    const people = await db.select({ id: schema.people.id, name: schema.people.name }).from(schema.people).where(eq(schema.people.eventId, eventId)).orderBy(asc(schema.people.id))
    const unnamed = people.filter((p) => !p.name)
    const pool = unnamed.length ? unnamed : people
    if (pool.length) personId = pool[hash(key) % pool.length].id
  } else {
    throw new ServiceUnavailable('Face search is not available right now.', 'face_search_unavailable')
  }
  const p = schema.photos
  const albumsSql = sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${eventId} AND kind = 'album')`
  if (personId) {
    const rows = await db.select({ id: p.id }).from(p).where(and(eq(p.eventId, eventId), visiblePhotos(p), albumsSql, sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${personId})`)).orderBy(asc(p.capturedAt))
    photoIds = rows.map((r) => r.id)
  } else if (!photoIds.length && dev) {
    const rows = await db.select({ id: p.id }).from(p).where(and(eq(p.eventId, eventId), visiblePhotos(p), albumsSql)).orderBy(asc(p.capturedAt))
    photoIds = rows.filter((r) => hash(`${r.id}:${key}`) % 8 === 0).map((r) => r.id)
  }
  return { personId, photoIds }
}
