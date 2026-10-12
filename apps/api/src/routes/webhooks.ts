import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { NotConfigured, Unauthorized } from '../lib/errors'
import { markOrderPaid, verifyWebhookSignature } from '../services/orders'
import { settleStudioPayment } from '../services/payments'
import { publishTopics } from '../services/realtime'

/**
 * POST /v1/webhooks/razorpay — server-to-server payment events.
 * Verifies `X-Razorpay-Signature` = hex HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET) before reading the body.
 * Handles `payment.captured` and `order.paid` (order located by Razorpay order id = orders.provider_ref).
 * Always 200 for verified-but-ignored events so Razorpay doesn't retry them.
 */
export const webhookRoutes = new Hono<AppEnv>()

interface RazorpayEvent {
  event: string
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number } }
    order?: { entity?: { id?: string; receipt?: string; amount_paid?: number } }
  }
}

webhookRoutes.post('/webhooks/razorpay', async (c) => {
  const secret = c.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) throw new NotConfigured('Payment webhooks', 'RAZORPAY_WEBHOOK_SECRET is not set.')
  const raw = await c.req.text()
  const signature = c.req.header('x-razorpay-signature') ?? ''
  if (!signature || !(await verifyWebhookSignature(secret, raw, signature))) throw new Unauthorized('Invalid webhook signature.', 'invalid_signature')
  let evt: RazorpayEvent
  try { evt = JSON.parse(raw) as RazorpayEvent } catch { return c.json({ ok: true, ignored: 'malformed' }, 200) }
  if (evt.event !== 'payment.captured' && evt.event !== 'order.paid') return c.json({ ok: true, ignored: evt.event }, 200)
  const providerOrderId = evt.payload?.payment?.entity?.order_id ?? evt.payload?.order?.entity?.id
  if (!providerOrderId) return c.json({ ok: true, ignored: 'no order id' }, 200)
  const paidAmount = evt.payload?.payment?.entity?.amount ?? evt.payload?.order?.entity?.amount_paid
  const db = getDb(c.env.DB)

  // A studio's own purchase (wallet top-up, plan, renewal, pack).
  const [sp] = await db.select().from(schema.studioPayments).where(eq(schema.studioPayments.providerOrderId, providerOrderId)).limit(1)
  if (sp) {
    if (typeof paidAmount === 'number' && paidAmount !== sp.amountPaise) return c.json({ ok: true, ignored: 'amount mismatch' }, 200)
    const { changed } = await settleStudioPayment(db, sp, evt.payload?.payment?.entity?.id ?? providerOrderId)
    if (changed) c.executionCtx.waitUntil(publishTopics(c.env, sp.studioId, ['usage', 'misc', 'events']).catch(() => undefined))
    return c.json({ ok: true, paymentId: sp.id, changed }, 200)
  }

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.providerRef, providerOrderId)).limit(1)
  if (!order) return c.json({ ok: true, ignored: 'unknown order' }, 200)
  // Paid less than the order's price (or in another currency's units): never mark it paid.
  if (typeof paidAmount === 'number' && paidAmount !== order.paidPaise) return c.json({ ok: true, ignored: 'amount mismatch' }, 200)
  const { changed } = await markOrderPaid(db, order)
  if (changed) c.executionCtx.waitUntil(publishTopics(c.env, order.studioId, ['misc', 'activity']).catch(() => undefined))
  return c.json({ ok: true, orderId: order.id, changed }, 200)
})
