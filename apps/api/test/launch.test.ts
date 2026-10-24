import { SELF, createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import { galleryExpiry } from '../src/services/events'
import { zipParts } from '../src/services/zips'
import { call, freshIp, tokenFor } from './helpers'

/**
 * Launching with payments off (24 Oct review): nothing may close or stop a studio that it can't pay its way past,
 * and a big export must arrive whole.
 */
const DAY = 86_400_000
const noPayments = { ...env, ENVIRONMENT: 'production', RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }

async function callWith(e: Record<string, unknown>, path: string, init: { token: string; body: unknown }) {
  const req = new Request(`https://api.test${path}`, {
    method: 'POST', body: JSON.stringify(init.body),
    headers: { 'cf-connecting-ip': freshIp(), 'content-type': 'application/json', authorization: `Bearer ${init.token}` },
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, e as never, ctx)
  await waitOnExecutionContext(ctx)
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, any> }
}

describe('gallery expiry', () => {
  it('gives last season’s events a year from today, not an expired gallery', async () => {
    const token = await tokenFor('owner')
    const ev = (await call('/v1/events', { token, body: { name: 'Last season', date: '2024-02-14', city: 'Pune', type: 'wedding', preset: 'private-family', guestUploadLimit: 10 } })).json
    expect(Date.parse(ev.expiresAt)).toBeGreaterThan(Date.now() + 364 * DAY)
    const pub = await call(`/v1/public/events/${ev.shortId}`)
    expect(pub.json.blocked).not.toBe('expired')
  })

  it('moves with a later date but never shortens', () => {
    const now = Date.now()
    const later = new Date(now + 200 * DAY).toISOString()
    expect(Date.parse(galleryExpiry(later))).toBe(Date.parse(later) + 365 * DAY)
    const far = new Date(now + 900 * DAY).toISOString()
    expect(galleryExpiry('2020-01-01T00:00:00.000Z', far)).toBe(far)
  })

  it('renews for free while payments are off', async () => {
    const token = await tokenFor('owner')
    const ev = (await call('/v1/events', { token, body: { name: 'Free renewal', date: '2026-01-10', city: 'Pune', type: 'wedding', preset: 'private-family', guestUploadLimit: 10 } })).json
    const r = await callWith(noPayments, `/v1/events/${ev.id}/renew`, { token, body: { payWith: 'card' } })
    expect(r.status).toBe(200)
    expect(r.json.charged).toBe(0)
    expect(Date.parse(r.json.event.expiresAt)).toBeGreaterThan(Date.parse(ev.expiresAt) + 364 * DAY)
  })
})

describe('big ZIPs', () => {
  const photo = (i: number, size: number) => ({ id: `p${i}`, exif: { width: 1, height: 1, sizeBytes: size } }) as never

  it('come in parts under 2 GB and 400 files, nothing left out', () => {
    const big = Array.from({ length: 2000 }, (_, i) => photo(i, 10 * 1024 ** 2))
    const parts = zipParts(big, (r) => (r as { exif: { sizeBytes: number } }).exif.sizeBytes)
    expect(parts.length).toBe(10)
    expect(parts.flat()).toHaveLength(2000)
    for (const p of parts) expect(p.length * 10 * 1024 ** 2).toBeLessThanOrEqual(2 * 1024 ** 3)
    const small = Array.from({ length: 1000 }, (_, i) => photo(i, 1024 ** 2))
    expect(zipParts(small, () => 1024 ** 2).map((p) => p.length)).toEqual([400, 400, 200])
    expect(zipParts([], () => 1)).toEqual([])
  })
})

describe('without email', () => {
  const noEmail = { ...env, ENVIRONMENT: 'production', SMTP_USER: undefined, SMTP_PASS: undefined, RESEND_API_KEY: undefined }

  it('says so in /v1/meta, and an invite is saved with emailSent false instead of failing', async () => {
    const ctx = createExecutionContext()
    const meta = await worker.fetch(new Request('https://api.test/v1/meta', { headers: { 'cf-connecting-ip': freshIp() } }), noEmail as never, ctx)
    await waitOnExecutionContext(ctx)
    expect(((await meta.json()) as { features: { email: boolean } }).features.email).toBe(false)
    expect((await call('/v1/meta')).json.features.email).toBe(true)

    const r = await callWith(noEmail, '/v1/team/invites', { token: await tokenFor('owner'), body: { email: `nomail-${crypto.randomUUID().slice(0, 8)}@example.com`, role: 'editor' } })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ pending: true, emailSent: false })
  })
})

describe('uploads', () => {
  const guestToken = async () => (await call('/v1/public/events/6402F9F/pin', { body: { pin: '5211' } })).json.token as string

  it('take no SVG, and nothing from guests over 40 MB', async () => {
    const token = await guestToken()
    const start = (file: Record<string, unknown>) => call('/v1/public/events/6402F9F/uploads', { token, body: { files: [{ filename: 'x', size: 100, contentType: 'image/jpeg', ...file }] } })
    expect((await start({ filename: 'x.svg', contentType: 'image/svg+xml' })).status).toBe(422)
    expect((await start({ size: 50 * 1024 ** 2 })).status).toBe(422)
    expect((await start({ contentType: 'video/mp4' })).status).toBe(422)
  })

  it('drop a file bigger than the size it declared', async () => {
    const token = await guestToken()
    const bytes = new Uint8Array(512).fill(7)
    const start = await call('/v1/public/events/6402F9F/uploads', { token, body: { files: [{ filename: 'small.jpg', size: 10, contentType: 'image/jpeg' }] } })
    expect(start.status).toBe(201)
    const part = new URL(start.json.files[0].parts[0].url)
    const put = await SELF.fetch(`https://api.test${part.pathname}${part.search}`, { method: 'PUT', body: bytes })
    const etag = put.headers.get('etag')!
    const done = await call(`/v1/public/events/6402F9F/uploads/${start.json.uploadId}/complete`, { token, body: { files: [{ photoId: start.json.files[0].photoId, parts: [{ partNumber: 1, etag }] }] } })
    expect(done.json.items).toHaveLength(0)
    expect(await env.MEDIA.head(start.json.files[0].key)).toBeNull()
  })

  it('a studio can’t make its own photos free by calling them guest uploads', async () => {
    const token = await tokenFor('editor')
    const start = await call('/v1/events/ev_tessera/uploads', { token, headers: { 'idempotency-key': `up-${crypto.randomUUID()}` }, body: { albumId: 'ev_tessera_al0', source: 'guest', files: [{ filename: 'free.jpg', size: 10, external: true }] } })
    expect(start.status).toBe(201)
    const done = await call(`/v1/events/ev_tessera/uploads/${start.json.uploadId}/complete`, { token, body: { files: [{ photoId: start.json.files[0].photoId, parts: [] }] } })
    expect(done.json.items[0].source).toBe('web')
  })
})
