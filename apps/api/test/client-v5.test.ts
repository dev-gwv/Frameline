import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createHttpApi, memoryTokenStore } from '@frameline/shared'
import { BASE, freshIp, tokenFor } from './helpers'

/** Contract v5 through the shared HTTP client (the same calls the web apps and a native app make). */
async function client(who: 'owner' | 'editor' = 'owner') {
  const ip = freshIp()
  return createHttpApi({
    baseUrl: BASE,
    tokens: memoryTokenStore({ accessToken: await tokenFor(who), refreshToken: 'unused' }),
    fetch: (input, init) => {
      const req = new Request(input as RequestInfo, init)
      req.headers.set('cf-connecting-ip', ip)
      return SELF.fetch(req)
    },
  })
}

describe('createHttpApi: contract v5', () => {
  it('trash and restore: photos, albums, QR codes, broadcasts, events', async () => {
    const api = await client()
    const [ph] = (await api.listPhotos('ev_kapoor', { limit: 1 })).items
    await api.deletePhotos([ph.id])
    await expect(api.getPhoto(ph.id)).rejects.toMatchObject({ status: 404 })
    expect(await api.restorePhotos([ph.id])).toEqual({ restored: 1 })
    expect((await api.getPhoto(ph.id)).id).toBe(ph.id)

    const album = await api.createAlbum('ev_kapoor', 'Temp')
    await api.deleteAlbum(album.id)
    expect((await api.listAlbums('ev_kapoor')).map((a) => a.id)).not.toContain(album.id)
    expect((await api.restoreAlbum(album.id)).id).toBe(album.id)

    const qr = await api.createQR('Temp QR', 'ev_kapoor')
    await api.deleteQR(qr.id)
    expect((await api.listQRs()).map((q) => q.id)).not.toContain(qr.id)
    expect((await api.restoreQR(qr.id)).id).toBe(qr.id)

    const b = await api.sendBroadcast({ title: 'Hi', body: 'There', audience: 'all', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
    await api.deleteBroadcast(b.id)
    expect((await api.listBroadcasts()).map((x) => x.id)).not.toContain(b.id)
    expect((await api.restoreBroadcast(b.id)).id).toBe(b.id)

    const ev = await api.createEvent({ name: 'Forever', date: '2026-12-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 })
    await expect(api.deleteEvent(ev.id, { permanent: true })).rejects.toMatchObject({ status: 409, code: 'not_in_trash' })
    await api.deleteEvent(ev.id)
    await api.deleteEvent(ev.id, { permanent: true })
    expect((await api.listDeletedEvents()).map((e) => e.id)).not.toContain(ev.id)
  })

  it('photos: newest first, rotation, rejected review, stats', async () => {
    const api = await client()
    const oldest = await api.listPhotoIds('ev_mehta', { sort: 'capture' })
    const newest = await api.listPhotoIds('ev_mehta', { sort: 'newest' })
    expect(newest).toEqual([...oldest].reverse())
    expect((await api.listPhotos('ev_mehta', { sort: 'newest', limit: 5 })).items.map((p) => p.id)).toEqual(newest.slice(0, 5))
    expect(await api.rotatePhotos([newest[0]], 90)).toEqual({ updated: 1 })
    expect(await api.getPhoto(newest[0])).toMatchObject({ rotation: 90, quality: 'web', views: expect.any(Number) })

    const guest = await api.listPhotos('ev_riya', { albumId: 'ev_riya_guest' })
    const pending = guest.items.find((p) => p.reviewStatus === 'pending')!
    await api.setPhotoReview([pending.id], 'rejected')
    expect((await api.getPhoto(pending.id)).reviewStatus).toBe('rejected')

    const st = await api.getEventStats('ev_riya')
    expect(st).toMatchObject({ eventId: 'ev_riya', faces: { total: expect.any(Number) } })
    expect(st.faces.ready + st.faces.pending).toBe(st.faces.total)
    const studio = await api.getStudioStats({ month: '2026-09' })
    expect(studio.month).toBe('2026-09')
    expect(studio.thisMonth).toMatchObject({ visits: expect.any(Number), sales: expect.any(Number) })
  })

  it('guests: remove/restore, reopen a request', async () => {
    const api = await client()
    await api.removeGuest('g5')
    expect((await api.listGuests('ev_riya')).map((g) => g.id)).not.toContain('g5')
    expect((await api.restoreGuest('g5')).id).toBe('g5')
    await api.resolveAccessRequest('ar2', false)
    expect((await api.reopenAccessRequest('ar2')).id).toBe('ar2')
    expect((await api.listAccessRequests('ev_riya')).map((r) => r.id)).toContain('ar2')
  })

  it('selling and account: orders, payout check, plan change, handle check', async () => {
    const api = await client()
    expect((await api.updateOrder('o1041', { trackingNumber: 'DTDC Z1' })).trackingNumber).toBe('DTDC Z1')
    await expect(api.resendDownloadLink('o1040')).rejects.toMatchObject({ status: 409, code: 'order_not_deliverable' })
    const check = await api.verifyPayoutAccount()
    expect(['verified', 'name_mismatch', 'failed']).toContain(check.status)
    await api.addCredits(20_000)
    const change = await api.changePlan('studio', { billing: 'quarterly', payWith: 'wallet' })
    expect(change).toMatchObject({ payWith: 'wallet', usage: { planId: 'studio', period: 'quarterly' } })
    expect(change.total).toBeCloseTo(change.charged + change.gst, 2)
    expect(await api.checkHandle('northlight')).toMatchObject({ available: true, reason: 'yours' })
    expect(await api.checkHandle('admin')).toMatchObject({ available: false, reason: 'reserved' })
  })

  it('guest side: views, notify me, phone-only sign-up, no-face selfie', async () => {
    const api = await client()
    const guest = createHttpApi({ baseUrl: BASE, tokens: memoryTokenStore(), fetch: (i, init) => { const r = new Request(i as RequestInfo, init); r.headers.set('cf-connecting-ip', freshIp()); return SELF.fetch(r) } })
    const [ph] = (await guest.listPublicPhotos('3F9E21D', { limit: 1 })).items
    await guest.recordPhotoViews([ph.id], '3F9E21D')
    expect((await api.getPhoto(ph.id)).views).toBe(ph.views + 1)

    await expect(guest.requestNotify('3F9E21D', '9845055012')).rejects.toMatchObject({ status: 409, code: 'already_live' })
    expect(await guest.requestNotify('5D22E80', '+91 98450 55012')).toMatchObject({ eventId: 'ev_anaya' })
    await guest.cancelNotify('5D22E80', '+91 98450 55012')

    await guest.verifyPin('6402F9F', '5211')
    const reg = await guest.registerGuest('6402F9F', { name: 'Phone Only', phone: '+91 90000 22222' })
    expect(reg.guest.email).toBe('')
    expect(await guest.searchFaces('6402F9F', { key: 'k', faces: 0 })).toMatchObject({ faceFound: false, reason: 'no_face' })
    expect((await guest.getPublicEvent('6402F9F')).studio.whatsapp).toBeTruthy()
  })
})
