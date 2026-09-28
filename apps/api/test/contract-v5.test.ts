import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { runDaily, runEveryMinute } from '../src/services/cron'
import { call, expectProblem, freshIp, tokenFor, uniqueEmail } from './helpers'

const RIYA = '6402F9F' // link-pin 5211, face privacy on, guest uploads with review
const MEHTA = '7A1C0B2' // link-pin 5211, store on
const TESSERA = '3F9E21D' // open link, no face privacy
const ANAYA = '5D22E80' // draft, no photos
const key = (tag: string) => ({ 'idempotency-key': `${tag}-${crypto.randomUUID()}` })
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function pinToken(shortId: string) {
  const r = await call(`/v1/public/events/${shortId}/pin`, { body: { pin: '5211' } })
  expect(r.status).toBe(200)
  return r.json.token as string
}

async function newStudio() {
  const email = uniqueEmail('owner')
  const ip = freshIp()
  const code = (await call('/v1/auth/otp/request', { body: { email }, ip })).json.devCode
  return (await call('/v1/auth/otp/verify', { body: { email, code, studioName: 'V5 Studio' }, ip })).json.accessToken as string
}

async function firstPhotos(eventId: string, n: number, albumId?: string) {
  const q = new URLSearchParams({ limit: String(n), ...(albumId ? { albumId } : {}) })
  return (await call(`/v1/events/${eventId}/photos?${q}`, { token: await tokenFor('editor') })).json.items as { id: string; albumId: string; capturedAt: string; views: number; rotation: number; quality: string }[]
}

describe('trash and restore', () => {
  it('soft-deletes photos, hides them everywhere, and restores them', async () => {
    const token = await tokenFor('editor')
    const [a, b] = await firstPhotos('ev_kapoor', 2)
    const before = (await call('/v1/events/ev_kapoor', { token })).json.photoCount
    expect((await call('/v1/photos/bulk-delete', { token, body: { ids: [a.id, b.id] }, headers: key('del') })).json.deleted).toBe(2)
    expectProblem(await call(`/v1/photos/${a.id}`, { token }), 404)
    const ids = (await call('/v1/events/ev_kapoor/photo-ids', { token })).json.ids as string[]
    expect(ids).not.toContain(a.id)
    expect((await call('/v1/events/ev_kapoor', { token })).json.photoCount).toBe(before - 2)
    // Restoring twice only counts the ones that were in the trash.
    expect((await call('/v1/photos/restore', { token, body: { ids: [a.id, b.id] }, headers: key('res') })).json.restored).toBe(2)
    expect((await call('/v1/photos/restore', { token, body: { ids: [a.id] }, headers: key('res') })).json.restored).toBe(0)
    expect((await call(`/v1/photos/${a.id}`, { token })).status).toBe(200)
    expect((await call('/v1/events/ev_kapoor', { token })).json.photoCount).toBe(before)
  })

  it('trashes an album with its photos and brings both back', async () => {
    const token = await tokenFor('editor')
    const [ph] = await firstPhotos('ev_kapoor', 1, 'ev_kapoor_al1')
    expect((await call('/v1/albums/ev_kapoor_al1', { token, method: 'DELETE' })).status).toBe(204)
    const albums = (await call('/v1/events/ev_kapoor/albums', { token })).json.items as { id: string }[]
    expect(albums.map((x) => x.id)).not.toContain('ev_kapoor_al1')
    expectProblem(await call(`/v1/photos/${ph.id}`, { token }), 404)
    const r = await call('/v1/albums/ev_kapoor_al1/restore', { token, method: 'POST', headers: key('ra') })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ id: 'ev_kapoor_al1', photoCount: 40 })
    expect(r.json.deletedAt).toBeUndefined()
    expect((await call(`/v1/photos/${ph.id}`, { token })).status).toBe(200)
    expectProblem(await call('/v1/albums/ev_kapoor_al1/restore', { token, method: 'POST' }), 409, 'not_deleted')
  })

  it('trashes and restores QR codes and broadcasts; a trashed scheduled broadcast is not sent', async () => {
    const token = await tokenFor('editor')
    expect((await call('/v1/qrs/q2', { token, method: 'DELETE' })).status).toBe(204)
    expect(((await call('/v1/qrs', { token })).json.items as { id: string }[]).map((q) => q.id)).not.toContain('q2')
    expectProblem(await call('/v1/qrs/q2', { token, method: 'DELETE' }), 404)
    expect((await call('/v1/qrs/q2/restore', { token, method: 'POST' })).json).toMatchObject({ id: 'q2' })
    expectProblem(await call('/v1/qrs/q2/restore', { token, method: 'POST' }), 409, 'not_deleted')

    const soon = new Date(Date.now() + 30_000).toISOString()
    const b = (await call('/v1/broadcasts', { token, body: { title: 'Later', body: 'x', audience: 'all', scheduledAt: soon }, headers: key('bc') })).json
    expect((await call(`/v1/broadcasts/${b.id}`, { token, method: 'DELETE' })).status).toBe(204)
    expect(((await call('/v1/broadcasts', { token })).json.items as { id: string }[]).map((x) => x.id)).not.toContain(b.id)
    await runEveryMinute(env, new Date(Date.now() + 120_000))
    const row = await env.DB.prepare('SELECT sent_at FROM broadcasts WHERE id = ?').bind(b.id).first<{ sent_at: string | null }>()
    expect(row?.sent_at).toBeNull()
    const back = await call(`/v1/broadcasts/${b.id}/restore`, { token, method: 'POST' })
    expect(back.json).toMatchObject({ id: b.id })
    expect(back.json.deletedAt).toBeUndefined()
  })

  it('deletes a trashed event for good; not before it is in the trash', async () => {
    const token = await tokenFor('editor')
    const ev = (await call('/v1/events', { token, body: { name: 'Forever', date: '2026-12-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 }, headers: key('ev') })).json
    expectProblem(await call(`/v1/events/${ev.id}?permanent=true`, { token, method: 'DELETE' }), 409, 'not_in_trash')
    expect((await call(`/v1/events/${ev.id}`, { token, method: 'DELETE' })).status).toBe(204)
    expect((await call(`/v1/events/${ev.id}?permanent=true`, { token, method: 'DELETE' })).status).toBe(204)
    expect(await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(ev.id).first()).toBeNull()
    expect(((await call('/v1/trash/events', { token })).json.items as { id: string }[]).map((e) => e.id)).not.toContain(ev.id)
  })

  it('the daily job purges photos, albums, QR codes and broadcasts trashed over 30 days ago', async () => {
    const token = await tokenFor('editor')
    const [old, recent] = await firstPhotos('ev_portfolio', 2)
    await call('/v1/photos/bulk-delete', { token, body: { ids: [old.id, recent.id] } })
    await env.DB.prepare('UPDATE photos SET deleted_at = ? WHERE id = ?').bind(daysAgo(31), old.id).run()
    const album = (await call('/v1/events/ev_portfolio/albums', { token, body: { name: 'Old album' } })).json
    await call(`/v1/albums/${album.id}`, { token, method: 'DELETE' })
    await env.DB.prepare('UPDATE albums SET deleted_at = ? WHERE id = ?').bind(daysAgo(40), album.id).run()
    const qr = (await call('/v1/qrs', { token, body: { name: 'Old QR', eventId: 'ev_portfolio' } })).json
    await call(`/v1/qrs/${qr.id}`, { token, method: 'DELETE' })
    await env.DB.prepare('UPDATE smart_qrs SET deleted_at = ? WHERE id = ?').bind(daysAgo(31), qr.id).run()

    const r = await runDaily(env)
    expect(r.photos).toBeGreaterThanOrEqual(1)
    expect(r.albums).toBeGreaterThanOrEqual(1)
    expect(r.qrs).toBeGreaterThanOrEqual(1)
    expect(await env.DB.prepare('SELECT id FROM photos WHERE id = ?').bind(old.id).first()).toBeNull()
    expect(await env.DB.prepare('SELECT id FROM albums WHERE id = ?').bind(album.id).first()).toBeNull()
    expect(await env.DB.prepare('SELECT id FROM smart_qrs WHERE id = ?').bind(qr.id).first()).toBeNull()
    // Recently trashed stays restorable.
    expect((await call('/v1/photos/restore', { token, body: { ids: [recent.id] } })).json.restored).toBe(1)
  })
})

describe('photos', () => {
  it('lists newest first with working cursors (list and ids)', async () => {
    const token = await tokenFor('editor')
    const seen: { id: string; capturedAt: string }[] = []
    let cursor: string | null = null
    do {
      const q = new URLSearchParams({ albumId: 'ev_riya_al0', sort: 'newest', limit: '15', ...(cursor ? { cursor } : {}) })
      const r = await call(`/v1/events/ev_riya/photos?${q}`, { token })
      expect(r.status).toBe(200)
      seen.push(...r.json.items)
      cursor = r.json.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(40)
    expect(new Set(seen.map((p) => p.id)).size).toBe(40)
    for (let i = 1; i < seen.length; i++) expect(seen[i - 1].capturedAt >= seen[i].capturedAt).toBe(true)
    const ids = (await call('/v1/events/ev_riya/photo-ids?albumId=ev_riya_al0&sort=newest', { token })).json.ids
    expect(ids).toEqual(seen.map((p) => p.id))
    const oldest = (await call('/v1/events/ev_riya/photo-ids?albumId=ev_riya_al0&sort=capture', { token })).json.ids
    expect(oldest).toEqual([...ids].reverse())
  })

  it('carries quality, views and rotation, and rotates by multiples of 90', async () => {
    const token = await tokenFor('editor')
    const [ph] = await firstPhotos('ev_mehta', 1)
    expect(ph).toMatchObject({ quality: 'web', rotation: 0, views: expect.any(Number) })
    expect((await call('/v1/photos/rotate', { token, body: { ids: [ph.id], degrees: 90 }, headers: key('rot') })).json.updated).toBe(1)
    expect((await call(`/v1/photos/${ph.id}`, { token })).json.rotation).toBe(90)
    await call('/v1/photos/rotate', { token, body: { ids: [ph.id], degrees: -180 } })
    expect((await call(`/v1/photos/${ph.id}`, { token })).json.rotation).toBe(270)
    expectProblem(await call('/v1/photos/rotate', { token, body: { ids: [ph.id], degrees: 45 } }), 422, 'validation_failed')
  })

  it('rejects guest uploads so guests never see them', async () => {
    const token = await tokenFor('editor')
    const pending = ((await call('/v1/events/ev_riya/photos?albumId=ev_riya_guest&limit=200', { token })).json.items as { id: string; reviewStatus?: string }[])
      .filter((p) => p.reviewStatus === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    expect((await call('/v1/photos/review', { token, body: { ids: [pending[0].id], status: 'rejected' } })).json.updated).toBe(1)
    expect((await call(`/v1/photos/${pending[0].id}`, { token })).json.reviewStatus).toBe('rejected')
    const guest = await pinToken(RIYA)
    const pub = (await call(`/v1/public/events/${RIYA}/photos?albumId=ev_riya_guest&limit=200`, { token: guest })).json.items as { id: string }[]
    expect(pub.map((p) => p.id)).not.toContain(pending[0].id)
  })

  it('counts guest photo views per photo and in the studio stats', async () => {
    const [ph] = await firstPhotos('ev_tessera', 1)
    const before = (await call('/v1/studio/stats?month=2026-09', { token: await tokenFor('editor') })).json.allTime.photoViews
    expect((await call('/v1/public/views', { body: { photoIds: [ph.id] } })).status).toBe(204)
    expect((await call(`/v1/photos/${ph.id}`, { token: await tokenFor('editor') })).json.views).toBe(ph.views + 1)
    expect((await call('/v1/studio/stats?month=2026-09', { token: await tokenFor('editor') })).json.allTime.photoViews).toBe(before + 1)
  })
})

describe('guests', () => {
  it('signs guests up with a phone only and recognises them again', async () => {
    const a = await call(`/v1/public/events/${TESSERA}/register`, { body: { name: 'Phone Only', phone: '+91 98450 55012' } })
    expect(a.status).toBe(200)
    expect(a.json.guest).toMatchObject({ name: 'Phone Only', email: '', phone: '+91 98450 55012' })
    const b = await call(`/v1/public/events/${TESSERA}/register`, { body: { name: 'Phone Again', phone: '9845055012' } })
    expect(b.json.guest.id).toBe(a.json.guest.id)
    expectProblem(await call(`/v1/public/events/${TESSERA}/register`, { body: { name: 'Nobody' } }), 422, 'validation_failed')
  })

  it('marks an invited host as accepted when they sign up with their email', async () => {
    const token = await tokenFor('editor')
    const hosts = (await call('/v1/events/ev_riya', { token })).json.hosts as { id: string; access: string; status: string }[]
    expect(hosts.find((h) => h.id === 'h2')).toMatchObject({ access: 'upload', status: 'invited' })
    await call(`/v1/public/events/${RIYA}/register`, { token: await pinToken(RIYA), body: { name: 'Aman Rao', email: 'aman.rao@gmail.com' } })
    const after = (await call('/v1/events/ev_riya', { token })).json.hosts as { id: string; status: string }[]
    expect(after.find((h) => h.id === 'h2')?.status).toBe('accepted')
  })

  it('invites new hosts server-side and keeps status server-owned', async () => {
    const token = await tokenFor('editor')
    const ev = (await call('/v1/events/ev_tessera', { token })).json
    const hosts = [...ev.hosts, { id: 'h_new', name: 'Second Shooter', email: 'second@example.com', role: 'host', access: 'upload', status: 'accepted' }]
    const r = await call('/v1/events/ev_tessera', { token, method: 'PATCH', body: { hosts } })
    expect(r.status).toBe(200)
    expect(r.json.hosts.find((h: { id: string }) => h.id === 'h_new')).toMatchObject({ access: 'upload', status: 'invited', invitedAt: expect.any(String) })
  })

  it('removes a guest’s access (their session stops working) and restores it', async () => {
    const reg = await call(`/v1/public/events/${TESSERA}/register`, { body: { name: 'Remove Me', email: uniqueEmail('rm') } })
    const gid = reg.json.guest.id
    const token = await tokenFor('editor')
    expect((await call(`/v1/guests/${gid}`, { token, method: 'DELETE' })).status).toBe(204)
    expect(((await call('/v1/events/ev_tessera/guests', { token })).json.items as { id: string }[]).map((g) => g.id)).not.toContain(gid)
    expectProblem(await call(`/v1/public/events/${TESSERA}/photos`, { token: reg.json.token }), 403, 'guest_removed')
    expect((await call(`/v1/guests/${gid}/restore`, { token, method: 'POST' })).json).toMatchObject({ id: gid })
    expect((await call(`/v1/public/events/${TESSERA}/photos`, { token: reg.json.token })).status).toBe(200)
  })

  it('reopens an access request (undo approve)', async () => {
    const token = await tokenFor('editor')
    expect((await call('/v1/access-requests/ar2/resolve', { token, body: { approve: true } })).status).toBe(204)
    const guests = (await call('/v1/events/ev_riya/guests?limit=200', { token })).json.items as { email: string }[]
    expect(guests.some((g) => g.email === 'hello@lumen.in')).toBe(true)
    expectProblem(await call('/v1/access-requests/ar2/resolve', { token, body: { approve: false } }), 409, 'already_resolved')
    const r = await call('/v1/access-requests/ar2/reopen', { token, method: 'POST', headers: key('reopen') })
    expect(r.json).toMatchObject({ id: 'ar2', name: 'Studio Lumen' })
    const after = (await call('/v1/events/ev_riya/guests?limit=200', { token })).json.items as { email: string }[]
    expect(after.some((g) => g.email === 'hello@lumen.in')).toBe(false)
    expect(((await call('/v1/events/ev_riya/access-requests', { token })).json.items as { id: string }[]).map((x) => x.id)).toContain('ar2')
    expectProblem(await call('/v1/access-requests/ar2/reopen', { token, method: 'POST' }), 409, 'not_resolved')
  })

  it('"Notify me": subscribes on an empty gallery, refuses a live one, and messages when photos go live', async () => {
    expectProblem(await call(`/v1/public/events/${RIYA}/notify`, { body: { phone: '+91 98450 55012' } }), 409, 'already_live')
    const r = await call(`/v1/public/events/${ANAYA}/notify`, { body: { phone: '98450 55012' }, headers: key('ntf') })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ eventId: 'ev_anaya', phone: '+919845055012' })
    await call(`/v1/public/events/${ANAYA}/notify`, { body: { phone: '+91 90000 11111' } })
    expect((await call(`/v1/public/events/${ANAYA}/notify/cancel`, { body: { phone: '+91 90000 11111' } })).status).toBe(204)
    expectProblem(await call(`/v1/public/events/${ANAYA}/notify`, { body: { phone: 'abc' } }), 422)

    // Nothing to send while there are no photos.
    await runEveryMinute(env)
    const pending = await env.DB.prepare("SELECT notified_at FROM notify_requests WHERE event_id = 'ev_anaya' AND phone = '+919845055012'").first<{ notified_at: string | null }>()
    expect(pending?.notified_at).toBeNull()

    // The first photo goes live → the sweep messages the waiting guest once; the cancelled one is skipped.
    await env.DB.prepare(`INSERT INTO photos (id, event_id, album_id, studio_id, filename, seq, captured_at, tone, status, hidden, favourites, downloads, faces, exif, uploaded_by, source, quality, created_at, views, rotation)
      VALUES ('ph_anaya1', 'ev_anaya', 'ev_anaya_guest', 'st_northlight', 'a.jpg', 1, ?, '{"stops":["#000","#111","#222"],"angle":0}', 'ready', 0, 0, 0, '[]', '{"width":1,"height":1,"sizeBytes":1}', 'You', 'web', 'web', ?, 0, 0)`)
      .bind(new Date().toISOString(), new Date().toISOString()).run()
    const sent = await runEveryMinute(env)
    expect(sent.notified).toBe(1)
    const rows = await env.DB.prepare("SELECT phone, notified_at FROM notify_requests WHERE event_id = 'ev_anaya' ORDER BY phone").all<{ phone: string; notified_at: string | null }>()
    expect(rows.results.find((x) => x.phone === '+919845055012')?.notified_at).toEqual(expect.any(String))
    expect(rows.results.find((x) => x.phone === '+919000011111')?.notified_at).toBeNull()
    expect((await runEveryMinute(env)).notified).toBe(0)
  })
})

describe('faces', () => {
  it('answers faceFound: false for a selfie without a usable face', async () => {
    const none = await call(`/v1/public/events/${TESSERA}/faces/search`, { body: { key: 'k1', faces: 0 } })
    expect(none.status).toBe(200)
    expect(none.json).toEqual({ faceFound: false, reason: 'no_face', personId: null, photoIds: [] })
    const tiny = await call(`/v1/public/events/${TESSERA}/faces/search`, { body: { key: 'k1', image: { width: 40, height: 40 } } })
    expect(tiny.json.faceFound).toBe(false)
    const ok = await call(`/v1/public/events/${TESSERA}/faces/search`, { body: { key: 'k1', faces: 1, image: { width: 800, height: 800 } } })
    expect(ok.json.faceFound).toBe(true)
    const token = await tokenFor('editor')
    expect((await call('/v1/events/ev_riya/faces/match', { token, body: { key: 'k2', faces: 0 } })).json).toMatchObject({ faceFound: false, reason: 'no_face' })
    expect((await call('/v1/events/ev_riya/faces/match', { token, body: { key: 'k2' } })).json).toMatchObject({ faceFound: true, personId: expect.any(String) })
  })
})

describe('stats', () => {
  it('reports event totals and face finding progress', async () => {
    const token = await tokenFor('editor')
    const s = await call('/v1/events/ev_riya/stats', { token })
    expect(s.status).toBe(200)
    expect(s.json).toMatchObject({ eventId: 'ev_riya', visits: 1420 + 640 + 250, faceSearches: expect.any(Number), guests: expect.any(Number), processing: 0 })
    expect(s.json.downloads).toBeGreaterThan(0)
    expect(s.json.photoViews).toBeGreaterThan(s.json.downloads)
    expect(s.json.faces).toEqual({ ready: s.json.photos, total: s.json.photos, pending: 0 })
    const [ph] = await firstPhotos('ev_riya', 1)
    await env.DB.prepare('UPDATE photos SET faces_indexed_at = NULL WHERE id = ?').bind(ph.id).run()
    expect((await call('/v1/events/ev_riya/stats', { token })).json.faces).toMatchObject({ pending: 1, ready: s.json.photos - 1 })
    expect((await call('/v1/events/ev_tessera/stats', { token: await tokenFor('uploader') })).status).toBe(200)
    expectProblem(await call('/v1/events/ev_riya/stats', { token: await tokenFor('uploader') }), 404) // not assigned to them
  })

  it('reports studio totals for a month, the month before and all time', async () => {
    const token = await tokenFor('editor')
    const r = await call('/v1/studio/stats?month=2026-09', { token })
    expect(r.status).toBe(200)
    expect(r.json.month).toBe('2026-09')
    expect(r.json.thisMonth.visits).toBeGreaterThan(0)
    expect(r.json.thisMonth.faceSearches).toBeGreaterThan(0)
    expect(r.json.thisMonth.photosDelivered).toBeGreaterThan(0)
    expect(r.json.thisMonth.sales).toBeGreaterThan(0)
    expect(r.json.thisMonth.orders).toBeGreaterThan(0)
    expect(r.json.lastMonth.visits).toBeGreaterThan(0) // the marathon (August)
    expect(r.json.allTime.visits).toBeGreaterThanOrEqual(r.json.thisMonth.visits + r.json.lastMonth.visits)
    // A gallery visit counts today.
    const today = new Date().toISOString().slice(0, 7)
    const before = (await call(`/v1/studio/stats?month=${today}`, { token })).json.thisMonth.visits
    await call(`/v1/public/events/${TESSERA}`)
    expect((await call(`/v1/studio/stats?month=${today}`, { token })).json.thisMonth.visits).toBe(before + 1)
    expectProblem(await call('/v1/studio/stats?month=2026-13', { token }), 422)
    expectProblem(await call('/v1/studio/stats', { token: await tokenFor('uploader') }), 403)
  })
})

describe('selling', () => {
  it('applies per-event price overrides to guest prices and orders; sale watermark follows the event flag', async () => {
    const owner = await tokenFor('owner')
    const r = await call('/v1/events/ev_mehta/settings', { token: owner, method: 'PATCH', body: { priceOverrides: { single: 99 } } })
    expect(r.json.settings).toMatchObject({ priceOverrides: { single: 99 }, forSaleWatermark: true })
    const guest = await pinToken(MEHTA)
    const prices = (await call(`/v1/public/events/${MEHTA}/prices`, { token: guest })).json.items as { id: string; price: number }[]
    expect(prices.find((p) => p.id === 'single')?.price).toBe(99)
    expect(prices.find((p) => p.id === 'multi')?.price).toBe(129)
    const [ph] = (await call(`/v1/public/events/${MEHTA}/photos?limit=1`, { token: guest })).json.items
    const o = await call(`/v1/public/events/${MEHTA}/orders`, { token: guest, body: { items: [{ priceId: 'single', photoIds: [ph.id] }], method: 'upi', buyer: { name: 'Cheap', email: 'cheap@example.com' } } })
    expect(o.json.paid).toBe(99)

    expect((await call(`/v1/public/events/${MEHTA}/watermark`, { token: guest })).json.sale).toMatchObject({ template: 'forsale' })
    await call('/v1/events/ev_mehta/settings', { token: owner, method: 'PATCH', body: { forSaleWatermark: false } })
    expect((await call(`/v1/public/events/${MEHTA}/watermark`, { token: guest })).json.sale).toBeUndefined()
    // The studio's own list is unchanged.
    expect(((await call('/v1/prices', { token: owner })).json.items as { id: string; price: number }[]).find((p) => p.id === 'single')?.price).toBe(149)
    expectProblem(await call('/v1/events/ev_mehta/settings', { token: owner, method: 'PATCH', body: { priceOverrides: { single: -1 } } }), 422)
  })

  it('sets tracking numbers and resends download links', async () => {
    const owner = await tokenFor('owner')
    const t = await call('/v1/orders/o1041', { token: owner, method: 'PATCH', body: { trackingNumber: 'DTDC Z1234' } })
    expect(t.json).toMatchObject({ id: 'o1041', trackingNumber: 'DTDC Z1234' })
    expect((await call('/v1/orders/o1041', { token: owner, method: 'PATCH', body: { trackingNumber: '' } })).json.trackingNumber).toBeUndefined()
    expectProblem(await call('/v1/orders/o1041/resend-link', { token: owner, method: 'POST' }), 422, 'no_buyer_email')
    expectProblem(await call('/v1/orders/o1040/resend-link', { token: owner, method: 'POST' }), 409, 'order_not_deliverable')
    const guest = await pinToken(MEHTA)
    const [ph] = (await call(`/v1/public/events/${MEHTA}/photos?limit=1`, { token: guest })).json.items
    const o = (await call(`/v1/public/events/${MEHTA}/orders`, { token: guest, body: { items: [{ priceId: 'single', photoIds: [ph.id] }], method: 'card', buyer: { name: 'Link Me', email: 'link.me@example.com' } } })).json
    const r = await call(`/v1/orders/${o.id}/resend-link`, { token: owner, method: 'POST', headers: key('resend') })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ sentTo: 'link.me@example.com', order: { id: o.id, linkSentAt: expect.any(String) } })
    expectProblem(await call(`/v1/orders/${o.id}/resend-link`, { token: await tokenFor('editor'), method: 'POST' }), 403)
  })

  it('checks the payout account: verified, name mismatch with the bank’s name, and again on demand', async () => {
    const owner = await tokenFor('owner')
    const v = await call('/v1/store/payout/verify', { token: owner, method: 'POST', headers: key('pv') })
    expect(v.json).toMatchObject({ status: 'verified', nameAtBank: 'NORTHLIGHT STUDIO LLP', bankName: 'HDFC Bank' })
    const bad = await call('/v1/store/settings', { token: owner, method: 'PATCH', body: { payout: { holder: 'Rahul Patel' } } })
    expect(bad.json.payout).toMatchObject({ verified: false, check: { status: 'name_mismatch', nameAtBank: 'RAHUL PATEL' } })
    expectProblem(await call('/v1/payouts', { token: owner, body: { amount: 10 } }), 409, 'payout_account_unverified')
    const good = await call('/v1/store/settings', { token: owner, method: 'PATCH', body: { payout: { holder: 'Northlight Studio LLP', accountNumber: '50100012344471' } } })
    expect(good.json.payout).toMatchObject({ verified: true, check: { status: 'verified' } })
    expectProblem(await call('/v1/store/payout/verify', { token: await tokenFor('editor'), method: 'POST' }), 403)
  })

  it('changes plan server-side: GST, wallet payment in one call, 402 when the wallet is short', async () => {
    const owner = await tokenFor('owner')
    const before = (await call('/v1/wallet', { token: owner })).json
    const r = await call('/v1/studio/plan', { token: owner, body: { planId: 'studio', billing: 'yearly', payWith: 'wallet' }, headers: key('plan') })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ payWith: 'wallet', usage: { planId: 'studio', period: 'yearly' } })
    expect(r.json.gst).toBeCloseTo(r.json.charged * 0.18, 2)
    expect(r.json.total).toBeCloseTo(r.json.charged + r.json.gst, 2)
    expect(r.json.purchase).toMatchObject({ kind: 'plan', method: 'credits', amount: r.json.total })
    expect((await call('/v1/wallet', { token: owner })).json.balance).toBeCloseTo(before.balance - r.json.total, 2)

    const fresh = await newStudio()
    const short = await call('/v1/studio/plan', { token: fresh, body: { planId: 'pro', billing: 'yearly', payWith: 'wallet' } })
    expectProblem(short, 402, 'insufficient_credits')
    expect((await call('/v1/studio/usage', { token: fresh })).json.planId).toBe('starter')
    const card = await call('/v1/studio/plan', { token: fresh, body: { planId: 'pro', billing: 'quarterly', payWith: 'upi' } })
    expect(card.json.purchase).toMatchObject({ method: 'upi', amount: card.json.total })
    expectProblem(await call('/v1/studio/plan', { token: fresh, body: { planId: 'pro' } }), 422)
  })
})

describe('studio', () => {
  it('checks gallery addresses', async () => {
    const token = await tokenFor('editor')
    const check = async (h: string) => (await call(`/v1/studio/handle-check?handle=${encodeURIComponent(h)}`, { token })).json
    expect(await check('northlight')).toEqual({ handle: 'northlight', available: true, reason: 'yours' })
    expect(await check('admin')).toMatchObject({ available: false, reason: 'reserved' })
    expect(await check('a')).toMatchObject({ available: false, reason: 'invalid' })
    expect(await check('Free-Handle-42')).toEqual({ handle: 'free-handle-42', available: true })
    const other = await newStudio()
    expect((await call('/v1/studio/handle-check?handle=northlight', { token: other })).json).toMatchObject({ available: false, reason: 'taken' })
  })

  it('shares the studio WhatsApp number with guests', async () => {
    const pub = await call(`/v1/public/events/${TESSERA}`)
    expect(pub.json.studio.whatsapp).toBe('+91 98200 41177')
    const token = await tokenFor('editor')
    expect((await call('/v1/studio', { token, method: 'PATCH', body: { whatsapp: '+91 90000 22222' } })).json.whatsapp).toBe('+91 90000 22222')
    expect((await call(`/v1/public/events/${TESSERA}`)).json.studio.whatsapp).toBe('+91 90000 22222')
  })

  it('keeps each camera’s last upload time', async () => {
    const token = await tokenFor('editor')
    const cams = (await call('/v1/cameras', { token })).json.items as { id: string; lastUploadAt?: string }[]
    expect(cams.find((c) => c.id === 'c1')?.lastUploadAt).toBe('2026-09-26T16:40:00.000Z')
    expect(cams.find((c) => c.id === 'c3')?.lastUploadAt).toBeUndefined()
    const start = await call('/v1/events/ev_tessera/uploads', { token, body: { albumId: 'ev_tessera_al0', source: 'camera', files: [{ filename: 'IMG_9000.JPG', size: 10, external: true }] }, headers: key('up') })
    expect(start.status).toBe(201)
    await call(`/v1/events/ev_tessera/uploads/${start.json.uploadId}/complete`, { token, body: { files: [{ photoId: start.json.files[0].photoId }] }, headers: key('up') })
    const after = (await call('/v1/cameras', { token })).json.items as { id: string; lastUploadAt?: string }[]
    expect(Date.parse(after.find((c) => c.id === 'c1')!.lastUploadAt!)).toBeGreaterThan(Date.parse('2026-09-27T00:00:00Z'))
  })
})
