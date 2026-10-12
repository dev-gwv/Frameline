import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb, schema } from '../src/db/client'
import { call, expectProblem, freshIp, uniqueEmail } from './helpers'

/** Limits that used to be recorded and never checked: the event's photo limit (raised by packs) and plan expiry. */

async function studioWithAlbum() {
  const email = uniqueEmail('limits')
  const ip = freshIp()
  const code = (await call('/v1/auth/otp/request', { body: { email }, ip })).json.devCode
  const token = (await call('/v1/auth/otp/verify', { body: { email, code, studioName: 'Limits Studio' }, ip })).json.accessToken as string
  const ev = (await call('/v1/events', { token, body: { name: 'Small event', date: '2026-12-01', city: 'Surat', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 } })).json
  const album = (await call(`/v1/events/${ev.id}/albums`, { token, body: { name: 'A' } })).json
  const studioId = (await call('/v1/me', { token })).json.memberships[0].studioId as string
  return { token, ev, album, studioId }
}

const files = (n: number) => Array.from({ length: n }, (_, i) => ({ filename: `p${i}.jpg`, size: 10, external: true }))

describe('upload limits', () => {
  it('stop at the event photo limit until a pack raises it', async () => {
    const { token, ev, album } = await studioWithAlbum()
    await getDb(env.DB).update(schema.events).set({ photoLimit: 2 }).where(eq(schema.events.id, ev.id)).run()
    expectProblem(await call(`/v1/events/${ev.id}/uploads`, { token, body: { albumId: album.id, files: files(3) } }), 402, 'event_limit_reached')
    expect((await call(`/v1/events/${ev.id}/uploads`, { token, body: { albumId: album.id, files: files(2) } })).status).toBe(201)
  })

  it('do not lock out a lapsed plan while payments are off (it could not be renewed)', async () => {
    const { token, ev, album, studioId } = await studioWithAlbum()
    await getDb(env.DB).update(schema.studios).set({ validTill: '2020-01-01T00:00:00.000Z' }).where(eq(schema.studios.id, studioId)).run()
    expect((await call(`/v1/events/${ev.id}/uploads`, { token, body: { albumId: album.id, files: files(1) } })).status).toBe(201)
  })
})
