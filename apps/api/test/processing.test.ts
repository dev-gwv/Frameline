import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, schema } from '../src/db/client'
import type { PhotoJob } from '../src/env'
import { MAX_PROCESS_ATTEMPTS, handlePhotoQueue } from '../src/services/processor'
import { guestCanSee } from '../src/lib/media-sign'

/** Photos the processor can't handle used to sit in `processing` forever (HEIC, video, corrupt files). */

const db = () => getDb(env.DB)
const withProcessor = { ...env, PROCESSOR_URL: 'https://processor.test', PROCESSOR_TOKEN: 't' }

afterEach(() => vi.unstubAllGlobals())

async function processingPhoto() {
  const [p] = await db().select().from(schema.photos).where(eq(schema.photos.eventId, 'ev_riya')).limit(1)
  await db().update(schema.photos).set({ status: 'processing', r2Key: `studios/st_northlight/events/ev_riya/originals/${p!.id}/x.heic` }).where(eq(schema.photos.id, p!.id)).run()
  return p!
}

async function run(job: PhotoJob, attempts: number) {
  const batch = createMessageBatch<PhotoJob>('frameline-photos', [{ id: `m${Date.now()}`, timestamp: new Date(), attempts, body: job }])
  const ctx = createExecutionContext()
  await handlePhotoQueue(batch, withProcessor as never)
  return getQueueResult(batch, ctx)
}

const status = async (id: string) => (await db().select({ s: schema.photos.status }).from(schema.photos).where(eq(schema.photos.id, id)).limit(1))[0]!.s

describe('photo processing failures', () => {
  it('marks a file the processor rejects as failed at once, and guests never see it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unsupported_file"}', { status: 422 })))
    const p = await processingPhoto()
    const job: PhotoJob = { kind: 'process-photo', photoId: p.id, eventId: p.eventId, studioId: p.studioId, key: 'k', quality: 'web' }
    const result = await run(job, 1)
    expect(result.explicitAcks.length).toBe(1)
    expect(result.retryMessages.length).toBe(0)
    expect(await status(p.id)).toBe('failed')
    const [row] = await db().select().from(schema.photos).where(eq(schema.photos.id, p.id)).limit(1)
    expect(guestCanSee(row!)).toBe(false)
  })

  it('retries a processor outage, and gives up after the last attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const p = await processingPhoto()
    const job: PhotoJob = { kind: 'process-photo', photoId: p.id, eventId: p.eventId, studioId: p.studioId, key: 'k', quality: 'web' }
    const first = await run(job, 1)
    expect(first.retryMessages.length).toBe(1)
    expect(await status(p.id)).toBe('processing')
    const last = await run(job, MAX_PROCESS_ATTEMPTS)
    expect(last.retryMessages.length).toBe(0)
    expect(await status(p.id)).toBe('failed')
  })

  it('puts a photo back in the queue when the processor is busy, without spending its attempts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"busy"}', { status: 503, headers: { 'retry-after': '30', 'content-type': 'application/json' } })))
    const sent: { body: unknown; delay?: number }[] = []
    const queue = { send: async (body: unknown, o?: { delaySeconds?: number }) => { sent.push({ body, delay: o?.delaySeconds }) } }
    const p = await processingPhoto()
    const job: PhotoJob = { kind: 'process-photo', photoId: p.id, eventId: p.eventId, studioId: p.studioId, key: 'k', quality: 'web' }
    const batch = createMessageBatch<PhotoJob>('frameline-photos', [{ id: `m${Date.now()}`, timestamp: new Date(), attempts: MAX_PROCESS_ATTEMPTS, body: job }])
    const ctx = createExecutionContext()
    await handlePhotoQueue(batch, { ...withProcessor, PHOTO_QUEUE: queue } as never)
    const result = await getQueueResult(batch, ctx)
    expect(result.explicitAcks.length).toBe(1)
    expect(result.retryMessages.length).toBe(0)
    expect(sent).toEqual([{ body: job, delay: 30 }])
    // Even on what would have been its last attempt, a busy processor never marks the photo failed.
    expect(await status(p.id)).toBe('processing')
  })
})
