import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../src/db/client'
import { BASE, call, expectProblem, freshIp, tokenFor } from './helpers'
import { guestPhotosOut, signMediaKey } from '../src/lib/media-sign'

/**
 * Guests see only what the studio lets them see. Each of these was a hole: any PIN opened a see-all session
 * on a gallery without a PIN gate; a hidden photo's file stayed public for a year; any photo's file (the
 * original too, worked out from the web copy's address) opened for anyone with its address; a ZIP link listed photos
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

  it('open only with a signature, and a guest signature only while guests can see the photo', async () => {
    const ev = await eventByShort(TESSERA)
    const photo = await aReadyPhoto(ev.id)
    const key = `studios/${photo.studioId}/events/${ev.id}/originals/${photo.id}/${photo.filename}`
    const web = key.replace(/\/[^/]+$/, '/renditions/2048.jpg')
    await env.MEDIA.put(key, new Uint8Array([1, 2, 3]))
    await env.MEDIA.put(web, new Uint8Array([4, 5, 6]))
    await db().update(schema.photos).set({ r2Key: key, url: null, webCopy: true }).where(eq(schema.photos.id, photo.id)).run()
    const path = (k: string) => `/v1/media/${k.split('/').map(encodeURIComponent).join('/')}`
    const asGuest = async (k: string, signedFor = k) => `${path(k)}?${await signMediaKey(env.JWT_SECRET, signedFor, Date.now(), 'guest')}`

    // An address alone opens nothing, and the original can't be had by editing the web copy's address.
    expect((await media(path(key))).status).toBe(404)
    expect((await media(path(web))).status).toBe(404)
    const open = await media(await asGuest(web))
    expect(open.status).toBe(200)
    expect(open.headers.get('cache-control')).toBe('private, max-age=3600')
    expect((await media(await asGuest(key, web))).status).toBe(404)

    // The guest API signs the web copy only, unless the gallery offers full-size downloads.
    const row = { ...photo, r2Key: key, url: null, webCopy: true }
    const [mine] = await guestPhotosOut(env as never, [row], false)
    expect(mine.url).toBe(mine.webUrl)
    expect(mine.url).toMatch(/renditions\/2048\.jpg\?exp=\d+&sig=/)
    const [full] = await guestPhotosOut(env as never, [row], true)
    expect(full.url).not.toBe(full.webUrl)
    expect((await media(full.url!)).status).toBe(200)

    await db().update(schema.photos).set({ hidden: true }).where(eq(schema.photos.id, photo.id)).run()
    expect((await media(await asGuest(web))).status).toBe(404)

    // The studio's API hands out a signed address for it, and that one works.
    const studio = await call(`/v1/photos/${photo.id}`, { token: await tokenFor('editor') })
    expect(studio.json.url).toMatch(/\?exp=\d+&sig=/)
    const signed = await media(studio.json.url)
    expect(signed.status).toBe(200)
    expect(signed.headers.get('cache-control')).toBe('private, max-age=3600')
    // A signature for one file opens no other.
    expect((await media(`${path(key)}x?${studio.json.url.split('?')[1]}`)).status).toBe(404)

    await db().update(schema.photos).set({ hidden: false, webCopy: photo.webCopy }).where(eq(schema.photos.id, photo.id)).run()
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
