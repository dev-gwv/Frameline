import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb, schema } from '../src/db/client'
import { assignPeople, recountPeople, type ClusterMemory } from '../src/services/clustering'

/** Faces found by the processor used to have no person, so People, face privacy and "own" downloads were empty. */

const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n) }
const A = unit([1, 0.1, 0, 0])
const A2 = unit([1, 0.15, 0.05, 0]) // the same person in another photo
const B = unit([0, 0, 1, 0.2]) // someone else

/** A stand-in Vectorize index answering with fixed matches. */
const fakeIndex = (matches: VectorizeMatch[] = []) => ({ query: async () => ({ matches, count: matches.length }) }) as unknown as VectorizeIndex

describe('face clustering', () => {
  it('puts the same face together and different faces apart', async () => {
    const memory: ClusterMemory = new Map()
    const [a, b] = await assignPeople(env, fakeIndex(), 'ev_riya', [{ embedding: A }, { embedding: B }], memory)
    const [a2] = await assignPeople(env, fakeIndex(), 'ev_riya', [{ embedding: A2 }], memory)
    expect(a).not.toBe(b)
    expect(a2).toBe(a)
    const people = await getDb(env.DB).select().from(schema.people).where(eq(schema.people.id, a))
    expect(people[0]).toMatchObject({ eventId: 'ev_riya', name: null })
  })

  it('joins the person of an earlier, already indexed face', async () => {
    const db = getDb(env.DB)
    const [photo] = await db.select({ id: schema.photos.id }).from(schema.photos).where(eq(schema.photos.eventId, 'ev_riya')).limit(1)
    const [person] = await db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.eventId, 'ev_riya')).limit(1)
    await db.insert(schema.faces).values({ id: 'fc_known', photoId: photo!.id, eventId: 'ev_riya', personId: person!.id, box: [0, 0, 1, 1], vectorId: 'fc_known' }).run()
    const [got] = await assignPeople(env, fakeIndex([{ id: 'fc_known', score: 0.8 }]), 'ev_riya', [{ embedding: B }], new Map())
    expect(got).toBe(person!.id)
    // Too far away: a new person instead.
    const [other] = await assignPeople(env, fakeIndex([{ id: 'fc_known', score: 0.3 }]), 'ev_riya', [{ embedding: B }], new Map())
    expect(other).not.toBe(person!.id)
  })

  it('recounts photos per person and drops unnamed people left empty', async () => {
    const db = getDb(env.DB)
    const [empty] = await assignPeople(env, fakeIndex(), 'ev_riya', [{ embedding: unit([0, 1, 0, 0]) }], new Map())
    await recountPeople(env, ['ev_riya'])
    expect(await db.select().from(schema.people).where(eq(schema.people.id, empty))).toEqual([])
  })
})
