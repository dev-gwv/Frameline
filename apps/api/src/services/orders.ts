import { and, eq } from 'drizzle-orm'
import type { Env } from '../env'
import type { DB } from '../db/client'
import { getDb, schema } from '../db/client'
import { hmacSha256, timingSafeEqual, toBase64Url, toHex } from '../lib/crypto'
import { getMailer } from './mailer'
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

// ── Receipts ────────────────────────────────────────────────────────────────

/**
 * A receipt link token, `<orderId>.<signature>`: it opens that one order on any device (the gallery's "Your
 * orders" page), without signing in. Orders aren't matched by email, because anyone could type an email.
 */
export async function receiptToken(secret: string, orderId: string): Promise<string> {
  return `${orderId}.${toBase64Url(await hmacSha256(secret, `receipt:${orderId}`)).slice(0, 27)}`
}

export async function verifyReceiptToken(secret: string, token: string): Promise<string | null> {
  const orderId = token.slice(0, token.lastIndexOf('.'))
  if (!orderId) return null
  return timingSafeEqual(await receiptToken(secret, orderId), token) ? orderId : null
}

/** Emails the buyer their receipt with the link. Best effort: an email failure never fails the payment. */
export async function sendReceipt(env: Env, order: OrderRow): Promise<void> {
  if (!order.buyerEmail) return
  const [ev] = await getDb(env.DB).select({ shortId: schema.events.shortId }).from(schema.events).where(eq(schema.events.id, order.eventId)).limit(1)
  if (!ev) return
  const link = `${env.GALLERY_URL.replace(/\/$/, '')}/${ev.shortId.toLowerCase()}/orders?receipt=${encodeURIComponent(await receiptToken(env.JWT_SECRET, order.id))}`
  await getMailer(env).send({
    to: order.buyerEmail,
    subject: `Your order ${order.number} · ${order.eventName}`,
    text: `Thank you for your order.

Order ${order.number} · ${order.items}
Paid: ₹${toMajor(order.paidPaise).toLocaleString('en-IN')}

See your order and download your photos on any device:
${link}

Keep this email: the link is how you get back to your order.`,
  }).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'receipt email failed', orderId: order.id, error: String(e) })))
}

/** Razorpay Checkout signature: hex HMAC-SHA256(`${order_id}|${payment_id}`, key_secret). */
export async function verifyCheckoutSignature(keySecret: string, providerOrderId: string, paymentId: string, signature: string): Promise<boolean> {
  return timingSafeEqual(toHex(await hmacSha256(keySecret, `${providerOrderId}|${paymentId}`)), signature)
}

/** Razorpay webhook signature: hex HMAC-SHA256(raw body, webhook secret) in X-Razorpay-Signature. */
export async function verifyWebhookSignature(secret: string, rawBody: string, signature: string): Promise<boolean> {
  return timingSafeEqual(toHex(await hmacSha256(secret, rawBody)), signature)
}
