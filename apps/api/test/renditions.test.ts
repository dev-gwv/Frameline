import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, schema } from '../src/db/client'
import { downloadFile, watermarkFor } from '../src/services/renditions'

/** Watermarked downloads (and ZIPs) are rendered by the processor with the watermark burned in. */

afterEach(() => vi.unstubAllGlobals())
const db = () => getDb(env.DB)

describe('download renditions', () => {
  it('follows the gallery watermark rule, falling back to the studio name', async () => {
    const [ev] = await db().select().from(schema.events).where(eq(schema.events.id, 'ev_riya')).limit(1)
    await db().delete(schema.watermarks).where(eq(schema.watermarks.studioId, ev!.studioId)).run()
    expect(await watermarkFor(env, ev!, '2048')).toMatchObject({ text: expect.any(String), position: 'br' })
    expect(await watermarkFor(env, { ...ev!, settings: { ...ev!.settings, watermarkOff: true } }, '2048')).toBeNull()
  })

  it('asks the processor for a rotated, watermarked file', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response('jpeg-bytes', { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    }))
    const [p] = await db().select().from(schema.photos).where(eq(schema.photos.eventId, 'ev_riya')).limit(1)
    const photo = { ...p!, r2Key: 'studios/s/events/e/originals/p/a.jpg', rotation: 90 }
    const live = { ...env, PROCESSOR_URL: 'https://processor.test', PROCESSOR_TOKEN: 't' }
    const body = await downloadFile(live, photo, '2048', { text: 'Northlight', position: 'br', size: 'normal', opacity: 70 })
    expect(await new Response(body).text()).toBe('jpeg-bytes')
    expect(calls[0]).toMatchObject({ url: 'https://processor.test/render', body: { key: photo.r2Key, size: 2048, rotation: 90, watermark: { text: 'Northlight' } } })
  })

  it('gives nothing without a processor, so the gallery renders the file itself', async () => {
    const [p] = await db().select().from(schema.photos).where(eq(schema.photos.eventId, 'ev_riya')).limit(1)
    expect(await downloadFile({ ...env, PROCESSOR_URL: undefined }, { ...p!, r2Key: 'k' }, '2048', null)).toBeNull()
  })
})
