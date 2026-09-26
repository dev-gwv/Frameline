import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ApiError, createHttpApi, memoryTokenStore, type HttpUploadFile } from '@frameline/shared'
import { BASE, freshIp, tokenFor, uniqueEmail } from './helpers'

/** The shared HTTP client, talking to this Worker through SELF. */
function client(tokens = memoryTokenStore(), onUnauthorized?: () => void) {
  const ip = freshIp()
  return createHttpApi({
    baseUrl: BASE,
    tokens,
    onUnauthorized,
    fetch: (input, init) => {
      const req = new Request(input as RequestInfo, init)
      req.headers.set('cf-connecting-ip', ip)
      return SELF.fetch(req)
    },
  })
}

describe('createHttpApi against the real API', () => {
  it('signs in with OTP and runs contract methods end to end', async () => {
    const tokens = memoryTokenStore()
    const api = client(tokens)
    const email = uniqueEmail('client')
    const sent = await api.auth.requestOtp(email)
    const session = await api.auth.verifyOtp(email, sent.devCode!, { name: 'Client Test' })
    expect(session.isNewUser).toBe(true)
    expect((await tokens.get())?.refreshToken).toBe(session.refreshToken)

    const studio = await api.getStudio()
    expect(studio.name).toBe("Client Test's Studio")
    const ev = await api.createEvent({ name: 'Client Event', date: '2026-12-01', city: 'Goa', type: 'birthday', preset: 'open-corporate', guestUploadLimit: 10 })
    expect((await api.listEvents()).map((e) => e.id)).toContain(ev.id)
    const album = await api.createAlbum(ev.id, 'Cake')
    expect(await api.updateEventSettings(ev.id, { downloads: 'none' })).toMatchObject({ settings: { downloads: 'none' } })
    // Whole objects can be passed as patches; the client strips read-only fields.
    const renamed = await api.updateEvent(ev.id, { ...ev, name: 'Client Event 2' })
    expect(renamed.name).toBe('Client Event 2')

    const bytes = new Uint8Array(1024).fill(7)
    const files: HttpUploadFile[] = [
      { filename: 'a.jpg', size: bytes.length, blob: new Blob([bytes], { type: 'image/jpeg' }), width: 400, height: 300 },
      { filename: 'b.jpg', size: 0 }, // metadata only
    ]
    const created = await api.uploadPhotos(ev.id, album.id, files, { quality: 'web' })
    expect(created.map((p) => [p.filename, p.status])).toEqual([['a.jpg', 'processing'], ['b.jpg', 'processing']])
    const listed = await api.listPhotos(ev.id, { albumId: album.id })
    expect(listed.total).toBe(2)
    expect((await api.listAlbums(ev.id)).find((a) => a.id === album.id)?.photoCount).toBe(2)

    await api.updatePhotos([created[0].id], { hidden: true })
    expect((await api.getPhoto(created[0].id)).hidden).toBe(true)
    await api.deletePhotos([created[1].id])
    expect((await api.listPhotos(ev.id, { albumId: album.id })).total).toBe(1)
    expect(typeof (await api.resetPin(ev.id))).toBe('string')
    expect(await api.addCredits(100)).toBe(100)
    await api.deleteEvent(ev.id)
    await expect(api.getEvent(ev.id)).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('maps problem+json to ApiError with field errors', async () => {
    const api = client(memoryTokenStore({ accessToken: await tokenFor('owner'), refreshToken: 'x'.repeat(43) }))
    const err = await api.createEvent({ name: '', date: 'nope', city: '', type: 'wedding', preset: 'race', guestUploadLimit: 1 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 422, code: 'validation_failed' })
    expect(err.requestId).toEqual(expect.any(String))
    expect(err.fieldError('name')).toEqual(expect.any(String))
  })

  it('pages listPhotos with limit/offset like the mock', async () => {
    const api = client(memoryTokenStore({ accessToken: await tokenFor('owner'), refreshToken: 'x'.repeat(43) }))
    const all = await api.listPhotos('ev_mehta', { sort: 'sequence' })
    const page = await api.listPhotos('ev_mehta', { sort: 'sequence', offset: 10, limit: 15 })
    expect(page.total).toBe(all.total)
    expect(page.items.map((p) => p.id)).toEqual(all.items.slice(10, 25).map((p) => p.id))
  })

  it('refreshes an expired access token once and retries', async () => {
    const seedTokens = memoryTokenStore()
    const seedApi = client(seedTokens)
    const email = uniqueEmail('refresh')
    await seedApi.auth.verifyOtp(email, (await seedApi.auth.requestOtp(email)).devCode!)
    const good = (await seedTokens.get())!
    const tokens = memoryTokenStore({ accessToken: 'expired.invalid.token', refreshToken: good.refreshToken })
    const api = client(tokens)
    const [a, b] = await Promise.all([api.getStudio(), api.getUsage()]) // concurrent 401s share one refresh
    expect(a.id).toBeTruthy()
    expect(b.planId).toBe('starter')
    const now = (await tokens.get())!
    expect(now.refreshToken).not.toBe(good.refreshToken)
    expect(now.accessToken).not.toBe('expired.invalid.token')
  })

  it('clears tokens and calls onUnauthorized when refresh fails', async () => {
    let called = 0
    const tokens = memoryTokenStore({ accessToken: 'bad', refreshToken: 'y'.repeat(43) })
    const api = client(tokens, () => { called++ })
    await expect(api.getStudio()).rejects.toMatchObject({ status: 401 })
    expect(called).toBe(1)
    expect(await tokens.get()).toBeNull()
  })
})

describe('realtime', () => {
  it('pushes change topics over the EventHub WebSocket', async () => {
    const token = await tokenFor('editor')
    const res = await SELF.fetch(`${BASE}/v1/realtime`, { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `frameline, bearer.${token}` } })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    const got: string[] = []
    const topic = new Promise<void>((resolve) => {
      ws.addEventListener('message', (ev) => {
        const m = JSON.parse(String(ev.data)) as { topic?: string }
        if (m.topic) { got.push(m.topic); if (m.topic === 'misc') resolve() }
      })
    })
    ws.accept()
    const r = await SELF.fetch(`${BASE}/v1/watermark`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'cf-connecting-ip': freshIp() }, body: JSON.stringify({ opacity: 61 }) })
    expect(r.status).toBe(200)
    await topic
    expect(got).toContain('misc')
    ws.close()
  })

  it('rejects unauthenticated upgrades', async () => {
    const res = await SELF.fetch(`${BASE}/v1/realtime`, { headers: { Upgrade: 'websocket' } })
    expect(res.status).toBe(401)
  })
})

describe('createHttpApi guest side', () => {
  it('keeps guest tokens per gallery and runs the guest flow end to end', async () => {
    const api = client()
    const ev = await api.getPublicEvent('7a1c0b2')
    expect(ev.settings.storeEnabled).toBe(true)
    await expect(api.listPublicPhotos('7A1C0B2', { limit: 1 })).rejects.toMatchObject({ status: 401, code: 'pin_required' })
    const err = await api.verifyPin('7A1C0B2', '9999').catch((e) => e)
    expect(err).toMatchObject({ status: 401, code: 'invalid_pin' })
    const session = await api.verifyPin('7A1C0B2', '5211')
    expect(session.seeAll).toBe(true)
    const reg = await api.registerGuest('7A1C0B2', { name: 'Client Guest', email: uniqueEmail('cg') })
    expect(reg.guest.name).toBe('Client Guest')
    const page = await api.listPublicPhotos('7A1C0B2', { limit: 3 })
    expect(page.items).toHaveLength(3)
    const fav = await api.setFavourite(page.items[0].id, true)
    expect(fav.favourites).toBe(page.items[0].favourites + 1)
    await api.recordDownload([page.items[0].id])
    const order = await api.createOrder('7A1C0B2', { items: [{ priceId: 'all', photoIds: [] }], method: 'card', buyer: { name: 'CG', email: 'cg@example.com' } })
    expect(order).toMatchObject({ status: 'paid', paid: 999 })
    const enquiry = await api.createEnquiry({ studio: 'northlight' }, { name: 'X', phone: '+91 90000 00001', email: '', message: 'Hello' })
    expect(enquiry.status).toBe('new')
    expect((await api.getStudioProfile('FA-KCGWHY')).studio.name).toBe('Northlight Studio')
  })
})
