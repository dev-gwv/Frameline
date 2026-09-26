import { describe, expect, it } from 'vitest'
import { encodeGuestToken } from '@frameline/shared'
import { call, expectProblem, freshIp, tokenFor, uniqueEmail } from './helpers'

const RIYA = '6402F9F' // link-pin, face privacy on, PIN 5211
const MEHTA = '7A1C0B2' // link-pin, store on
const TESSERA = '3F9E21D' // open link, no face privacy

async function pinSession(shortId: string, ip = freshIp()) {
  const r = await call(`/v1/public/events/${shortId}/pin`, { body: { pin: '5211' }, ip })
  expect(r.status).toBe(200)
  return r.json as { token: string; seeAll: boolean; eventId: string }
}

describe('public event + PIN', () => {
  it('returns a safe landing payload without the PIN', async () => {
    const r = await call(`/v1/public/events/${RIYA.toLowerCase()}`)
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ shortId: RIYA, name: 'Riya & Kabir Wedding', studio: { followCode: 'FA-KCGWHY', handle: 'northlight' } })
    expect(r.json.settings.pin).toBeUndefined()
    expect(r.json.settings.access).toBe('link-pin')
    expect(r.json.albums.map((a: { kind: string }) => a.kind)).toContain('guest')
    expect(r.json.blocked).toBeUndefined()
    expect(r.json.hosts).toBeUndefined()
    expect((await call('/v1/public/events/2A6F1C9')).json.blocked).toBe('archived')
    expectProblem(await call('/v1/public/events/0000000'), 404)
  })

  it('locks the PIN after 5 wrong tries', async () => {
    const ip = freshIp()
    expectProblem(await call(`/v1/public/events/${RIYA}/photos`, { ip }), 401, 'pin_required')
    for (let left = 4; left >= 1; left--) {
      const r = await call(`/v1/public/events/${RIYA}/pin`, { body: { pin: '0000' }, ip })
      expectProblem(r, 401, 'invalid_pin')
      expect(r.json.attemptsRemaining).toBe(left)
    }
    const locked = await call(`/v1/public/events/${RIYA}/pin`, { body: { pin: '0000' }, ip })
    expectProblem(locked, 429, 'pin_locked')
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)
    expectProblem(await call(`/v1/public/events/${RIYA}/pin`, { body: { pin: '5211' }, ip }), 429, 'pin_locked')
    // Another device is unaffected, and a typed PIN sees every photo.
    const s = await pinSession(RIYA)
    expect(s.seeAll).toBe(true)
    const photos = await call(`/v1/public/events/${RIYA}/photos?limit=3`, { token: s.token })
    expect(photos.status).toBe(200)
    expect(photos.json.items).toHaveLength(3)
  })
})

describe('guests, photos, faces, favourites', () => {
  it('registers a guest who then shows up in the studio’s Guests list', async () => {
    const s = await pinSession(RIYA)
    const email = uniqueEmail('guest')
    const reg = await call(`/v1/public/events/${RIYA}/register`, { token: s.token, body: { name: 'Dadi ji', email, phone: '+91 90000 00000' } })
    expect(reg.status).toBe(200)
    expect(reg.json).toMatchObject({ seeAll: true, guest: { name: 'Dadi ji', email } })
    const guests = await call('/v1/events/ev_riya/guests?limit=200', { token: await tokenFor('editor') })
    expect(guests.json.items.some((g: { email: string }) => g.email === email)).toBe(true)
    const activity = await call('/v1/activity?limit=5', { token: await tokenFor('editor') })
    expect(activity.json.items[0]).toMatchObject({ kind: 'registration', title: 'Dadi ji registered' })
  })

  it('hides pending guest uploads, hidden and processing photos', async () => {
    const s = await pinSession(RIYA)
    const r = await call(`/v1/public/events/${RIYA}/photos?albumId=ev_riya_guest&limit=200`, { token: s.token })
    expect(r.status).toBe(200)
    expect(r.json.total).toBe(7) // 12 guest uploads, 5 awaiting review
    for (const p of r.json.items) expect(p.reviewStatus).not.toBe('pending')
    // Approving one makes it visible.
    const pending = (await call('/v1/events/ev_riya/photos?albumId=ev_riya_guest&limit=200', { token: await tokenFor('editor') })).json.items
      .filter((p: { reviewStatus?: string }) => p.reviewStatus === 'pending')
    expect((await call('/v1/photos/review', { token: await tokenFor('editor'), body: { ids: [pending[0].id], status: 'approved' } })).json.updated).toBe(1)
    expect((await call(`/v1/public/events/${RIYA}/photos?albumId=ev_riya_guest&limit=200`, { token: s.token })).json.total).toBe(8)
  })

  it('face search matches deterministically in dev and scopes browsing under face privacy', async () => {
    const reg = await call(`/v1/public/events/${RIYA}/register`, { token: (await pinSession(RIYA)).token, body: { name: 'Neha', email: uniqueEmail('face') } })
    const found = await call(`/v1/public/events/${RIYA}/faces/search`, { token: reg.json.token, body: { key: 'ev_riya:selfie.jpg:12345' } })
    expect(found.status).toBe(200)
    expect(['p_g1', 'p_g2', 'p_g3']).toContain(found.json.personId)
    const again = await call(`/v1/public/events/${RIYA}/faces/search`, { token: reg.json.token, body: { key: 'ev_riya:selfie.jpg:12345' } })
    expect(again.json).toEqual(found.json)
    const mine = await call(`/v1/public/events/${RIYA}/photos?personId=${found.json.personId}&limit=200`, { token: reg.json.token })
    expect(mine.json.items.map((p: { id: string }) => p.id).sort()).toEqual([...found.json.photoIds].sort())
  })

  it('favourites update the guest and the photo; downloads are counted', async () => {
    const reg = await call(`/v1/public/events/${TESSERA}/register`, { body: { name: 'Fav Guest', email: uniqueEmail('fav') } })
    const [photo] = (await call(`/v1/public/events/${TESSERA}/photos?limit=1`, { token: reg.json.token })).json.items
    const on = await call(`/v1/public/photos/${photo.id}/favourite`, { token: reg.json.token, body: { on: true } })
    expect(on.json.favourites).toBe(photo.favourites + 1)
    expect((await call(`/v1/public/photos/${photo.id}/favourite`, { token: reg.json.token, body: { on: true } })).json.favourites).toBe(photo.favourites + 1)
    const guests = (await call('/v1/events/ev_tessera/guests?limit=200', { token: await tokenFor('owner') })).json.items
    expect(guests.find((g: { id: string }) => g.id === reg.json.guestId).favourites).toContain(photo.id)
    expect((await call(`/v1/public/photos/${photo.id}/favourite`, { token: reg.json.token, body: { on: false } })).json.favourites).toBe(photo.favourites)

    expect((await call('/v1/public/downloads', { body: { photoIds: [photo.id] } })).status).toBe(204)
    expect((await call(`/v1/photos/${photo.id}`, { token: await tokenFor('owner') })).json.downloads).toBe(photo.downloads + 1)
  })
})

describe('orders, enquiries, studio profile, links', () => {
  it('creates a paid order with the studio’s share in the ledger (idempotent)', async () => {
    const s = await pinSession(MEHTA)
    const photos = (await call(`/v1/public/events/${MEHTA}/photos?limit=2`, { token: s.token })).json.items
    const key = `ord-${crypto.randomUUID()}`
    const body = { items: [{ priceId: 'single', photoIds: photos.map((p: { id: string }) => p.id) }], method: 'upi', buyer: { name: 'Priya S.', email: 'priya.s@example.com' } }
    const r = await call(`/v1/public/events/${MEHTA}/orders`, { token: s.token, body, headers: { 'idempotency-key': key } })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ status: 'paid', paid: 298, share: 268.2, eventId: 'ev_mehta', method: 'upi', photoIds: photos.map((p: { id: string }) => p.id) })
    const replay = await call(`/v1/public/events/${MEHTA}/orders`, { token: s.token, body, headers: { 'idempotency-key': key } })
    expect(replay.json.id).toBe(r.json.id)
    const owner = await tokenFor('owner')
    // Seed entries are dated later today (demo clock), so look the new lines up rather than assuming order.
    const ledger = (await call('/v1/ledger?limit=200', { token: owner })).json.items
    expect(ledger.find((l: { description: string }) => l.description === `Order #${r.json.number} · Mehta Sangeet Night`)).toMatchObject({ type: 'sale', amount: 268.2 })
    expect((await call('/v1/orders?limit=200', { token: owner })).json.items.some((o: { id: string }) => o.id === r.json.id)).toBe(true)
    expectProblem(await call(`/v1/public/events/${TESSERA}/orders`, { body }), 409, 'store_disabled')
  })

  it('sends enquiries to the studio from a gallery or the profile', async () => {
    const e1 = await call(`/v1/public/events/${TESSERA}/enquiries`, { body: { name: 'Ravi', phone: '+91 98000 00000', message: 'Corporate shoot in May?' } })
    expect(e1.status).toBe(201)
    expect(e1.json).toMatchObject({ status: 'new', source: 'Tessera Labs Offsite gallery', eventId: 'ev_tessera' })
    const e2 = await call('/v1/public/studios/fa-kcgwhy/enquiries', { body: { name: 'Anu', email: 'anu@example.com', message: 'Hi' } })
    expect(e2.json.source).toBe('Studio profile')
    const list = (await call('/v1/enquiries?limit=5', { token: await tokenFor('editor') })).json.items
    expect(list.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining([e1.json.id, e2.json.id]))
    const upd = await call(`/v1/enquiries/${e1.json.id}`, { token: await tokenFor('editor'), method: 'PATCH', body: { status: 'replied', note: 'Called back' } })
    expect(upd.json).toMatchObject({ status: 'replied', note: 'Called back' })
  })

  it('serves the studio profile and counts a follow once per device', async () => {
    const r = await call('/v1/public/studios/FA-KCGWHY')
    expect(r.json.studio.services).toHaveLength(4)
    expect(r.json.studio.faq.length).toBeGreaterThan(0)
    expect(r.json.featured.map((e: { id: string }) => e.id)).toEqual(['ev_marathon', 'ev_portfolio'])
    const ip = freshIp()
    const f1 = await call('/v1/public/studios/northlight/follow', { method: 'POST', ip })
    const f2 = await call('/v1/public/studios/northlight/follow', { method: 'POST', ip })
    expect(f2.json.followers).toBe(f1.json.followers)
    expect(f1.json.followers).toBeGreaterThanOrEqual(1921)
  })

  it('signs personal links; VIP links carry a session, forged tokens don’t', async () => {
    const editor = await tokenFor('editor')
    const vip = await call('/v1/events/ev_riya/guest-links', { token: editor, body: { n: 'Priya', vip: { skipLogin: true, pin: true } } })
    expect(vip.status).toBe(201)
    expect(vip.json).toMatchObject({ kind: 'v', payload: { e: RIYA, n: 'Priya', vip: { skipLogin: true, pin: true } } })
    expect(vip.json.code).toMatch(/^[A-Za-z0-9_-]{14}$/)
    expect(vip.json.url).toBe(`http://localhost:5174/v/${vip.json.code}`)
    const resolved = await call(`/v1/public/links/${vip.json.code}`)
    expect(resolved.json.payload.n).toBe('Priya')
    expect(resolved.json.session.token).toEqual(expect.any(String))
    // PIN embedded but not "all": face privacy still applies.
    expectProblem(await call(`/v1/public/events/${RIYA}/photos`, { token: resolved.json.session.token }), 403, 'face_privacy')
    // Tampered signature → treated as a (bad) legacy token.
    expectProblem(await call(`/v1/public/links/${vip.json.code.slice(0, 8)}zzzzzz`), 404)
    // Unsigned tokens resolve without VIP powers.
    const legacy = await call(`/v1/public/links/${encodeGuestToken({ e: RIYA, n: 'Hacker', vip: { pin: true, all: true } })}`)
    expect(legacy.json).toMatchObject({ kind: 's', payload: { e: RIYA, n: 'Hacker' } })
    expect(legacy.json.payload.vip).toBeUndefined()
    expect(legacy.json.session).toBeUndefined()
  })
})
