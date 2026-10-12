import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../src/db/client'
import { BASE, call, expectProblem, freshIp, tokenFor } from './helpers'

/**
 * Guests see only what the studio lets them see. Each of these was a hole: any PIN opened a see-all session
 * on a gallery without a PIN gate; a hidden photo's file stayed public for a year; a ZIP link listed photos
 * hidden since; single downloads skipped the "own photos" rule.
 */

const db = () => getDb(env.DB)
const TESSERA = '3F9E21D' // access: link (no PIN gate)

async function eventByShort(short: string) {
  return (await db().select().from(schema.events).where(eq(schema.events.shortId, short)).limit(1))[0]!
}

async function aReadyPhoto(eventId: string) {
  const p = schema.photos
  const [row] = await db().select().from(p).where(and(eq(p.eventId, eventId), eq(p.status, 'ready'), eq(p.hidden, false))).limit(1)
  return row!
}

describe('the gallery PIN', () => {
  it('is checked even on a gallery without a PIN gate', async () => {
    const r = await call(`/v1/public/events/${TESSERA}/pin`, { body: { pin: '0000' } })
    expectProblem(r, 401, 'invalid_pin')
    const ev = await eventByShort(TESSERA)
    const ok = await call(`/v1/public/events/${TESSERA}/pin`, { body: { pin: ev.settings.pin } })
    expect(ok.status).toBe(200)
    expect(ok.json.seeAll).toBe(true)
  })
})

describe('photo files', () => {
  const media = async (url: string) => {
    const res = await SELF.fetch(`${BASE}${url}`, { headers: { 'cf-connecting-ip': freshIp() } })
    await res.arrayBuffer()
    return res
  }

  it('stop being public when the photo is hidden, but the studio still sees them', async () => {
    const ev = await eventByShort(TESSERA)
    const photo = await aReadyPhoto(ev.id)
    const key = `studios/${photo.studioId}/events/${ev.id}/originals/${photo.id}/${photo.filename}`
    await env.MEDIA.put(key, new Uint8Array([1, 2, 3]))
    await db().update(schema.photos).set({ r2Key: key, url: null }).where(eq(schema.photos.id, photo.id)).run()
    const path = `/v1/media/${key.split('/').map(encodeURIComponent).join('/')}`

    const open = await media(path)
    expect(open.status).toBe(200)
    expect(open.headers.get('cache-control')).toBe('public, max-age=3600')

    await db().update(schema.photos).set({ hidden: true }).where(eq(schema.photos.id, photo.id)).run()
    expect((await media(path)).status).toBe(404)

    // The studio's API hands out a signed address for it, and that one works.
    const studio = await call(`/v1/photos/${photo.id}`, { token: await tokenFor('editor') })
    expect(studio.json.url).toMatch(/\?exp=\d+&sig=/)
    const signed = await media(studio.json.url)
    expect(signed.status).toBe(200)
    expect(signed.headers.get('cache-control')).toBe('private, max-age=3600')
    // A signature for one file opens no other.
    expect((await media(`${path}x?${studio.json.url.split('?')[1]}`)).status).toBe(404)

    await db().update(schema.photos).set({ hidden: false }).where(eq(schema.photos.id, photo.id)).run()
  })
})

describe('ZIP links', () => {
  it('leave out photos hidden since the request', async () => {
    const ev = await eventByShort(TESSERA)
    const photo = await aReadyPhoto(ev.id)
    const id = `zip_test_${Date.now()}`
    await db().insert(schema.zipRequests).values({
      id, studioId: ev.studioId, eventId: ev.id, albumId: null, photoIds: [photo.id], email: 'g@example.com', photoCount: 1,
      status: 'ready', requestedAt: new Date().toISOString(), readyAt: new Date().toISOString(), url: null, guestId: null,
    }).run()
    expect((await call(`/v1/public/zips/${id}`)).json.photos).toHaveLength(1)
    await db().update(schema.photos).set({ hidden: true }).where(eq(schema.photos.id, photo.id)).run()
    expect((await call(`/v1/public/zips/${id}`)).json.photos).toHaveLength(0)
    await db().update(schema.photos).set({ hidden: false }).where(eq(schema.photos.id, photo.id)).run()
  })
})
