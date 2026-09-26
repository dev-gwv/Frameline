import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import type { PhotoJob } from '../src/env'
import { call, expectProblem, tokenFor } from './helpers'

describe('events CRUD', () => {
  it('creates, reads, updates, configures and deletes an event', async () => {
    const token = await tokenFor('editor')
    const created = await call('/v1/events', {
      token, body: { name: 'Sharma Reception', date: '2026-12-05', city: 'Indore', type: 'wedding', preset: 'private-family', guestUploadLimit: 120, host: { email: 'client@example.com' } },
    })
    expect(created.status).toBe(201)
    const ev = created.json
    expect(ev).toMatchObject({ name: 'Sharma Reception', status: 'draft', photoCount: 0, settings: { access: 'link-pin', guestUploadLimit: 120 } })
    expect(ev.shortId).toMatch(/^[0-9A-F]{7}$/)
    expect(ev.settings.pin).toMatch(/^\d{4}$/)
    expect(ev.hosts[0]).toMatchObject({ email: 'client@example.com', role: 'client' })

    expect((await call(`/v1/events/${ev.shortId}`, { token })).json.id).toBe(ev.id)
    const albums = await call(`/v1/events/${ev.id}/albums`, { token })
    expect(albums.json.items).toEqual([expect.objectContaining({ kind: 'guest', name: 'Guest uploads' })])

    const patched = await call(`/v1/events/${ev.id}`, { token, method: 'PATCH', body: { name: 'Sharma Wedding Reception', city: 'Bhopal' } })
    expect(patched.json).toMatchObject({ name: 'Sharma Wedding Reception', city: 'Bhopal' })

    const settings = await call(`/v1/events/${ev.id}/settings`, { token, method: 'PATCH', body: { downloads: 'all', facePrivacy: false } })
    expect(settings.json.settings).toMatchObject({ downloads: 'all', facePrivacy: false, access: 'link-pin' })

    const pin = await call(`/v1/events/${ev.id}/pin/reset`, { token, method: 'POST' })
    expect(pin.json.pin).toMatch(/^\d{4}$/)
    expect((await call(`/v1/events/${ev.id}`, { token })).json.settings.pin).toBe(pin.json.pin)

    const album = await call(`/v1/events/${ev.id}/albums`, { token, body: { name: 'Pheras' } })
    expect(album.status).toBe(201)
    const renamed = await call(`/v1/albums/${album.json.id}`, { token, method: 'PATCH', body: { name: 'Pheras & vows' } })
    expect(renamed.json.name).toBe('Pheras & vows')
    const second = await call(`/v1/events/${ev.id}/albums`, { token, body: { name: 'Vidaai' } })
    expect((await call(`/v1/events/${ev.id}/albums/order`, { token, method: 'PUT', body: { ids: [second.json.id, album.json.id] } })).status).toBe(204)
    const ordered = (await call(`/v1/events/${ev.id}/albums`, { token })).json.items.filter((a: { kind: string }) => a.kind === 'album')
    expect(ordered.map((a: { name: string }) => a.name)).toEqual(['Vidaai', 'Pheras & vows'])

    expect((await call(`/v1/events/${ev.id}`, { token, method: 'DELETE' })).status).toBe(204)
    expectProblem(await call(`/v1/events/${ev.id}`, { token }), 404, 'not_found')
  })

  it('pages the event list with a cursor', async () => {
    const token = await tokenFor('owner')
    const p1 = await call('/v1/events?limit=3', { token })
    expect(p1.json.items).toHaveLength(3)
    expect(p1.json.nextCursor).toEqual(expect.any(String))
    const p2 = await call(`/v1/events?limit=3&cursor=${encodeURIComponent(p1.json.nextCursor)}`, { token })
    const ids1 = p1.json.items.map((e: { id: string }) => e.id)
    for (const e of p2.json.items) expect(ids1).not.toContain(e.id)
    expectProblem(await call('/v1/events?cursor=garbage', { token }), 400, 'invalid_cursor')
  })
})

describe('photos', () => {
  it('pages through photos without overlap and reports the total', async () => {
    const token = await tokenFor('owner')
    const seen = new Set<string>()
    let cursor: string | null = null
    let total = 0
    let pages = 0
    let last = ''
    do {
      const r: { json: { items: { id: string; capturedAt: string }[]; nextCursor: string | null; total: number } } =
        await call(`/v1/events/ev_riya/photos?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token })
      total = r.json.total
      for (const p of r.json.items) {
        expect(seen.has(p.id)).toBe(false)
        expect(p.capturedAt >= last).toBe(true)
        last = p.capturedAt
        seen.add(p.id)
      }
      cursor = r.json.nextCursor
      pages++
    } while (cursor && pages < 50)
    expect(total).toBe(160) // 4 albums × 40 (guest uploads excluded)
    expect(seen.size).toBe(total)
    expect(pages).toBe(7)
  })

  it('sorts by name, filters by album, person, hidden, and supports bulk updates', async () => {
    const token = await tokenFor('editor')
    const byName = (await call('/v1/events/ev_riya/photos?albumId=ev_riya_al0&sort=name&limit=200', { token })).json
    expect(byName.total).toBe(40)
    const names = byName.items.map((p: { filename: string }) => p.filename)
    expect(names).toEqual([...names].sort())

    const person = (await call('/v1/events/ev_riya/photos?personId=p_riya&limit=200', { token })).json
    for (const p of person.items) expect(p.faces.some((f: { personId: string }) => f.personId === 'p_riya')).toBe(true)

    const ids = byName.items.slice(0, 3).map((p: { id: string }) => p.id)
    expect((await call('/v1/photos', { token, method: 'PATCH', body: { ids, patch: { hidden: true } } })).json.updated).toBe(3)
    const hidden = (await call('/v1/events/ev_riya/photos?albumId=ev_riya_al0&filter=hidden&limit=200', { token })).json
    expect(hidden.items.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(ids))

    // Move one to another album; counts follow.
    const move = await call('/v1/photos', { token, method: 'PATCH', body: { ids: [ids[0]], patch: { albumId: 'ev_riya_al1' } } })
    expect(move.status).toBe(200)
    expect((await call(`/v1/photos/${ids[0]}`, { token })).json.albumId).toBe('ev_riya_al1')
    const albums = (await call('/v1/events/ev_riya/albums', { token })).json.items
    expect(albums.find((a: { id: string }) => a.id === 'ev_riya_al0').photoCount).toBe(39)

    // Cross-event moves are rejected.
    expectProblem(await call('/v1/photos', { token, method: 'PATCH', body: { ids: [ids[1]], patch: { albumId: 'ev_mehta_al0' } } }), 422, 'validation_failed')

    expect((await call('/v1/photos/bulk-delete', { token, body: { ids: [ids[2]] } })).json.deleted).toBe(1)
    expectProblem(await call(`/v1/photos/${ids[2]}`, { token }), 404)

    expect((await call('/v1/events/ev_riya/cover', { token, method: 'PUT', body: { photoId: ids[1], scope: 'event' } })).status).toBe(204)
  })
})

describe('uploads (proxy mode) + queue consumer', () => {
  it('uploads a file in parts, completes, and the consumer marks it ready', async () => {
    const token = await tokenFor('uploader')
    const bytes = new TextEncoder().encode('fake-jpeg-bytes'.repeat(100))
    const start = await call('/v1/events/ev_tessera/uploads', {
      token, headers: { 'idempotency-key': `up-${crypto.randomUUID()}` },
      body: { albumId: 'ev_tessera_al0', quality: 'web', files: [{ filename: 'IMG_9001.JPG', size: bytes.length, contentType: 'image/jpeg', width: 6000, height: 4000 }] },
    })
    expect(start.status).toBe(201)
    expect(start.json.mode).toBe('proxy')
    const file = start.json.files[0]
    expect(file.parts).toHaveLength(1)

    const partUrl = new URL(file.parts[0].url)
    const { SELF } = await import('cloudflare:test')
    const put = await SELF.fetch(`https://api.test${partUrl.pathname}${partUrl.search}`, { method: 'PUT', body: bytes })
    expect(put.status).toBe(200)
    const etag = put.headers.get('etag')!
    expect(etag).toBeTruthy()

    const done = await call(`/v1/events/ev_tessera/uploads/${start.json.uploadId}/complete`, { token, body: { files: [{ photoId: file.photoId, parts: [{ partNumber: 1, etag }] }] } })
    expect(done.status).toBe(201)
    expect(done.json.items[0]).toMatchObject({ id: file.photoId, status: 'processing', filename: 'IMG_9001.JPG' })
    expect(await env.MEDIA.head(file.key)).not.toBeNull()

    // Uploaders can't upload to events they aren't assigned to.
    expectProblem(await call('/v1/events/ev_riya/uploads', { token, body: { albumId: 'ev_riya_al0', files: [{ filename: 'a.jpg', size: 10 }] } }), 404)

    const batch = createMessageBatch<PhotoJob>('frameline-photos', [
      { id: 'm1', timestamp: new Date(), attempts: 1, body: { kind: 'process-photo', photoId: file.photoId, eventId: 'ev_tessera', studioId: 'st_northlight', key: file.key, quality: 'web' } },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, env as never)
    const result = await getQueueResult(batch, ctx)
    expect(result.explicitAcks).toEqual(['m1'])
    const photo = await call(`/v1/photos/${file.photoId}`, { token })
    expect(photo.json.status).toBe('ready')
    expect(photo.json.url).toContain('/v1/media/')
  })
})

describe('studio resources', () => {
  it('reads and writes studio-level settings', async () => {
    const token = await tokenFor('owner')
    expect((await call('/v1/studio', { token })).json).toMatchObject({ id: 'st_northlight', handle: 'northlight' })
    expect((await call('/v1/studio', { token, method: 'PATCH', body: { city: 'Pune' } })).json.city).toBe('Pune')
    const credits = await call('/v1/studio/credits', { token, body: { amount: 250.5 }, headers: { 'idempotency-key': `cr-${crypto.randomUUID()}` } })
    expect(credits.json.walletCredits).toBeCloseTo(1450.5)
    expect((await call('/v1/studio/usage', { token })).json.walletCredits).toBeCloseTo(1450.5)
    const wm = await call('/v1/watermark', { token, method: 'PATCH', body: { opacity: 50, applyTo: { originals: true } } })
    expect(wm.json).toMatchObject({ opacity: 50, applyTo: { previews: true, originals: true } })
    expect((await call('/v1/website', { token, method: 'PATCH', body: { published: true } })).json.published).toBe(true)
    const team = await call('/v1/team', { token })
    expect(team.json.items.map((m: { email: string }) => m.email)).toEqual(expect.arrayContaining(['aarav@northlight.in', 'kunal.shah@gmail.com']))
    const invite = await call('/v1/team/invites', { token, body: { email: 'new.shooter@example.com', role: 'uploader', eventIds: ['ev_riya'] } })
    expect(invite.status).toBe(201)
    expect(invite.json.access).toContain('pending')
  })

  it('covers tools: cameras, QRs, broadcasts, tickets, films, guests', async () => {
    const token = await tokenFor('editor')
    const cam = await call('/v1/cameras', { token, body: { label: 'Canon R5 · Test', eventId: 'ev_riya', albumId: 'ev_riya_al0', mode: 'live-2k' } })
    expect(cam.json.ftpUser).toMatch(/^nort_canon_r5/)
    const qr = await call('/v1/qrs', { token, body: { name: 'Gate standee', eventId: 'ev_riya' } })
    expect((await call(`/v1/qrs/${qr.json.id}`, { token, method: 'PATCH', body: { color: '#8C2F39', target: 'smart' } })).json).toMatchObject({ color: '#8C2F39', target: 'smart' })
    const bc = await call('/v1/broadcasts', { token, body: { title: 'Album live', body: 'See the photos', audience: 'ev_riya' } })
    expect(bc.json.sentAt).toEqual(expect.any(String))
    const t = await call('/v1/tickets', { token, body: { subject: 'Help', platform: 'admin', body: 'Question' } })
    const reply = await call(`/v1/tickets/${t.json.id}/messages`, { token, body: { body: 'More detail' } })
    expect(reply.json).toMatchObject({ status: 'waiting', messages: [{ body: 'Question' }, { body: 'More detail' }] })
    const film = await call('/v1/events/ev_riya/films', { token, body: { name: 'Teaser', url: 'https://youtu.be/abc' } })
    expect((await call(`/v1/films/${film.json.id}`, { token, method: 'DELETE' })).status).toBe(204)
    const reqs = (await call('/v1/events/ev_riya/access-requests', { token })).json.items
    expect(reqs.length).toBeGreaterThan(0)
    expect((await call(`/v1/access-requests/${reqs[0].id}/resolve`, { token, body: { approve: true } })).status).toBe(204)
    const guests = (await call('/v1/events/ev_riya/guests?limit=200', { token })).json.items
    expect(guests.some((g: { email: string }) => g.email === reqs[0].email)).toBe(true)
    for (const path of ['/v1/activity', '/v1/prices', '/v1/enquiries', '/v1/events/ev_riya/people']) {
      const r = await call(path, { token })
      expect(r.status, path).toBe(200)
      expect(r.json.items.length, path).toBeGreaterThan(0)
    }
  })
})

describe('public gallery', () => {
  it('checks the PIN, issues a guest token, and applies privacy rules', async () => {
    const info = await call('/v1/public/events/6402F9F')
    expect(info.json).toMatchObject({ name: 'Riya & Kabir Wedding', requiresPin: true, facePrivacy: true })
    expectProblem(await call('/v1/public/events/6402F9F/access', { body: { pin: '0000', name: 'G', email: 'g@example.com' } }), 401, 'invalid_pin')
    const ok = await call('/v1/public/events/6402F9F/access', { body: { pin: '5211', name: 'Guest One', email: 'guest.one@example.com' } })
    expect(ok.status).toBe(200)
    expectProblem(await call('/v1/public/events/6402F9F/photos', { token: ok.json.guestToken }), 403, 'face_privacy')
    expectProblem(await call('/v1/public/events/6402F9F/selfie', { token: ok.json.guestToken, body: { embedding: Array(512).fill(0.01) } }), 503, 'face_search_unavailable')

    const open = await call('/v1/public/events/3F9E21D/access', { body: { name: 'Guest', email: 'guest.two@example.com' } })
    const photos = await call('/v1/public/events/3F9E21D/photos?limit=5', { token: open.json.guestToken })
    expect(photos.status).toBe(200)
    expect(photos.json.items).toHaveLength(5)
    expectProblem(await call('/v1/public/events/6402F9F/albums', { token: open.json.guestToken }), 403, 'wrong_event')

    const enq = await call('/v1/public/studios/northlight/enquiries', { body: { name: 'Ravi', email: 'ravi@example.com', message: 'Wedding in May?' } })
    expect(enq.status).toBe(201)
  })
})
