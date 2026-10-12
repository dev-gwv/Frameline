import { inArray, sql } from 'drizzle-orm'
import { hash, tone } from '@frameline/shared'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { newId, nowIso } from '../lib/ids'

/**
 * Face clustering: every face the processor finds is put with a person in its event, so People, face privacy
 * and "own photos" downloads work. A new face joins the most similar earlier face's person when the two
 * embeddings are close enough; otherwise it starts a new (unnamed) person.
 *
 * SFace embeddings are L2-normalised, so cosine similarity is a dot product. OpenCV's documented same-person
 * cutoff is 0.363; clustering uses a stricter 0.42 because merging two guests is worse than splitting one
 * guest in two (a studio can merge people; a guest seeing a stranger's photos can't be undone).
 */
export const SAME_PERSON = 0.42

/**
 * Faces placed earlier in this queue batch, per event. Vectorize indexes upserts after a few seconds, so
 * photos of the same person processed together wouldn't find each other there.
 */
export type ClusterMemory = Map<string, { embedding: number[]; personId: string }[]>

const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i]; return s }

export async function assignPeople(
  env: Env, index: VectorizeIndex, eventId: string, faces: { embedding: number[] }[], memory: ClusterMemory,
): Promise<string[]> {
  const db = getDb(env.DB)
  const seen = memory.get(eventId) ?? []
  memory.set(eventId, seen)
  const out: string[] = []
  for (const face of faces) {
    let personId: string | undefined
    let best = SAME_PERSON
    for (const s of seen) {
      const score = dot(face.embedding, s.embedding)
      if (score >= best) { best = score; personId = s.personId }
    }
    if (!personId) {
      const res = await index.query(face.embedding, { topK: 5, namespace: eventId, returnMetadata: 'none', returnValues: false }).catch(() => ({ matches: [] as VectorizeMatch[] }))
      const close = res.matches.filter((m) => m.score >= SAME_PERSON).sort((a, b) => b.score - a.score)
      if (close.length) {
        const rows = await db.select({ v: schema.faces.vectorId, p: schema.faces.personId }).from(schema.faces).where(inArray(schema.faces.vectorId, close.map((m) => m.id)))
        personId = close.map((m) => rows.find((r) => r.v === m.id)?.p).find((p): p is string => !!p)
      }
    }
    if (!personId) {
      personId = newId('per')
      await db.insert(schema.people).values({ id: personId, eventId, name: null, photoCount: 0, tone: tone(hash(personId)), createdAt: nowIso() }).run()
    }
    seen.push({ embedding: face.embedding, personId })
    out.push(personId)
  }
  return out
}

/** Recounts each person's photos in these events and drops unnamed people left with none (after re-indexing). */
export async function recountPeople(env: Env, eventIds: string[]): Promise<void> {
  if (!eventIds.length) return
  const db = getDb(env.DB)
  await db.run(sql`UPDATE people SET photo_count = (SELECT COUNT(DISTINCT photo_id) FROM faces WHERE faces.person_id = people.id)
    WHERE event_id IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})`)
  await db.run(sql`DELETE FROM people WHERE photo_count = 0 AND name IS NULL
    AND event_id IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})`)
}
