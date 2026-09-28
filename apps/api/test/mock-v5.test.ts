import { afterEach, describe, expect, it, vi } from 'vitest'
import { GST_RATE, TRASH_DAYS, createMockApi, sharedMemoryPersistence, type Persistence } from '@frameline/shared'

/** Contract v5 in the in-memory mock (the same behaviour contract-v5.test.ts checks on apps/api). */
const memory = (): Persistence & { data: string | null } => {
  const p = { data: null as string | null, load: () => p.data, save: (d: string) => { p.data = d } }
  return p
}
const api = (persist: Persistence = memory()) => createMockApi(persist, { latency: 0 })
const DAY = 86_400_000

afterEach(() => { vi.useRealTimers() })

describe('mock v5: trash and restore', () => {
  it('trashes photos softly and restores them', async () => {
    const m = api()
    const before = await m.getEvent('ev_mehta')
    const [a, b] = (await m.listPhotos('ev_mehta', { limit: 2 })).items
    await m.deletePhotos([a.id, b.id])
    await expect(m.getPhoto(a.id)).rejects.toMatchObject({ status: 404 })
    expect((await m.listPhotoIds('ev_mehta'))).not.toContain(a.id)
    expect((await m.getEvent('ev_mehta')).photoCount).toBe(before.photoCount - 2)
    expect(await m.restorePhotos([a.id, b.id, 'nope'])).toEqual({ restored: 2 })
    expect((await m.getPhoto(a.id)).id).toBe(a.id)
    expect((await m.getEvent('ev_mehta')).photoCount).toBe(before.photoCount)
  })

  it('trashes an album with its photos; restoreAlbum brings both back', async () => {
    const m = api()
    const albums = await m.listAlbums('ev_mehta')
    const al = albums.find((x) => x.kind === 'album')!
    const [ph] = (await m.listPhotos('ev_mehta', { albumId: al.id, limit: 1 })).items
    await m.deleteAlbum(al.id)
    expect((await m.listAlbums('ev_mehta')).map((x) => x.id)).not.toContain(al.id)
    await expect(m.getPhoto(ph.id)).rejects.toMatchObject({ status: 404 })
    const back = await m.restoreAlbum(al.id)
    expect(back).toMatchObject({ id: al.id, photoCount: al.photoCount })
    expect(back.deletedAt).toBeUndefined()
    expect((await m.getPhoto(ph.id)).albumId).toBe(al.id)
    await expect(m.restoreAlbum(al.id)).rejects.toMatchObject({ status: 409, code: 'not_deleted' })
  })

  it('trashes QR codes and broadcasts softly', async () => {
    const m = api()
    await m.deleteQR('q1')
    expect((await m.listQRs()).map((q) => q.id)).not.toContain('q1')
    expect((await m.restoreQR('q1')).deletedAt).toBeUndefined()
    await m.deleteBroadcast('b1')
    expect((await m.listBroadcasts()).map((b) => b.id)).not.toContain('b1')
    expect((await m.restoreBroadcast('b1')).id).toBe('b1')
    expect((await m.listBroadcasts()).map((b) => b.id)).toContain('b1')
  })

  it('deletes events forever only from the trash, and purges after TRASH_DAYS', async () => {
    const p = memory()
    const m = api(p)
    await expect(m.deleteEvent('ev_kapoor', { permanent: true })).rejects.toMatchObject({ status: 409, code: 'not_in_trash' })
    await m.deleteEvent('ev_kapoor')
    await m.deleteEvent('ev_kapoor', { permanent: true })
    expect((await m.listDeletedEvents()).map((e) => e.id)).not.toContain('ev_kapoor')
    await expect(m.restoreEvent('ev_kapoor')).rejects.toMatchObject({ status: 404 })

    // Photos trashed long ago are gone for good the next time the mock loads.
    const [ph] = (await m.listPhotos('ev_mehta', { limit: 1 })).items
    await m.deletePhotos([ph.id])
    await m.deleteQR('q2')
    const saved = JSON.parse(p.data!)
    const old = new Date(Date.now() - (TRASH_DAYS + 1) * DAY).toISOString()
    saved.trashed[ph.id] = old
    saved.seed.qrs.find((q: { id: string }) => q.id === 'q2').deletedAt = old
    const later = createMockApi({ load: () => JSON.stringify(saved), save: () => undefined }, { latency: 0 })
    expect(await later.restorePhotos([ph.id])).toEqual({ restored: 0 })
    await expect(later.restoreQR('q2')).rejects.toMatchObject({ status: 404 })
  })
})

describe('mock v5: photos', () => {
  it('sorts newest first, rotates, and rejects guest uploads', async () => {
    const m = api()
    const oldest = await m.listPhotoIds('ev_mehta', { sort: 'capture' })
    const newest = await m.listPhotoIds('ev_mehta', { sort: 'newest' })
    expect(newest).toEqual([...oldest].reverse())
    const page = await m.listPhotos('ev_mehta', { sort: 'newest', limit: 3 })
    expect(page.items.map((x) => x.id)).toEqual(newest.slice(0, 3))

    const id = newest[0]
    expect((await m.getPhoto(id))).toMatchObject({ rotation: 0, quality: 'web', views: expect.any(Number) })
    expect(await m.rotatePhotos([id], 90)).toEqual({ updated: 1 })
    await m.rotatePhotos([id], -180)
    expect((await m.getPhoto(id)).rotation).toBe(270)
    await expect(m.rotatePhotos([id], 45)).rejects.toMatchObject({ status: 422 })

    const pending = (await m.listPhotos('ev_riya', { albumId: 'ev_riya_guest' })).items.filter((x) => x.reviewStatus === 'pending')
    const before = (await m.listNeedsYou()).find((x) => x.kind === 'guest-uploads' && x.eventId === 'ev_riya')!.count!
    await m.setPhotoReview([pending[0].id], 'rejected')
    expect((await m.getPhoto(pending[0].id)).reviewStatus).toBe('rejected')
    expect((await m.listNeedsYou()).find((x) => x.kind === 'guest-uploads' && x.eventId === 'ev_riya')!.count).toBe(before - 1)
    await m.verifyPin('6402F9F', '5211')
    const guestSeen = await m.listPublicPhotos('6402F9F', { albumId: 'ev_riya_guest' })
    expect(guestSeen.items.map((x) => x.id)).not.toContain(pending[0].id)
  })

  it('counts guest views', async () => {
    const m = api()
    const [ph] = (await m.listPhotos('ev_tessera', { limit: 1 })).items
    await m.recordPhotoViews([ph.id, ph.id], '3F9E21D')
    expect((await m.getPhoto(ph.id)).views).toBe(ph.views + 1)
  })
})

describe('mock v5: guests', () => {
  it('removes and restores a guest; a removed guest can’t sign in again', async () => {
    const m = api()
    await m.removeGuest('g2')
    expect((await m.listGuests('ev_riya')).map((g) => g.id)).not.toContain('g2')
    await m.verifyPin('6402F9F', '5211')
    await expect(m.registerGuest('6402F9F', { name: 'Neha', email: 'neha.k@gmail.com' })).rejects.toMatchObject({ status: 403, code: 'guest_removed' })
    expect((await m.restoreGuest('g2')).id).toBe('g2')
    expect((await m.listGuests('ev_riya')).map((g) => g.id)).toContain('g2')
  })

  it('reopens an approved request and removes the guest it added', async () => {
    const m = api()
    await m.resolveAccessRequest('ar1', true)
    expect((await m.listGuests('ev_riya')).some((g) => g.email === 'rohan.m@gmail.com')).toBe(true)
    await expect(m.resolveAccessRequest('ar1', true)).rejects.toMatchObject({ status: 409 })
    const r = await m.reopenAccessRequest('ar1')
    expect(r.id).toBe('ar1')
    expect((await m.listAccessRequests('ev_riya')).map((x) => x.id)).toContain('ar1')
    expect((await m.listGuests('ev_riya')).some((g) => g.email === 'rohan.m@gmail.com')).toBe(false)
    await expect(m.reopenAccessRequest('ar1')).rejects.toMatchObject({ status: 409, code: 'not_resolved' })
  })

  it('registers with a phone only, matches returning guests by phone, accepts host invites', async () => {
    const m = api()
    await m.verifyPin('6402F9F', '5211')
    const a = await m.registerGuest('6402F9F', { name: 'Phone Only', phone: '+91 90000 11111' })
    expect(a.guest).toMatchObject({ email: '', phone: '+91 90000 11111' })
    const b = await m.registerGuest('6402F9F', { name: 'Phone Only', phone: '9000011111' })
    expect(b.guest.id).toBe(a.guest.id)
    await expect(m.registerGuest('6402F9F', { name: 'Nobody' })).rejects.toMatchObject({ status: 422 })
    await m.registerGuest('6402F9F', { name: 'Aman', email: 'aman.rao@gmail.com' })
    expect((await m.getEvent('ev_riya')).hosts.find((h) => h.id === 'h2')).toMatchObject({ status: 'accepted', access: 'upload' })
  })

  it('gives new hosts defaults', async () => {
    const m = api()
    const e = await m.getEvent('ev_mehta')
    const next = await m.updateEvent(e.id, { hosts: [...e.hosts, { id: 'hx', name: 'Second', email: 's@example.com', role: 'host' }] })
    expect(next.hosts.find((h) => h.id === 'hx')).toMatchObject({ access: 'full', status: 'invited', invitedAt: expect.any(String) })
  })
})

describe('mock v5: stats', () => {
  it('event stats add up and face finding counts down after reindex', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const m = api()
    const st = await m.getEventStats('ev_riya')
    const ev = await m.getEvent('ev_riya')
    expect(st).toMatchObject({ eventId: 'ev_riya', visits: ev.visits.web + ev.visits.android + ev.visits.ios, faceSearches: ev.faceMatches, guests: 6 })
    expect(st.faces).toEqual({ ready: st.photos, total: st.photos, pending: 0 })
    expect(st.downloads).toBeGreaterThan(0)
    await m.reindexFaces('ev_riya')
    const during = await m.getEventStats('ev_riya')
    expect(during.faces.pending).toBeGreaterThan(0)
    expect(during.faces.ready + during.faces.pending).toBe(during.faces.total)
    vi.setSystemTime(Date.now() + 10_000)
    expect((await m.getEventStats('ev_riya')).faces.pending).toBe(0)
  })

  it('studio stats for a month', async () => {
    const m = api()
    const s = await m.getStudioStats({ month: '2026-09' })
    expect(s.month).toBe('2026-09')
    expect(s.thisMonth.visits).toBeGreaterThan(0)
    expect(s.thisMonth.sales).toBeGreaterThan(0)
    expect(s.lastMonth.visits).toBeGreaterThan(0) // the marathon (August)
    expect(s.allTime.visits).toBeGreaterThanOrEqual(s.thisMonth.visits + s.lastMonth.visits)
    expect((await m.getStudioStats()).month).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('mock v5: selling', () => {
  it('tracking numbers and resending download links', async () => {
    const m = api()
    expect((await m.updateOrder('o1041', { trackingNumber: ' DTDC Z1 ' })).trackingNumber).toBe('DTDC Z1')
    expect((await m.updateOrder('o1041', { trackingNumber: '' })).trackingNumber).toBeUndefined()
    await expect(m.resendDownloadLink('o1040')).rejects.toMatchObject({ status: 409, code: 'order_not_deliverable' })
    await expect(m.resendDownloadLink('o1043')).rejects.toMatchObject({ status: 422, code: 'no_buyer_email' })
    await m.verifyPin('7A1C0B2', '5211')
    const [ph] = (await m.listPublicPhotos('7A1C0B2', { limit: 1 })).items
    const o = await m.createOrder('7A1C0B2', { items: [{ priceId: 'single', photoIds: [ph.id] }], method: 'upi', buyer: { name: 'B', email: 'b@example.com' } })
    const r = await m.resendDownloadLink(o.id)
    expect(r).toMatchObject({ sentTo: 'b@example.com', order: { linkSentAt: expect.any(String) } })
  })

  it('applies per-event price overrides to guests', async () => {
    const m = api()
    await m.updateEventSettings('ev_mehta', { priceOverrides: { single: 99 }, forSaleWatermark: false })
    expect((await m.listPublicPrices('7A1C0B2')).find((p) => p.id === 'single')?.price).toBe(99)
    expect((await m.listPrices()).find((p) => p.id === 'single')?.price).toBe(149)
    await m.verifyPin('7A1C0B2', '5211')
    const [ph] = (await m.listPublicPhotos('7A1C0B2', { limit: 1 })).items
    const o = await m.createOrder('7A1C0B2', { items: [{ priceId: 'single', photoIds: [ph.id] }], method: 'upi', buyer: { name: 'B', email: 'b@example.com' } })
    expect(o.paid).toBe(99)
    expect((await m.getEvent('ev_mehta')).settings.forSaleWatermark).toBe(false)
    expect((await m.getPublicWatermark('7A1C0B2')).sale).toBeUndefined()
    await m.updateEventSettings('ev_mehta', { forSaleWatermark: true })
    expect((await m.getPublicWatermark('7A1C0B2')).sale?.template).toBe('forsale')
    expect((await m.getPublicWatermark('6402F9F')).sale).toBeUndefined()
  })

  it('checks the payout account (verified, name mismatch)', async () => {
    vi.useFakeTimers()
    const m = createMockApi(undefined, { latency: 0 })
    const p = m.verifyPayoutAccount()
    await vi.advanceTimersByTimeAsync(50)
    expect(await p).toMatchObject({ status: 'verified', nameAtBank: 'NORTHLIGHT STUDIO LLP', bankName: 'HDFC Bank' })
    const saving = m.updateStoreSettings({ payout: { holder: 'Rahul Patel', accountNumber: '123456789012' } })
    await vi.advanceTimersByTimeAsync(10)
    const saved = await saving
    expect(saved.payout.check?.status).toBe('checking')
    expect(saved.payout.verified).toBe(false)
    await vi.advanceTimersByTimeAsync(2000)
    const reading = m.getStoreSettings()
    await vi.advanceTimersByTimeAsync(10)
    const after = (await reading).payout
    expect(after.check).toMatchObject({ status: 'name_mismatch', nameAtBank: 'RAHUL PATEL' })
    expect(after.verified).toBe(false)
  })

  it('changes plan with GST, paying from the wallet in one call', async () => {
    const m = api()
    await expect(m.changePlan('agency', { billing: 'yearly', payWith: 'wallet' })).rejects.toMatchObject({ status: 402, code: 'insufficient_credits' })
    expect((await m.getUsage()).planId).toBe('starter')
    await m.addCredits(20_000)
    const w0 = await m.getWallet()
    const r = await m.changePlan('studio', { billing: 'quarterly', payWith: 'wallet' })
    expect(r.gst).toBeCloseTo(Math.round(r.charged * GST_RATE * 100) / 100, 2)
    expect(r.total).toBeCloseTo(r.charged + r.gst, 2)
    expect(r).toMatchObject({ payWith: 'wallet', usage: { planId: 'studio', period: 'quarterly' }, purchase: { method: 'credits', amount: r.total } })
    expect((await m.getWallet()).balance).toBeCloseTo(w0.balance - r.total, 2)
    const card = await m.changePlan('pro', { billing: 'yearly', payWith: 'upi' })
    expect(card.purchase?.method).toBe('upi')
    expect((await m.listPurchases()).every((p) => !/credits/i.test(p.description))).toBe(true)
  })
})

describe('mock v5: setup, guests waiting, faces', () => {
  it('checks gallery addresses', async () => {
    const m = api()
    expect(await m.checkHandle('northlight')).toEqual({ handle: 'northlight', available: true, reason: 'yours' })
    expect(await m.checkHandle('Admin')).toMatchObject({ available: false, reason: 'reserved' })
    expect(await m.checkHandle('a')).toMatchObject({ available: false, reason: 'invalid' })
    expect(await m.checkHandle('lumen')).toMatchObject({ available: false, reason: 'taken' })
    expect(await m.checkHandle('rao-photos')).toEqual({ handle: 'rao-photos', available: true })
    await expect(m.updateStudio({ handle: 'lumen' })).rejects.toMatchObject({ status: 409, code: 'handle_taken' })
  })

  it('notify me: waits for the first photos, then tells everyone', async () => {
    vi.useFakeTimers()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const m = createMockApi(undefined, { latency: 0 })
    const ask = m.requestNotify('5D22E80', '+91 98450 55012')
    await vi.advanceTimersByTimeAsync(10)
    expect(await ask).toMatchObject({ eventId: 'ev_anaya', phone: '+91 98450 55012' })
    const bad = m.requestNotify('5D22E80', '12').catch((e) => e)
    const live = m.requestNotify('6402F9F', '9845055012').catch((e) => e)
    await vi.advanceTimersByTimeAsync(10)
    expect(await bad).toMatchObject({ status: 422 })
    expect(await live).toMatchObject({ status: 409, code: 'already_live' })
    const albumP = m.createAlbum('ev_anaya', 'Party')
    await vi.advanceTimersByTimeAsync(10)
    const album = await albumP
    const up = m.uploadPhotos('ev_anaya', album.id, [{ filename: 'a.jpg', size: 10 }], { quality: 'web' })
    await vi.advanceTimersByTimeAsync(5000)
    await up
    expect(info.mock.calls.some((c) => String(c[0]).includes('+91 98450 55012'))).toBe(true)
    const activity = m.listActivity()
    await vi.advanceTimersByTimeAsync(10)
    expect((await activity)[0].title).toMatch(/Told 1 guest/)
    info.mockRestore()
  })

  it('cancels notify me', async () => {
    const m = api()
    await m.requestNotify('5D22E80', '9845055012')
    await m.cancelNotify('5D22E80', '+91 98450 55012')
    // Cancelled: a second request creates a fresh one.
    expect((await m.requestNotify('5D22E80', '9845055012')).phone).toBe('9845055012')
  })

  it('says when a selfie has no face', async () => {
    const m = api()
    expect(await m.searchFaces('6402F9F', { key: 'k', faces: 0 })).toEqual({ faceFound: false, reason: 'no_face', personId: null, photoIds: [] })
    expect(await m.matchFaceForLink('ev_riya', { key: 'k', image: { width: 40, height: 40 } })).toMatchObject({ faceFound: false })
    expect((await m.searchFaces('6402F9F', { key: 'ev_riya:selfie.jpg:12345' })).faceFound).toBe(true)
  })

  it('studio WhatsApp number on public data; camera last upload time', async () => {
    const m = api()
    expect((await m.getPublicEvent('6402F9F')).studio.whatsapp).toBe('+91 98200 41177')
    await m.updateStudio({ whatsapp: '' })
    expect((await m.getPublicEvent('6402F9F')).studio.whatsapp).toBe('+91 98200 41177')
    expect((await m.listCameras()).find((c) => c.id === 'c1')?.lastUploadAt).toBe('2026-09-26T16:40:00.000Z')
  })
})

describe('mock v5: old saved state', () => {
  it('fills contract v5 fields on data saved by an older version', async () => {
    const p = memory()
    const m = api(p)
    const [up] = await m.uploadPhotos('ev_portfolio', 'ev_portfolio_al0', [{ filename: 'x.jpg', size: 1 }], { quality: 'web' })
    const old = JSON.parse(p.data!)
    delete old.trashed
    delete old.extra.notify
    for (const ph of old.added) { delete ph.views; delete ph.quality; delete ph.rotation }
    for (const e of old.seed.events) { delete e.settings.priceOverrides; delete e.settings.forSaleWatermark; for (const h of e.hosts) { delete h.access; delete h.status } }
    const m2 = api({ load: () => JSON.stringify(old), save: () => undefined })
    expect(await m2.getPhoto(up.id)).toMatchObject({ views: 0, quality: 'web', rotation: 0 })
    const ev = await m2.getEvent('ev_riya')
    expect(ev.settings).toMatchObject({ priceOverrides: {}, forSaleWatermark: true })
    expect(ev.hosts[0]).toMatchObject({ access: 'full', status: 'invited' })
    expect(await m2.requestNotify('5D22E80', '9845055012')).toMatchObject({ eventId: 'ev_anaya' })
  })
})

describe('mock v5: tabs stay in sync', () => {
  it('a second instance picks up the first one’s writes (storage event and re-read before acting)', async () => {
    const store = sharedMemoryPersistence()
    const a = api(store())
    const b = api(store())
    const topics: string[] = []
    b.subscribe((t) => topics.push(t))
    const [ph] = (await a.listPhotos('ev_mehta', { limit: 1 })).items
    await a.deletePhotos([ph.id])
    expect(topics).toContain('photos')
    await expect(b.getPhoto(ph.id)).rejects.toMatchObject({ status: 404 })
    // b acts on the fresh copy, so a's delete survives b's write.
    await b.renameAlbum('ev_mehta_al0', 'Getting ready (edited)')
    const c = api(store())
    await expect(c.getPhoto(ph.id)).rejects.toMatchObject({ status: 404 })
    expect((await c.listAlbums('ev_mehta')).find((x) => x.id === 'ev_mehta_al0')?.name).toBe('Getting ready (edited)')
  })

  it('re-reads the stored copy even without storage events', async () => {
    const shared = memory()
    const a = api(shared)
    const b = api(shared)
    await a.deleteQR('q3')
    expect((await b.listQRs()).map((q) => q.id)).not.toContain('q3')
  })
})
