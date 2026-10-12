import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, schema } from '../src/db/client'
import { eq } from 'drizzle-orm'
import { PaymentsNotConfigured, openStudioPayment, paymentMode, settleStudioPayment } from '../src/services/payments'
import { payoutBalance } from '../src/services/billing'
import { call, expectProblem, tokenFor } from './helpers'

/**
 * Money is only granted when it was taken. These were holes: a studio could add ₹10 lakh to its wallet or
 * change plan "by card" for free, and an `international` order was marked paid and credited to the payout
 * balance without anyone paying.
 */

const STUDIO = 'st_northlight'
const db = () => getDb(env.DB)
const wallet = async () => (await db().select({ w: schema.studios.walletPaise }).from(schema.studios).where(eq(schema.studios.id, STUDIO)).limit(1))[0]!.w

afterEach(() => vi.unstubAllGlobals())

describe('without a payment gateway', () => {
  it('refuses card and UPI in production instead of granting for free', () => {
    expect(() => paymentMode({ ...env, ENVIRONMENT: 'production', RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined })).toThrow(PaymentsNotConfigured)
    expect(() => paymentMode({ ...env, ENVIRONMENT: 'staging', RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined })).toThrow(PaymentsNotConfigured)
  })

  it('simulates only in development and test, so the app runs without a gateway', () => {
    expect(paymentMode({ ...env, ENVIRONMENT: 'test', RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined })).toBe('simulate')
    expect(paymentMode({ ...env, ENVIRONMENT: 'production', RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'secret' })).toBe('razorpay')
  })
})

describe('a studio paying by card', () => {
  const live = { ...env, ENVIRONMENT: 'production' as const, RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'rzp_test_secret' }
  let n = 0
  const stubRazorpay = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: `order_test_${++n}` }), { status: 200 })))

  it('grants nothing when the checkout opens, and the money exactly once when it is paid', async () => {
    stubRazorpay()
    const before = await wallet()
    const opened = await openStudioPayment(live, db(), STUDIO, 'u1', { kind: 'credits', amountPaise: 50_000 }, 'upi')
    expect(opened).toMatchObject({ status: 'pending', amount: 500, checkout: { provider: 'razorpay', keyId: 'rzp_test_key' } })
    expect(await wallet()).toBe(before)

    const [row] = await db().select().from(schema.studioPayments).where(eq(schema.studioPayments.id, opened.id)).limit(1)
    expect((await settleStudioPayment(db(), row!, 'pay_1')).changed).toBe(true)
    expect(await wallet()).toBe(before + 50_000)
    // The webhook after the client's confirm (or a retry) changes nothing.
    expect((await settleStudioPayment(db(), row!, 'pay_1')).changed).toBe(false)
    expect(await wallet()).toBe(before + 50_000)
  })

  it('changes the plan only once paid', async () => {
    stubRazorpay()
    const plan = async () => (await db().select({ p: schema.studios.planId }).from(schema.studios).where(eq(schema.studios.id, STUDIO)).limit(1))[0]!.p
    const was = await plan()
    const target = was === 'agency' ? 'pro' : 'agency'
    const opened = await openStudioPayment(live, db(), STUDIO, 'u1', {
      kind: 'plan', planId: target, period: 'yearly', totalPaise: 100_000, label: 'Plan', charged: 847, credit: 0, gstPaise: 15_300,
    }, 'card')
    expect(await plan()).toBe(was)
    const [row] = await db().select().from(schema.studioPayments).where(eq(schema.studioPayments.id, opened.id)).limit(1)
    await settleStudioPayment(db(), row!, 'pay_2')
    expect(await plan()).toBe(target)
  })

  it('cannot be confirmed with a forged signature', async () => {
    const token = await tokenFor('owner')
    const [row] = await db().select().from(schema.studioPayments).limit(1)
    expectProblem(await call(`/v1/studio/payments/${row!.id}/confirm`, { token, body: { providerOrderId: row!.providerOrderId, paymentId: 'pay_x', signature: 'forged' } }), 401, 'invalid_signature')
    // Another purchase's Razorpay order can't settle this one.
    expectProblem(await call(`/v1/studio/payments/${row!.id}/confirm`, { token, body: { providerOrderId: 'order_someone_else', paymentId: 'pay_x', signature: 'x' } }), 409, 'payment_mismatch')
  })
})

describe('orders paid to the studio directly (international)', () => {
  it('are refused when the studio does not sell abroad', async () => {
    const ev = await db().select().from(schema.events).where(eq(schema.events.id, 'ev_marathon')).limit(1)
    const prices = await call(`/v1/public/events/${ev[0]!.shortId}/prices`)
    const priceId = prices.json.items[0].id
    const r = await call(`/v1/public/events/${ev[0]!.shortId}/orders`, {
      body: { items: [{ priceId, photoIds: [] }], method: 'international', buyer: { name: 'John', email: 'john@example.com' } },
    })
    expectProblem(r, 409, 'international_disabled')
  })

  it('wait for the studio, then never enter the payout balance', async () => {
    const balance = await payoutBalance(db(), STUDIO)
    const id = `ord_direct_${Date.now()}`
    await db().insert(schema.orders).values({
      id, studioId: STUDIO, number: 99_001, buyer: 'John D.', eventId: 'ev_marathon', eventName: 'Coastal Half Marathon', items: 'Single photo',
      paidPaise: 1200, currency: 'INR', sharePaise: 1200, status: 'pending', providerRef: null, at: new Date().toISOString(), photoIds: [],
      buyerEmail: 'john@example.com', method: 'international', guestId: null, shipping: null, remindedAt: null, reminderCount: 0,
      refundedAt: null, refundReason: null, trackingNumber: null, linkSentAt: null,
    }).run()
    const token = await tokenFor('owner')
    const r = await call(`/v1/orders/${id}/received`, { token, method: 'POST' })
    expect(r.status).toBe(200)
    expect(r.json.status).toBe('paid-direct')
    expect(await payoutBalance(db(), STUDIO)).toBe(balance)
    expectProblem(await call(`/v1/orders/${id}/received`, { token, method: 'POST' }), 409, 'order_not_direct')
  })
})
