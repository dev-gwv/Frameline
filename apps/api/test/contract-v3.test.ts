import { SELF, createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import { BASE, call, expectProblem, freshIp, tokenFor, uniqueEmail } from './helpers'

const RIYA = '6402F9F' // link-pin, face privacy on, downloads own, guest uploads on (limit 300), review on
const TESSERA = '3F9E21D' // open link, downloads all
const MEHTA = '7A1C0B2' // link-pin, store on

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}
const pin = async (shortId: string) => (await call(`/v1/public/events/${shortId}/pin`, { body: { pin: '5211' } })).json.token as string

async function newStudio() {
  const email = uniqueEmail('v3')
  const ip = freshIp()
  const code = (await call('/v1/auth/otp/request', { body: { email }, ip })).json.devCode
  return (await call('/v1/auth/otp/verify', { body: { email, code }, ip })).json.accessToken as string
}

describe('guest reads: prices, watermark, favourites, orders', () => {
  it('serves prices and the download watermark to guests', async () => {
    const t = await pin(MEHTA)
    expectProblem(await call(`/v1/public/events/${MEHTA}/prices`), 401, 'pin_required')
    const prices = await call(`/v1/public/events/${MEHTA}/prices`, { token: t })
    expect(prices.json.items.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['single', 'all', 'print812']))
    const wm = await call(`/v1/public/events/${TESSERA}/watermark`)
    expect(wm.json).toMatchObject({ enabled: true, settings: { mode: 'text', edgeOffset: 3 } })
  })

  it('lists my favourites and my orders', async () => {
    const reg = await call(`/v1/public/events/${MEHTA}/register`, { token: await pin(MEHTA), body: { name: 'Mine', email: uniqueEmail('mine') } })
    const token = reg.json.token
    const [ph] = (await call(`/v1/public/events/${MEHTA}/photos?limit=1`, { token })).json.items
    await call(`/v1/public/photos/${ph.id}/favourite`, { token, body: { on: true } })
    expect((await call(`/v1/public/events/${MEHTA}/me/favourites`, { token })).json.items.map((p: { id: string }) => p.id)).toEqual([ph.id])
    const order = await call(`/v1/public/events/${MEHTA}/orders`, { token, body: { items: [{ priceId: 'single', photoIds: [ph.id] }], method: 'upi', buyer: { name: 'Mine', email: 'other@example.com' } } })
    expect(order.status).toBe(201)
    expect((await call(`/v1/public/events/${MEHTA}/me/orders`, { token })).json.items.map((o: { id: string }) => o.id)).toEqual([order.json.id])
    expectProblem(await call(`/v1/public/events/${MEHTA}/me/favourites`, { token: await pin(MEHTA) }), 401, 'registration_required')
  })

  it('requires a shipping address for prints', async () => {
    const token = await pin(MEHTA)
    const [ph] = (await call(`/v1/public/events/${MEHTA}/photos?limit=1`, { token })).json.items
    const base = { items: [{ priceId: 'print812', photoIds: [ph.id], quantity: 2 }], method: 'card', buyer: { name: 'P', email: 'p@example.com' } }
    const missing = await call(`/v1/public/events/${MEHTA}/orders`, { token, body: base })
    expectProblem(missing, 422, 'validation_failed')
    expect(missing.json.errors[0].field).toBe('shipping')
    const shipping = { name: 'P Rao', phone: '+91 90000 00000', line1: '14 Hill Road', city: 'Mumbai', state: 'Maharashtra', postal: '400050' }
    const ok = await call(`/v1/public/events/${MEHTA}/orders`, { token, body: { ...base, shipping } })
    expect(ok.json).toMatchObject({ paid: 798, shipping })
  })
})

describe('guest uploads', () => {
  it('uploads into the guest album, pending review, counted against the limit', async () => {
    const token = await pin(RIYA)
    const bytes = new Uint8Array(512).fill(9)
    const start = await call(`/v1/public/events/${RIYA}/uploads`, { token, body: { files: [{ filename: 'me.jpg', size: bytes.length, contentType: 'image/jpeg' }], uploadedBy: 'Aunty' } })
    expect(start.status).toBe(201)
    const part = new URL(start.json.files[0].parts[0].url)
    const put = await SELF.fetch(`${BASE}${part.pathname}${part.search}`, { method: 'PUT', body: bytes })
    const etag = put.headers.get('etag')!
    const done = await call(`/v1/public/events/${RIYA}/uploads/${start.json.uploadId}/complete`, { token, body: { files: [{ photoId: start.json.files[0].photoId, parts: [{ partNumber: 1, etag }] }] } })
    expect(done.status).toBe(201)
    expect(done.json.items[0]).toMatchObject({ albumId: 'ev_riya_guest', source: 'guest', reviewStatus: 'pending', uploadedBy: 'Aunty', status: 'processing' })
    // Another guest can't complete someone else's upload session.
    const other = await call(`/v1/public/events/${RIYA}/register`, { token, body: { name: 'X', email: uniqueEmail('x') } })
    expectProblem(await call(`/v1/public/events/${RIYA}/uploads/${start.json.uploadId}/complete`, { token: other.json.token, body: { files: [{ photoId: start.json.files[0].photoId }] } }), 404)
    // The studio sees it in the review queue.
    const queue = (await call('/v1/events/ev_riya/photos?albumId=ev_riya_guest&limit=200', { token: await tokenFor('editor') })).json.items
    expect(queue.some((p: { id: string; reviewStatus: string }) => p.id === done.json.items[0].id && p.reviewStatus === 'pending')).toBe(true)
  })

  it('enforces guestUploads and guestUploadLimit', async () => {
    const editor = await tokenFor('editor')
    await call('/v1/events/ev_tessera/settings', { token: editor, method: 'PATCH', body: { guestUploads: false } })
    expectProblem(await call(`/v1/public/events/${TESSERA}/uploads`, { body: { files: [{ filename: 'a.jpg', size: 1 }] } }), 403, 'guest_uploads_disabled')
    await call('/v1/events/ev_tessera/settings', { token: editor, method: 'PATCH', body: { guestUploads: true, guestUploadLimit: 1 } })
    const r = await call(`/v1/public/events/${TESSERA}/uploads`, { body: { files: [{ filename: 'a.jpg', size: 1 }, { filename: 'b.jpg', size: 1 }] } })
    expectProblem(r, 409, 'guest_upload_limit')
    expect(r.json.remaining).toBe(1)
    await call('/v1/events/ev_tessera/settings', { token: editor, method: 'PATCH', body: { guestUploads: true, guestUploadLimit: 300 } })
  })
})

describe('download policy', () => {
  it('counts "Download all" uses per guest device (5) and checks the PIN on open galleries', async () => {
    const device = `dev-${crypto.randomUUID()}`
    const h = { 'x-guest-device': device }
    expectProblem(await call(`/v1/public/events/${TESSERA}/download-pin`, { headers: h, body: {} }), 401, 'pin_required')
    expectProblem(await call(`/v1/public/events/${TESSERA}/download-pin`, { headers: h, body: { pin: '0000' } }), 401, 'invalid_pin')
    for (let left = 4; left >= 0; left--) {
      const r = await call(`/v1/public/events/${TESSERA}/download-pin`, { headers: h, body: { pin: '5211' } })
      expect(r.json).toEqual({ remaining: left, limit: 5 })
    }
    expectProblem(await call(`/v1/public/events/${TESSERA}/download-pin`, { headers: h, body: { pin: '5211' } }), 429, 'download_limit')
    // Another device starts fresh.
    expect((await call(`/v1/public/events/${TESSERA}/download-pin`, { headers: { 'x-guest-device': `dev-${crypto.randomUUID()}` }, body: { pin: '5211' } })).json.remaining).toBe(4)
  })

  it('queues guest ZIPs only within the download policy', async () => {
    const all = await call(`/v1/public/events/${TESSERA}/zips`, { body: { email: 'g@example.com', albumId: 'ev_tessera_al0' } })
    expect(all.status).toBe(202)
    expect(all.json.photoCount).toBeGreaterThan(0)
    const token = await pin(RIYA)
    const reg = (await call(`/v1/public/events/${RIYA}/register`, { token, body: { name: 'Z', email: uniqueEmail('z') } })).json.token
    expectProblem(await call(`/v1/public/events/${RIYA}/zips`, { token: reg, body: { email: 'g@example.com' } }), 403, 'downloads_own_only')
    const found = (await call(`/v1/public/events/${RIYA}/faces/search`, { token: reg, body: { key: 'zip-key' } })).json
    const ok = await call(`/v1/public/events/${RIYA}/zips`, { token: reg, body: { email: 'g@example.com', personId: found.personId, photoIds: found.photoIds.slice(0, 3) } })
    expect(ok.json).toMatchObject({ status: 'queued', photoCount: Math.min(3, found.photoIds.length) })
    const notMine = (await call(`/v1/events/ev_riya/photos?limit=200`, { token: await tokenFor('editor') })).json.items.find((p: { faces: { personId: string }[] }) => !p.faces.some((f) => f.personId === found.personId))
    expectProblem(await call(`/v1/public/events/${RIYA}/zips`, { token: reg, body: { email: 'g@example.com', personId: found.personId, photoIds: [notMine.id] } }), 403, 'downloads_own_only')
  })

  it('has no download rendition without the processor', async () => {
    const [ph] = (await call(`/v1/public/events/${TESSERA}/photos?limit=1`)).json.items
    expectProblem(await call(`/v1/public/photos/${ph.id}/download?size=2048`), 404, 'rendition_unavailable')
  })
})

describe('payments: confirm + webhook', () => {
  it('confirms a pending order with a valid Razorpay signature, once', async () => {
    const owner = await tokenFor('owner')
    await env.DB.prepare("UPDATE orders SET provider_ref = 'order_rzTEST1' WHERE id = 'o1037'").run()
    const bad = await call('/v1/public/orders/o1037/confirm', { body: { providerOrderId: 'order_rzTEST1', paymentId: 'pay_1', signature: 'deadbeef' } })
    expectProblem(bad, 401, 'invalid_signature')
    const signature = await hmacHex('test-razorpay-key-secret', 'order_rzTEST1|pay_1')
    const ok = await call('/v1/public/orders/o1037/confirm', { body: { providerOrderId: 'order_rzTEST1', paymentId: 'pay_1', signature } })
    expect(ok.json.status).toBe('paid')
    const ledger = (await call('/v1/ledger?limit=200', { token: owner })).json.items
    expect(ledger.filter((l: { description: string }) => l.description === 'Order #1037 · Riya & Kabir Wedding')).toHaveLength(1)
    const again = await call('/v1/public/orders/o1037/confirm', { body: { providerOrderId: 'order_rzTEST1', paymentId: 'pay_1', signature } })
    expect(again.json.status).toBe('paid')
    expect((await call('/v1/ledger?limit=200', { token: owner })).json.items.filter((l: { description: string }) => l.description === 'Order #1037 · Riya & Kabir Wedding')).toHaveLength(1)
  })

  it('verifies webhook signatures and marks orders paid', async () => {
    await env.DB.prepare(`INSERT INTO orders (id, studio_id, number, buyer, event_id, event_name, items, paid_paise, currency, share_paise, status, provider_ref, at, reminder_count)
      VALUES ('o_wh', 'st_northlight', 5001, 'Web Hook', 'ev_mehta', 'Mehta Sangeet Night', '1 photo', 14900, 'INR', 13410, 'pending', 'order_rzWH', '2026-09-01T00:00:00.000Z', 0)`).run()
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_wh', order_id: 'order_rzWH', status: 'captured' } } } })
    const post = (sig: string) => SELF.fetch(`${BASE}/v1/webhooks/razorpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig, 'cf-connecting-ip': freshIp() }, body })
    expect((await post('0'.repeat(64))).status).toBe(401)
    const res = await post(await hmacHex('test-razorpay-webhook-secret', body))
    expect(await res.json()).toMatchObject({ ok: true, orderId: 'o_wh', changed: true })
    const row = await env.DB.prepare("SELECT status FROM orders WHERE id = 'o_wh'").first<{ status: string }>()
    expect(row!.status).toBe('paid')
    expect(await (await post(await hmacHex('test-razorpay-webhook-secret', body))).json()).toMatchObject({ changed: false })
  })

  it('lists abandoned carts and records reminders', async () => {
    const editor = await tokenFor('editor')
    await env.DB.prepare(`INSERT INTO orders (id, studio_id, number, buyer, buyer_email, event_id, event_name, items, paid_paise, currency, share_paise, status, at, reminder_count)
      VALUES ('o_cart', 'st_northlight', 5002, 'Cart Person', 'cart@example.com', 'ev_mehta', 'Mehta Sangeet Night', '2 photos', 29800, 'INR', 26820, 'pending', '2026-09-01T10:00:00.000Z', 0)`).run()
    const carts = (await call('/v1/carts', { token: editor })).json.items
    expect(carts.find((x: { orderId: string }) => x.orderId === 'o_cart')).toMatchObject({ amount: 298, reminders: 0, buyerEmail: 'cart@example.com' })
    expect((await call('/v1/carts/remind', { token: editor, body: { orderIds: ['o_cart'] } })).json.reminded).toBe(1)
    expect((await call('/v1/carts', { token: editor })).json.items.find((x: { orderId: string }) => x.orderId === 'o_cart')).toMatchObject({ reminders: 1, remindedAt: expect.any(String) })
  })
})

describe('studio side', () => {
  it('changes the gallery code with uniqueness checks', async () => {
    const token = await tokenFor('editor')
    const ev = (await call('/v1/events', { token, body: { name: 'Code change', date: '2026-12-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 } })).json
    expectProblem(await call(`/v1/events/${ev.id}`, { token, method: 'PATCH', body: { shortId: '6402f9f' } }), 409, 'short_id_taken')
    expectProblem(await call(`/v1/events/${ev.id}`, { token, method: 'PATCH', body: { shortId: 'bad' } }), 422, 'validation_failed')
    expect((await call(`/v1/events/${ev.id}`, { token, method: 'PATCH', body: { shortId: 'goa2026' } })).json.shortId).toBe('GOA2026')
    expect((await call('/v1/public/events/goa2026')).json.id).toBe(ev.id)
  })

  it('uploads assets with type/size checks and attaches KYC documents', async () => {
    const token = await tokenFor('owner')
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    const up = (kind: string, type: string, body: BodyInit, name = 'f') => SELF.fetch(`${BASE}/v1/assets?kind=${kind}&filename=${name}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': type, 'cf-connecting-ip': freshIp() }, body })
    const r = await up('studio-logo', 'image/png', png, 'logo.png')
    expect(r.status).toBe(201)
    const asset = (await r.json()) as { url: string; id: string; size: number }
    expect(asset.url).toMatch(/^https:\/\/api\.test\/v1\/media\/studios\/st_northlight\/assets\/studio-logo\//)
    expect(asset.size).toBe(png.length)
    const served = await SELF.fetch(asset.url)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect((await call('/v1/studio', { token, method: 'PATCH', body: { logoUrl: asset.url } })).json.logoUrl).toBe(asset.url)
    expect((await up('studio-logo', 'image/svg+xml', '<svg/>')).status).toBe(415)
    expect((await up('kyc-document', 'image/gif', png)).status).toBe(415)
    expect((await up('broadcast-image', 'image/jpeg', new Uint8Array(10 * 1024 * 1024 + 1))).status).toBe(413)
    const pdf = (await (await up('kyc-document', 'application/pdf', new TextEncoder().encode('%PDF-1.4 test'), 'cheque.pdf')).json()) as { id: string }
    const s = await call('/v1/store/settings', { token, method: 'PATCH', body: { kyc: { documents: [{ kind: 'cheque', status: 'needed', fileName: '', assetId: pdf.id }] } } })
    expect(s.json.kyc.documents[0]).toMatchObject({ kind: 'cheque', assetId: pdf.id, fileName: 'cheque.pdf', status: 'review' })
    expectProblem(await call('/v1/store/settings', { token, method: 'PATCH', body: { kyc: { documents: [{ kind: 'pan', status: 'needed', fileName: '', assetId: asset.id }] } } }), 422, 'validation_failed')
  })

  it('buys a pack for an event, stores billing details, matches faces for links', async () => {
    const token = await newStudio()
    await call('/v1/studio/coupons', { token, body: { code: 'WELCOME500' } })
    const ev = (await call('/v1/events', { token, body: { name: 'Pack', date: '2026-12-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 } })).json
    expectProblem(await call(`/v1/events/${ev.id}/packs`, { token, body: { photos: 1000, payWith: 'credits' } }), 402, 'insufficient_credits')
    const bought = await call(`/v1/events/${ev.id}/packs`, { token, body: { photos: 1000, payWith: 'card' } })
    expect(bought.json).toMatchObject({ charged: 700, event: { photoLimit: 3000 }, purchase: { kind: 'pack', amount: 700, method: 'card' } })
    expect((await call('/v1/studio/usage', { token })).json.walletCredits).toBe(500)
    expectProblem(await call(`/v1/events/${ev.id}/packs`, { token, body: { photos: 1234, payWith: 'card' } }), 422, 'validation_failed')

    const billing = { name: 'Test Studio LLP', gstin: '27AAKFN4521Q1Z8', address: '1 Main Road, Pune', state: 'Maharashtra', invoiceEmail: 'accounts@example.com' }
    expect((await call('/v1/studio', { token, method: 'PATCH', body: { billing } })).json.billing).toEqual(billing)
    expectProblem(await call('/v1/studio', { token, method: 'PATCH', body: { billing: { ...billing, gstin: 'nope' } } }), 422, 'validation_failed')

    const m = await call('/v1/events/ev_riya/faces/match', { token: await tokenFor('editor'), body: { key: 'ev_riya:photo.jpg:1' } })
    expect(['p_g1', 'p_g2', 'p_g3']).toContain(m.json.personId)
  })

  it('moves events to the trash, restores them, and the daily job purges old ones', async () => {
    const token = await tokenFor('editor')
    const ev = (await call('/v1/events', { token, body: { name: 'Trash me', date: '2026-12-01', city: 'Goa', type: 'other', preset: 'open-corporate', guestUploadLimit: 0 } })).json
    expect((await call(`/v1/events/${ev.id}`, { token, method: 'DELETE' })).status).toBe(204)
    expect((await call('/v1/events?limit=200', { token })).json.items.some((e: { id: string }) => e.id === ev.id)).toBe(false)
    expectProblem(await call(`/v1/public/events/${ev.shortId}`), 404)
    const trash = (await call('/v1/trash/events', { token })).json.items
    expect(trash.find((e: { id: string }) => e.id === ev.id).deletedAt).toEqual(expect.any(String))
    expect((await call(`/v1/events/${ev.id}/restore`, { token, method: 'POST' })).json.deletedAt).toBeUndefined()
    expect((await call(`/v1/events/${ev.id}`, { token })).status).toBe(200)

    await call(`/v1/events/${ev.id}`, { token, method: 'DELETE' })
    await env.DB.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').bind(new Date(Date.now() - 31 * 86_400_000).toISOString(), ev.id).run()
    const ctx = createExecutionContext()
    await worker.scheduled(createScheduledController({ cron: '0 3 * * *', scheduledTime: Date.now() }), env as never, ctx)
    await waitOnExecutionContext(ctx)
    expect(await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(ev.id).first()).toBeNull()
  })

  it('switches scheduled Smart QRs and sends due broadcasts every minute', async () => {
    const token = await tokenFor('editor')
    const qr = (await call('/v1/qrs', { token, body: { name: 'Cron QR', eventId: 'ev_riya' } })).json
    const soon = new Date(Date.now() + 60_000).toISOString()
    await call(`/v1/qrs/${qr.id}`, { token, method: 'PATCH', body: { scheduledEventId: 'ev_mehta', scheduledAt: soon } })
    const b = (await call('/v1/broadcasts', { token, body: { title: 'Later', body: 'x', audience: 'all', scheduledAt: soon } })).json
    const ctx = createExecutionContext()
    await worker.scheduled(createScheduledController({ cron: '* * * * *', scheduledTime: Date.now() + 120_000 }), env as never, ctx)
    await waitOnExecutionContext(ctx)
    const after = (await call('/v1/qrs?limit=200', { token })).json.items.find((q: { id: string }) => q.id === qr.id)
    expect(after).toMatchObject({ eventId: 'ev_mehta' })
    expect(after.scheduledEventId).toBeUndefined()
    expect((await call('/v1/broadcasts?limit=200', { token })).json.items.find((x: { id: string }) => x.id === b.id).sentAt).toEqual(soon)
  })
})

describe('guest identity: follows, galleries, access requests; auth extras', () => {
  it('keeps follows and galleries per device', async () => {
    const h = { 'x-guest-device': `dev-${crypto.randomUUID()}` }
    expectProblem(await call('/v1/public/me/follows', {}), 401, 'guest_identity_required')
    const before = (await call('/v1/public/studios/FA-KCGWHY')).json.studio.followers
    expect((await call('/v1/public/studios/FA-KCGWHY/follow', { method: 'POST', headers: h })).json.followers).toBe(before + 1)
    expect((await call('/v1/public/studios/FA-KCGWHY/follow', { method: 'POST', headers: h })).json.followers).toBe(before + 1)
    expect((await call('/v1/public/me/follows', { headers: h })).json.items.map((s: { followCode: string }) => s.followCode)).toEqual(['FA-KCGWHY'])
    expect((await call('/v1/public/studios/FA-KCGWHY/follow', { method: 'DELETE', headers: h })).json.followers).toBe(before)
    expect((await call('/v1/public/me/follows', { headers: h })).json.items).toEqual([])

    await call(`/v1/public/events/${TESSERA}`, { headers: h })
    await call(`/v1/public/events/${RIYA}`, { headers: h })
    const g = (await call('/v1/public/me/galleries', { headers: h })).json.items
    expect(g.map((x: { shortId: string }) => x.shortId).sort()).toEqual([RIYA, TESSERA].sort())
    expect(g[0]).toMatchObject({ studioName: 'Northlight Studio', lastOpenedAt: expect.any(String) })
  })

  it('resets a password with an emailed code and signs out other sessions', async () => {
    const email = uniqueEmail('reset')
    const ip = freshIp()
    const first = await call('/v1/auth/otp/verify', { ip, body: { email, code: (await call('/v1/auth/otp/request', { ip, body: { email } })).json.devCode } })
    await new Promise((r) => setTimeout(r, 0))
    await env.DB.prepare('UPDATE otp_codes SET created_at = ? WHERE email = ?').bind(new Date(Date.now() - 60_000).toISOString(), email).run()
    const code = (await call('/v1/auth/otp/request', { ip, body: { email } })).json.devCode
    expectProblem(await call('/v1/auth/password/reset', { ip, body: { email, code: code === '000000' ? '111111' : '000000', newPassword: 'brand new password' } }), 401, 'otp_invalid')
    const r = await call('/v1/auth/password/reset', { ip, body: { email, code, newPassword: 'brand new password' } })
    expect(r.status).toBe(200)
    expect(r.json.user.hasPassword).toBe(true)
    expectProblem(await call('/v1/auth/refresh', { body: { refreshToken: first.json.refreshToken } }), 401, 'refresh_token_revoked')
    expect((await call('/v1/auth/password/login', { ip, body: { email, password: 'brand new password' } })).status).toBe(200)
  })

  it('allows only allowlisted native redirects for Google sign-in', async () => {
    expectProblem(await call('/v1/auth/google/start?redirect=frameline://sign-in&mode=json'), 501, 'not_configured')
  })

  it('files access requests from guests', async () => {
    const r = await call(`/v1/public/events/${RIYA}/access-requests`, { body: { name: 'Cousin', email: 'cousin@example.com', note: 'Family' } })
    expect(r.status).toBe(202)
    const list = (await call('/v1/events/ev_riya/access-requests?limit=200', { token: await tokenFor('editor') })).json.items
    expect(list.some((a: { email: string }) => a.email === 'cousin@example.com')).toBe(true)
  })
})

describe('native OAuth redirects', () => {
  it('accepts app paths and allowlisted native URIs only', async () => {
    const { safeRedirect } = await import('../src/routes/auth')
    const e = env as never
    expect(safeRedirect(e, '/auth/callback')).toBe('/auth/callback')
    expect(safeRedirect(e, 'frameline://sign-in')).toBe('frameline://sign-in')
    expect(safeRedirect(e, 'frameline://sign-in?next=%2Fevents')).toBe('frameline://sign-in?next=%2Fevents')
    expect(safeRedirect(e, 'https://evil.example.com')).toBe('/auth/callback')
    expect(safeRedirect(e, '//evil.example.com')).toBe('/auth/callback')
    expect(safeRedirect(e, 'frameline://sign-in.evil')).toBe('/auth/callback')
  })
})
