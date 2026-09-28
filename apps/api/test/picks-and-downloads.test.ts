import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import type { PhotoJob } from '../src/env'
import { call, expectProblem, tokenFor } from './helpers'

/**
 * 1. "Make an album from these" (copyPhotosToAlbum / POST /photos/copy) must not count copied photos a second
 *    time against the event's photo limit — the copies share the original file (see recountStatements).
 * 3. Real per-photo download tracking: download_events is the source of truth for getEventStats' `downloads`
 *    (single-photo downloads log immediately; a ZIP logs one row per photo once the consumer marks it ready).
 */

const key = (tag: string) => ({ 'idempotency-key': `${tag}-${crypto.randomUUID()}` })

async function drain(messages: PhotoJob[]) {
  const batch = createMessageBatch<PhotoJob>('frameline-photos', messages.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })))
  const ctx = createExecutionContext()
  await worker.queue(batch, env as never)
  return getQueueResult(batch, ctx)
}

async function firstPhotos(eventId: string, n: number, albumId?: string) {
  const q = new URLSearchParams({ limit: String(n), ...(albumId ? { albumId } : {}) })
  const token = await tokenFor('editor')
  return (await call(`/v1/events/${eventId}/photos?${q}`, { token })).json.items as { id: string; albumId: string; filename: string }[]
}

describe('picks album quota', () => {
  it('copying photos into a new album does not inflate the event photo count', async () => {
    const token = await tokenFor('editor')
    const before = (await call('/v1/events/ev_kapoor', { token })).json.photoCount as number
    const [a, b] = await firstPhotos('ev_kapoor', 2, 'ev_kapoor_al1')

    const album = (await call('/v1/events/ev_kapoor/albums', { token, body: { name: 'Priya’s picks' } })).json
    expect(album.photoCount).toBe(0)

    const copyRes = await call('/v1/photos/copy', { token, body: { ids: [a.id, b.id], albumId: album.id }, headers: key('cp') })
    expect(copyRes.status).toBe(201)
    const copies = copyRes.json.items as { id: string }[]
    expect(copies).toHaveLength(2)
    expect(copies.map((c) => c.id)).not.toContain(a.id)
    expect(copies.map((c) => c.id)).not.toContain(b.id)

    // The event's total (checked against photoLimit) is unchanged — copies share the original file.
    expect((await call('/v1/events/ev_kapoor', { token })).json.photoCount).toBe(before)

    // The new album shows its 2 photos…
    const albums = (await call('/v1/events/ev_kapoor/albums', { token })).json.items as { id: string; photoCount: number }[]
    expect(albums.find((x) => x.id === album.id)?.photoCount).toBe(2)
    const inNew = ((await call(`/v1/events/ev_kapoor/photos?albumId=${album.id}`, { token })).json.items as { id: string }[]).map((p) => p.id).sort()
    expect(inNew).toEqual([...copies.map((c) => c.id)].sort())

    // …and the originals are still in their own album too.
    const inOriginal = ((await call('/v1/events/ev_kapoor/photos?albumId=ev_kapoor_al1', { token })).json.items as { id: string }[]).map((p) => p.id)
    expect(inOriginal).toEqual(expect.arrayContaining([a.id, b.id]))
  })

  it('rejects copying photos from another event (unchanged behaviour)', async () => {
    const token = await tokenFor('editor')
    const [ph] = await firstPhotos('ev_kapoor', 1, 'ev_kapoor_al1')
    const otherAlbum = (await call('/v1/events/ev_portfolio/albums', { token, body: { name: 'Elsewhere' } })).json
    const r = await call('/v1/photos/copy', { token, body: { ids: [ph.id], albumId: otherAlbum.id }, headers: key('cp2') })
    expectProblem(r, 422, 'validation_failed')
    expect(r.json.errors).toMatchObject([{ field: 'albumId', code: 'cross_event_copy' }])
  })
})

describe('download log', () => {
  it('logs an anonymous single-photo download and rolls it into event stats', async () => {
    const token = await tokenFor('editor')
    const [ph] = await firstPhotos('ev_kapoor', 1, 'ev_kapoor_al1')
    const before = (await call('/v1/events/ev_kapoor/stats', { token })).json.downloads as number

    expect((await call('/v1/public/downloads', { body: { photoIds: [ph.id] } })).status).toBe(204)

    expect((await call('/v1/events/ev_kapoor/stats', { token })).json.downloads).toBe(before + 1)
    const log = (await call('/v1/events/ev_kapoor/downloads', { token })).json.items as { photoId: string; filename: string; kind: string; guestId?: string; guestName?: string }[]
    const row = log.find((r) => r.photoId === ph.id)
    expect(row).toMatchObject({ filename: ph.filename, kind: 'single' })
    expect(row?.guestId).toBeUndefined()
    expect(row?.guestName).toBeUndefined()
  })

  it('logs one row per photo once a studio-requested ZIP is ready, and it counts in event stats', async () => {
    const token = await tokenFor('editor')
    const album = (await call('/v1/events/ev_kapoor/albums', { token })).json.items.find((a: { kind: string }) => a.kind === 'album')
    const before = (await call('/v1/events/ev_kapoor/stats', { token })).json.downloads as number

    const z = await call('/v1/events/ev_kapoor/zips', { token, body: { email: 'client@example.com', albumId: album.id }, headers: key('zip') })
    expect(z.status).toBe(202)
    await drain([{ kind: 'build-zip', zipId: z.json.id, studioId: 'st_northlight' }])

    const after = (await call('/v1/events/ev_kapoor/stats', { token })).json.downloads as number
    expect(after).toBe(before + album.photoCount)

    const log = (await call('/v1/events/ev_kapoor/downloads', { token })).json.items as { kind: string }[]
    expect(log.filter((r) => r.kind === 'zip')).toHaveLength(album.photoCount)
  })

  it('requires editor access to read the download log', async () => {
    expectProblem(await call('/v1/events/ev_kapoor/downloads', { token: await tokenFor('uploader') }), 403)
  })

  it('paginates the download log with a cursor, most recent first', async () => {
    const token = await tokenFor('editor')
    const photos = await firstPhotos('ev_kapoor', 3, 'ev_kapoor_al1')
    for (const p of photos) expect((await call('/v1/public/downloads', { body: { photoIds: [p.id] } })).status).toBe(204)

    const page1 = (await call('/v1/events/ev_kapoor/downloads?limit=2', { token })).json as { items: { id: string; createdAt: string }[]; nextCursor: string | null }
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeTruthy()
    const page2 = (await call(`/v1/events/ev_kapoor/downloads?limit=2&cursor=${page1.nextCursor}`, { token })).json as { items: { id: string }[] }
    expect(page2.items.length).toBeGreaterThan(0)
    expect(new Set(page1.items.map((i) => i.id))).not.toEqual(new Set(page2.items.map((i) => i.id)))
  })
})
