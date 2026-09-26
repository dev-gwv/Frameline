import { describe, expect, it } from 'vitest'
import { ApiError, createMockApi, decodeGuestLink, encodeGuestLink, type Persistence } from '@frameline/shared'

/** The in-memory mock must honour the same contract as the real API. */
const memory = (): Persistence & { data: string | null } => {
  const p = { data: null as string | null, load: () => p.data, save: (d: string) => { p.data = d } }
  return p
}
const api = (persist = memory()) => createMockApi(persist, { latency: 0 })

describe('mock API: contract v2', () => {
  it('locks the PIN after 5 wrong tries and registers guests visible to the studio', async () => {
    const m = api()
    for (let i = 4; i >= 1; i--) {
      const e = await m.verifyPin('6402F9F', '0000').catch((x) => x)
      expect(e).toBeInstanceOf(ApiError)
      expect(e).toMatchObject({ status: 401, code: 'invalid_pin', problem: { attemptsRemaining: i } })
    }
    await expect(m.verifyPin('6402f9f', '0000')).rejects.toMatchObject({ status: 429, code: 'pin_locked' })
    await expect(m.verifyPin('6402f9f', '5211')).rejects.toMatchObject({ code: 'pin_locked' })
    const other = api()
    expect((await other.verifyPin('6402F9F', '5211')).seeAll).toBe(true)
    const reg = await other.registerGuest('6402F9F', { name: 'Dadi ji', email: 'dadi@example.com' })
    expect((await other.listGuests('ev_riya')).some((g) => g.id === reg.guest.id)).toBe(true)
    expect((await other.listActivity())[0]).toMatchObject({ kind: 'registration' })
  })

  it('filters public photos and matches faces like the gallery', async () => {
    const m = api()
    const guest = await m.listPublicPhotos('6402F9F', { albumId: 'ev_riya_guest' })
    expect(guest.total).toBe(7)
    const r = await m.searchFaces('6402F9F', { key: 'ev_riya:selfie.jpg:12345' })
    expect(['p_g1', 'p_g2', 'p_g3']).toContain(r.personId)
    const mine = await m.listPublicPhotos('6402F9F', { personId: r.personId! })
    expect(mine.items.map((p) => p.id).sort()).toEqual([...r.photoIds].sort())
    const pub = await m.getPublicEvent('6402f9f')
    expect(pub.settings).not.toHaveProperty('pin')
    expect(pub.studio.followCode).toBe('FA-KCGWHY')
  })

  it('handles money: coupons once, credits, enhance, orders, plan changes', async () => {
    const m = api()
    const start = (await m.getUsage()).walletCredits
    expect(await m.redeemCoupon('welcome500')).toEqual({ credits: 500, walletCredits: start + 500 })
    await expect(m.redeemCoupon('WELCOME500')).rejects.toMatchObject({ status: 409, code: 'coupon_used' })
    const photo = (await m.listPhotos('ev_riya', { limit: 1 })).items[0]
    const enhanced = await m.enhancePhoto(photo.id, { preset: 'warm', saveAs: 'new' })
    expect(enhanced.enhancedFrom).toBe(photo.id)
    expect((await m.getUsage()).walletCredits).toBe(start + 500 - 8)
    expect((await m.listLedger())[0]).toMatchObject({ type: 'credits-used', amount: -8 })
    await expect(m.spendCredits(1e6, 'too much')).rejects.toMatchObject({ status: 402, code: 'insufficient_credits' })

    await m.verifyPin('7A1C0B2', '5211')
    const ps = (await m.listPublicPhotos('7A1C0B2', { limit: 2 })).items
    const order = await m.createOrder('7A1C0B2', { items: [{ priceId: 'single', photoIds: ps.map((p) => p.id) }], method: 'upi', buyer: { name: 'P', email: 'p@example.com' } })
    expect(order).toMatchObject({ paid: 298, share: 268.2, status: 'paid' })
    expect((await m.listLedger())[0]).toMatchObject({ type: 'sale', amount: 268.2 })

    const change = await m.changePlan('pro', 'yearly')
    expect(change.usage).toMatchObject({ planId: 'pro', photosLimit: 250000 })
    expect(change.charged).toBe(38490 - change.credit)
  })

  it('copies, reviews and covers photos; ids match the list', async () => {
    const m = api()
    const src = (await m.listPhotos('ev_kapoor', { albumId: 'ev_kapoor_al0', limit: 2 })).items
    const copies = await m.copyPhotosToAlbum(src.map((p) => p.id), 'ev_kapoor_al1')
    expect(copies.map((p) => p.albumId)).toEqual(['ev_kapoor_al1', 'ev_kapoor_al1'])
    expect((await m.listAlbums('ev_kapoor')).find((a) => a.id === 'ev_kapoor_al1')?.photoCount).toBe(302)
    const ids = await m.listPhotoIds('ev_mehta', { sort: 'name' })
    expect(ids).toEqual((await m.listPhotos('ev_mehta', { sort: 'name' })).items.map((p) => p.id))
    await m.setCover('ev_riya', src[0].id, 'event')
    expect((await m.getEvent('ev_riya')).coverPhotoId).toBe(src[0].id)
    const pending = (await m.listPhotos('ev_riya', { albumId: 'ev_riya_guest' })).items.filter((p) => p.reviewStatus === 'pending')
    await m.setPhotoReview([pending[0].id], 'approved')
    expect((await m.getPhoto(pending[0].id)).reviewStatus).toBe('approved')
  })

  it('never persists blob: URLs and upgrades old saved state', async () => {
    const p = memory()
    const m = api(p)
    const [created] = await m.uploadPhotos('ev_portfolio', 'ev_portfolio_al0', [{ filename: 'a.jpg', size: 10, url: 'blob:http://localhost/abc' }], { quality: 'web' })
    expect((await m.getPhoto(created.id)).url).toBe('blob:http://localhost/abc')
    expect(p.data).not.toContain('blob:')
    // A browser that saved state before contract v2 (no services, no store settings, no edgeOffset) still loads.
    const old = JSON.parse(p.data!)
    delete old.seed.studio.services
    delete old.seed.storeSettings
    delete old.seed.watermark.edgeOffset
    delete old.extra
    old.seed.enquiries.forEach((e: { status?: string }) => { delete e.status })
    const upgraded = createMockApi({ load: () => JSON.stringify(old), save: () => undefined }, { latency: 0 })
    expect((await upgraded.getStudio()).services.length).toBeGreaterThan(0)
    expect((await upgraded.getWatermark()).edgeOffset).toBe(3)
    expect((await upgraded.getStoreSettings()).payout.accountLast4).toBe('4471')
    expect((await upgraded.listEnquiries())[0].status).toBe('new')
  })

  it('creates personal links in the gallery format', async () => {
    const m = api()
    const link = await m.createGuestLink('ev_riya', { n: 'Dadi ji', me: true })
    expect(link.path).toBe(encodeGuestLink({ e: '6402F9F', n: 'Dadi ji', me: true }))
    expect(decodeGuestLink(link.code)).toMatchObject({ e: '6402F9F', n: 'Dadi ji', me: true })
    const vip = await m.createGuestLink('ev_riya', { vip: { pin: true } })
    expect(vip.kind).toBe('v')
    const resolved = await m.resolveGuestLink(vip.code)
    expect(resolved.session?.shortId).toBe('6402F9F')
  })
})
