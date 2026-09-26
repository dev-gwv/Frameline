import { and, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { hmacSha256, timingSafeEqual, toHex } from '../lib/crypto'
import { newId, nowIso } from '../lib/ids'
import { toMajor } from '../lib/money'
import { addLedger } from './billing'

type OrderRow = typeof schema.orders.$inferSelect

/**
 * Marks a pending order paid exactly once (compare-and-set on status), then books the studio's share
 * in the ledger and adds an activity line. Safe to call again (webhook retries, client confirm + webhook).
 */
export async function markOrderPaid(db: DB, order: OrderRow, paymentRef?: string): Promise<{ order: OrderRow; changed: boolean }> {
  const res = await db.update(schema.orders).set({ status: 'paid', ...(paymentRef ? { providerRef: paymentRef } : {}) })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, 'pending'))).run()
  const [fresh] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id)).limit(1)
  if (res.meta.changes === 0) return { order: fresh, changed: false }
  await addLedger(db, order.studioId, 'sale', `Order #${order.number} · ${order.eventName}`, order.sharePaise, true)
  await db.insert(schema.activity).values({
    id: newId('act'), studioId: order.studioId, kind: 'order', title: `Order #${order.number} · ₹${toMajor(order.paidPaise).toLocaleString('en-IN')}`, detail: order.eventName, at: nowIso(),
  }).run()
  return { order: fresh, changed: true }
}

/** Razorpay Checkout signature: hex HMAC-SHA256(`${order_id}|${payment_id}`, key_secret). */
export async function verifyCheckoutSignature(keySecret: string, providerOrderId: string, paymentId: string, signature: string): Promise<boolean> {
  return timingSafeEqual(toHex(await hmacSha256(keySecret, `${providerOrderId}|${paymentId}`)), signature)
}

/** Razorpay webhook signature: hex HMAC-SHA256(raw body, webhook secret) in X-Razorpay-Signature. */
export async function verifyWebhookSignature(secret: string, rawBody: string, signature: string): Promise<boolean> {
  return timingSafeEqual(toHex(await hmacSha256(secret, rawBody)), signature)
}
