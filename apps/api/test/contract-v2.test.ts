import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import type { PhotoJob } from '../src/env'
import { call, expectProblem, freshIp, tokenFor, uniqueEmail } from './helpers'

/** A brand-new studio (fresh wallet and plan) owned by a new user. */
async function newStudio() {
  const email = uniqueEmail('owner')
  const ip = freshIp()
  const code = (await call('/v1/auth/otp/request', { body: { email }, ip })).json.devCode
  const s = await call('/v1/auth/otp/verify', { body: { email, code, studioName: 'Test Studio' }, ip })
  return s.json.accessToken as string
}

async function drain(messages: PhotoJob[]) {
  const batch = createMessageBatch<PhotoJob>('frameline-photos', messages.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })))
  const ctx = createExecutionContext()
  await worker.queue(batch, env as never)
  return getQueueResult(batch, ctx)
}

describe('studio profile and settings', () => {
  it('stores website content, app config and onboarding fields on the studio', async () => {
    const token = await newStudio()
    const st = (await call('/v1/studio', { token })).json
    expect(st).toMatchObject({ services: [], faq: [], followers: 0, app: { showServices: true, showFaq: true, showPrivate: false } })
    const patched = await call('/v1/studio', {
      token, method: 'PATCH',
      body: {
        studioType: 'wedding', referralSource: 'Friend', coverUrl: 'https://example.com/c.jpg',
        services: [{ id: 's1', name: 'Weddings', price: 'From ₹1,00,000', description: 'Two shooters' }],
        faq: [{ id: 'f1', q: 'Travel?', a: 'Yes' }], app: { showFaq: false },
      },
    })
    expect(patched.status).toBe(200)
    expect(patched.json).toMatchObject({ studioType: 'wedding', services: [{ name: 'Weddings' }], faq: [{ q: 'Travel?' }], app: { showFaq: false, showServices: true } })
    // Partial profile updates keep the other lists.
    expect((await call('/v1/studio', { token, method: 'PATCH', body: { testimonials: [{ id: 't1', quote: 'Great', name: 'A' }] } })).json.services).toHaveLength(1)
  })

  it('merges store settings, keeps only the last 4 account digits, and gates payouts', async () => {
    const token = await newStudio()
    const blank = (await call('/v1/store/settings', { token })).json
    expect(blank.payout.verified).toBe(false)
    expectProblem(await call('/v1/payouts', { token, body: { amount: 10 } }), 409, 'payout_account_unverified')
    const bad = await call('/v1/store/settings', { token, method: 'PATCH', body: { payout: { ifsc: 'bad' } } })
    expectProblem(bad, 422, 'validation_failed')
    expect(bad.json.errors[0].field).toBe('payout.ifsc')
    const s = await call('/v1/store/settings', {
      token, method: 'PATCH',
      body: { payout: { holder: 'Test Studio', accountNumber: '50100234474471', ifsc: 'HDFC0001234', bank: 'HDFC Bank' }, kyc: { documents: [{ kind: 'pan', status: 'needed', fileName: 'pan.pdf' }] }, terms: 'Be nice.' },
    })
    expect(s.json.payout).toMatchObject({ accountLast4: '4471', verified: true, bank: 'HDFC Bank' })
    expect(JSON.stringify(s.json)).not.toContain('50100234474471')
    expect(s.json.kyc.documents[0]).toMatchObject({ kind: 'pan', status: 'review' })
    expect(s.json.terms).toBe('Be nice.')
    // No earnings yet → can't withdraw.
    expectProblem(await call('/v1/payouts', { token, body: { amount: 10 } }), 422, 'validation_failed')
  })

  it('pays out seeded earnings as a ledger line', async () => {
    const owner = await tokenFor('owner')
    const before = (await call('/v1/ledger?limit=1', { token: owner })).json.items[0].balance
    const r = await call('/v1/payouts', { token: owner, body: { amount: 1000 }, headers: { 'idempotency-key': `po-${crypto.randomUUID()}` } })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ type: 'payout', amount: -1000, balance: Math.round((before - 1000) * 100) / 100, description: 'Payout to HDFC Bank ••4471' })
  })

  it('manages notification prefs per member', async () => {
    const token = await newStudio()
    const d = (await call('/v1/me/notifications', { token })).json
    expect(d).toMatchObject({ eventExpiry: true, weeklySummary: false })
    const u = await call('/v1/me/notifications', { token, method: 'PUT', body: { weeklySummary: true, enquiryEmails: ['a@example.com', 'b@example.com'] } })
    expect(u.json).toMatchObject({ weeklySummary: true, eventExpiry: true, enquiryEmails: ['a@example.com', 'b@example.com'] })
  })
})

describe('billing', () => {
  it('redeems WELCOME500 once, spends credits with ledger lines, and refuses when short', async () => {
    const token = await newStudio()
    const r = await call('/v1/studio/coupons', { token, body: { code: 'welcome500' } })
    expect(r.json).toEqual({ credits: 500, walletCredits: 500 })
    expectProblem(await call('/v1/studio/coupons', { token, body: { code: 'WELCOME500' } }), 409, 'coupon_used')
    expectProblem(await call('/v1/studio/coupons', { token, body: { code: 'NOPE123' } }), 404, 'invalid_coupon')
    const spent = await call('/v1/studio/credits/spend', { token, body: { amount: 120, description: '3,000-photo pack' } })
    expect(spent.json).toMatchObject({ walletCredits: 380, entry: { type: 'credits-used', amount: -120, description: '3,000-photo pack' } })
    const short = await call('/v1/studio/credits/spend', { token, body: { amount: 1000, description: 'Too much' } })
    expectProblem(short, 402, 'insufficient_credits')
    expect(short.json).toMatchObject({ required: 1000, available: 380 })
    const purchases = (await call('/v1/purchases', { token })).json.items
    expect(purchases[0]).toMatchObject({ kind: 'coupon', amount: 0, method: 'coupon' })
  })

  it('changes plan with proration and updates usage', async () => {
    const token = await newStudio() // starter · yearly, valid for 14 days
    const r = await call('/v1/studio/plan', { token, body: { planId: 'pro', period: 'yearly' } })
    expect(r.status).toBe(200)
    // 14 of 365 days of Starter (₹8,490) ≈ ₹326 credit against Pro (₹38,490).
    expect(r.json.credit).toBeGreaterThan(300)
    expect(r.json.credit).toBeLessThan(340)
    expect(r.json.charged).toBe(38490 - r.json.credit)
    expect(r.json.usage).toMatchObject({ planId: 'pro', period: 'yearly', photosLimit: 250000 })
    expect(r.json.purchase).toMatchObject({ kind: 'plan', amount: r.json.charged })
    expectProblem(await call('/v1/studio/plan', { token, body: { planId: 'pro', period: 'yearly' } }), 409, 'same_plan')
    expect((await call('/v1/studio/renewal-multiplier', { token, method: 'PUT', body: { multiplier: 3 } })).json.renewalMultiplier).toBe(3)
  })

  it('renews an event with credits at half price and extends it a year', async () => {
    const token = await newStudio()
    await call('/v1/studio/coupons', { token, body: { code: 'WELCOME500' } })
    const ev = (await call('/v1/events', { token, body: { name: 'Renew me', date: '2026-01-10', city: 'Pune', type: 'wedding', preset: 'private-family', guestUploadLimit: 10 } })).json
    const r = await call(`/v1/events/${ev.id}/renew`, { token, body: { payWith: 'credits' } })
    expect(r.json.charged).toBe(500)
    expect(Date.parse(r.json.event.expiresAt)).toBeGreaterThan(Date.parse(ev.expiresAt))
    expect((await call('/v1/studio/usage', { token })).json.walletCredits).toBe(0)
    expectProblem(await call(`/v1/events/${ev.id}/renew`, { token, body: { payWith: 'credits' } }), 402, 'insufficient_credits')
    const link = await call(`/v1/events/${ev.id}/renewal-link`, { token, method: 'POST' })
    expect(link.json).toMatchObject({ price: 2000, url: expect.stringContaining('/renew/') })
  })
})

describe('photos: ids, copy, enhance, zip, reindex', () => {
  it('lists ids with the same filters as the photo list', async () => {
    const token = await tokenFor('editor')
    const list = (await call('/v1/events/ev_mehta/photos?sort=name&limit=200', { token })).json
    const ids = (await call('/v1/events/ev_mehta/photo-ids?sort=name', { token })).json
    expect(ids.ids).toEqual(list.items.map((p: { id: string }) => p.id))
    expect(ids.truncated).toBe(false)
  })

  it('copies photos into another album without charging capacity', async () => {
    const token = await tokenFor('editor')
    const usage = (await call('/v1/studio/usage', { token })).json.photosUsed
    const src = (await call('/v1/events/ev_kapoor/photos?albumId=ev_kapoor_al0&limit=3', { token })).json.items
    const r = await call('/v1/photos/copy', { token, body: { ids: src.map((p: { id: string }) => p.id), albumId: 'ev_kapoor_al1' } })
    expect(r.status).toBe(201)
    expect(r.json.items.map((p: { filename: string; albumId: string }) => [p.filename, p.albumId])).toEqual(src.map((p: { filename: string }) => [p.filename, 'ev_kapoor_al1']))
    expect((await call('/v1/studio/usage', { token })).json.photosUsed).toBe(usage)
    const albums = (await call('/v1/events/ev_kapoor/albums', { token })).json.items
    expect(albums.find((a: { id: string }) => a.id === 'ev_kapoor_al1').photoCount).toBe(43)
    expectProblem(await call('/v1/photos/copy', { token, body: { ids: [src[0].id], albumId: 'ev_riya_al0' } }), 422, 'validation_failed')
  })

  it('enhances a photo for 8 credits and the queue marks it ready', async () => {
    const token = await newStudio()
    await call('/v1/studio/coupons', { token, body: { code: 'WELCOME500' } })
    const ev = (await call('/v1/events', { token, body: { name: 'Enhance', date: '2026-11-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 } })).json
    const album = (await call(`/v1/events/${ev.id}/albums`, { token, body: { name: 'A' } })).json
    const up = (await call(`/v1/events/${ev.id}/uploads`, { token, body: { albumId: album.id, files: [{ filename: 'x.jpg', size: 10, external: true }] } })).json
    const done = (await call(`/v1/events/${ev.id}/uploads/${up.uploadId}/complete`, { token, body: { files: [{ photoId: up.files[0].photoId }] } })).json.items[0]
    const r = await call(`/v1/photos/${done.id}/enhance`, { token, body: { preset: 'warm', saveAs: 'new' } })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ filename: 'x-enhanced.jpg', enhancedFrom: done.id, status: 'processing', albumId: album.id })
    expect((await call('/v1/studio/usage', { token })).json.walletCredits).toBe(492)
    expect((await call('/v1/ledger?limit=1', { token })).json.items[0]).toMatchObject({ type: 'credits-used', amount: -8 })
    const studioId = (await call('/v1/me', { token })).json.memberships[0].studioId
    await drain([{ kind: 'process-photo', photoId: r.json.id, eventId: ev.id, studioId, key: null, quality: 'web' }])
    expect((await call(`/v1/photos/${r.json.id}`, { token })).json.status).toBe('ready')
    expectProblem(await call(`/v1/photos/${done.id}/enhance`, { token, body: { saveAs: 'new' } }), 422, 'validation_failed')
  })

  it('queues a ZIP that the consumer makes downloadable', async () => {
    const token = await tokenFor('editor')
    const z = await call('/v1/events/ev_portfolio/zips', { token, body: { email: 'client@example.com', albumId: 'ev_portfolio_al0' } })
    expect(z.status).toBe(202)
    expect(z.json).toMatchObject({ status: 'queued', photoCount: 40, email: 'client@example.com' })
    await drain([{ kind: 'build-zip', zipId: z.json.id, studioId: 'st_northlight' }])
    const list = (await call('/v1/events/ev_portfolio/zips', { token })).json.items
    expect(list[0]).toMatchObject({ id: z.json.id, status: 'ready', url: expect.stringContaining(`/v1/public/zips/${z.json.id}`) })
    const manifest = await call(`/v1/public/zips/${z.json.id}`)
    expect(manifest.json.photos).toHaveLength(40)
    expect((await call('/v1/events/ev_portfolio/faces/reindex', { token, method: 'POST' })).json).toEqual({ queued: 0 })
  })
})

describe('team, cameras, QR, broadcasts, films, prices', () => {
  it('updates and removes members but never the last owner', async () => {
    const token = await newStudio()
    const me = (await call('/v1/me', { token })).json
    expectProblem(await call(`/v1/team/${me.user.id}`, { token, method: 'PATCH', body: { role: 'editor' } }), 409, 'last_owner')
    expectProblem(await call(`/v1/team/${me.user.id}`, { token, method: 'DELETE' }), 409, 'last_owner')
    const ev = (await call('/v1/events', { token, body: { name: 'Team ev', date: '2026-11-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 } })).json
    const inv = await call('/v1/team/invites', { token, body: { email: uniqueEmail('inv'), role: 'editor' } })
    expect(inv.json.pending).toBe(true)
    const up = await call(`/v1/team/${inv.json.id}`, { token, method: 'PATCH', body: { role: 'uploader', eventIds: [ev.id] } })
    expect(up.json).toMatchObject({ role: 'uploader', eventIds: [ev.id], access: 'Team ev only · invite pending' })
    expect((await call(`/v1/team/${inv.json.id}`, { token, method: 'DELETE' })).status).toBe(204)
    expect((await call('/v1/team', { token })).json.items).toHaveLength(1)
  })

  it('returns camera passwords once, edits cameras and their upload log', async () => {
    const token = await tokenFor('editor')
    const cam = await call('/v1/cameras', { token, body: { label: 'Z9 test', eventId: 'ev_riya', albumId: 'ev_riya_al0', mode: 'live-2k' } })
    expect(cam.json.password).toMatch(/^[A-Za-z0-9]{12}$/)
    expect((await call('/v1/cameras?limit=200', { token })).json.items.find((c: { id: string }) => c.id === cam.json.id).password).toBeUndefined()
    const reset = await call(`/v1/cameras/${cam.json.id}/password`, { token, method: 'POST' })
    expect(reset.json.password).not.toBe(cam.json.password)
    expect((await call(`/v1/cameras/${cam.json.id}`, { token, method: 'PATCH', body: { mode: 'review-first', eventId: 'ev_mehta', albumId: 'ev_mehta_al0' } })).json).toMatchObject({ mode: 'review-first', eventId: 'ev_mehta' })
    const log = (await call('/v1/cameras/c1/uploads', { token })).json.items
    expect(log).toHaveLength(12)
    expect(log[4]).toMatchObject({ status: 'failed' })
    expect((await call('/v1/cameras/c1/uploads', { token, method: 'DELETE' })).status).toBe(204)
    expect((await call('/v1/cameras/c1/uploads', { token })).json.items).toHaveLength(0)
    expect((await call(`/v1/cameras/${cam.json.id}`, { token, method: 'DELETE' })).status).toBe(204)
  })

  it('schedules QR switches, cancels scheduled broadcasts, deletes both', async () => {
    const token = await tokenFor('editor')
    const qr = (await call('/v1/qrs', { token, body: { name: 'Door', eventId: 'ev_riya' } })).json
    const at = new Date(Date.now() + 86_400_000).toISOString()
    const q2 = await call(`/v1/qrs/${qr.id}`, { token, method: 'PATCH', body: { scheduledEventId: 'ev_mehta', scheduledAt: at, dotStyle: 'dots' } })
    expect(q2.json).toMatchObject({ scheduledEventId: 'ev_mehta', scheduledAt: at, dotStyle: 'dots' })
    expect((await call(`/v1/qrs/${qr.id}`, { token, method: 'PATCH', body: { scheduledEventId: '' } })).json.scheduledEventId).toBeUndefined()
    expect((await call(`/v1/qrs/${qr.id}`, { token, method: 'DELETE' })).status).toBe(204)

    const b = (await call('/v1/broadcasts', { token, body: { title: 'Soon', body: 'x', audience: 'all', scheduledAt: at, imageUrl: 'https://example.com/i.jpg' } })).json
    expect(b.imageUrl).toBe('https://example.com/i.jpg')
    expect((await call(`/v1/broadcasts/${b.id}/cancel`, { token, method: 'POST' })).json.cancelledAt).toEqual(expect.any(String))
    expectProblem(await call(`/v1/broadcasts/${b.id}/cancel`, { token, method: 'POST' }), 409, 'already_cancelled')
    expectProblem(await call('/v1/broadcasts/b1/cancel', { token, method: 'POST' }), 409, 'already_sent')
    expect((await call(`/v1/broadcasts/${b.id}`, { token, method: 'DELETE' })).status).toBe(204)
  })

  it('edits films, replaces prices (owner), and reports usage', async () => {
    const editor = await tokenFor('editor')
    expect((await call('/v1/films/f1', { token: editor, method: 'PATCH', body: { name: 'Wedding film (5 min)' } })).json.name).toBe('Wedding film (5 min)')
    expectProblem(await call('/v1/prices', { token: editor, method: 'PUT', body: { items: [] } }), 403, 'insufficient_role')
    const owner = await tokenFor('owner')
    const prices = (await call('/v1/prices', { token: owner })).json.items
    const next = prices.map((p: { id: string; price: number }) => (p.id === 'single' ? { ...p, price: 199 } : p))
    expect((await call('/v1/prices', { token: owner, method: 'PUT', body: { items: next } })).json.items.find((p: { id: string }) => p.id === 'single').price).toBe(199)
    expect((await call('/v1/prices', { token: owner })).json.items.find((p: { id: string }) => p.id === 'single').price).toBe(199)
    await call('/v1/prices', { token: owner, method: 'PUT', body: { items: prices } })

    const breakdown = (await call('/v1/studio/usage/breakdown', { token: editor })).json
    expect(breakdown.rules.length).toBeGreaterThan(2)
    expect(breakdown.events.find((e: { eventId: string }) => e.eventId === 'ev_riya')).toMatchObject({ guestUploads: 12 })
    const report = await call('/v1/studio/usage/report', { token: editor, method: 'POST' })
    expect(report.json.status).toBe('ready')
    expect(report.json.csv.split('\n')[0]).toContain('Event,Short code')
    expect((await call('/v1/studio/usage/report', { token: editor })).json.report.id).toBe(report.json.id)
  })
})
