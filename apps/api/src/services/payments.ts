import { and, eq, sql } from 'drizzle-orm'
import { PACKS, PERIOD_DAYS, PLANS, type Plan } from '@frameline/shared'
import type { Env } from '../env'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { AppError, ServiceUnavailable } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { toMajor } from '../lib/money'
import { creditWallet, recordPurchase } from './billing'

/**
 * Money taken by card or UPI: guest orders and a studio's own purchases.
 *
 * Three states, and production is never the third:
 *   - Razorpay keys set: a pending payment and a Razorpay order; nothing is granted until Checkout's
 *     signature (confirm) or the webhook proves the payment.
 *   - No keys, production or staging: refused. Granting a plan, a wallet top-up or photos "as paid"
 *     without taking money is how the wallet could be filled with ₹10 lakh for free.
 *   - No keys, development or test: simulated as paid, so the app and its tests run without a gateway.
 */
export const paymentsLive = (env: Env) => !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET
export const canSimulatePayments = (env: Env) => env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test'

export class PaymentsNotConfigured extends AppError {
  constructor() {
    super(503, 'payments_not_configured', 'Payments are not switched on', 'Card and UPI payments aren’t switched on yet. Pay from your wallet, or contact Frameline support.')
  }
}

/** What to do with a card/UPI payment right now. */
export function paymentMode(env: Env): 'razorpay' | 'simulate' {
  if (paymentsLive(env)) return 'razorpay'
  if (canSimulatePayments(env)) return 'simulate'
  throw new PaymentsNotConfigured()
}

export interface Checkout { provider: 'razorpay'; orderId: string; keyId: string; amount: number; currency: 'INR' }

/** Creates the Razorpay order a Checkout pays. `amountPaise` must already be the final amount. */
export async function createProviderOrder(env: Env, amountPaise: number, receipt: string, notes: Record<string, string>): Promise<Checkout> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes }),
  })
  if (!res.ok) throw new ServiceUnavailable('Payments are unavailable right now. Try again in a minute.', 'payment_provider_error')
  const rz = (await res.json()) as { id: string }
  return { provider: 'razorpay', orderId: rz.id, keyId: env.RAZORPAY_KEY_ID!, amount: toMajor(amountPaise), currency: 'INR' }
}

// ── A studio's own purchases ───────────────────────────────────────────────

export type StudioPurchase =
  | { kind: 'credits'; amountPaise: number }
  | { kind: 'plan'; planId: Plan['id']; period: 'yearly' | 'quarterly'; totalPaise: number; label: string; charged: number; credit: number; gstPaise: number }
  | { kind: 'renewal'; eventId: string; eventName: string; chargedPaise: number }
  | { kind: 'pack'; eventId: string; eventName: string; photos: number; pricePaise: number }

type PayMethod = 'card' | 'upi' | 'credits'

export const purchaseAmount = (p: StudioPurchase): number =>
  p.kind === 'credits' ? p.amountPaise : p.kind === 'plan' ? p.totalPaise : p.kind === 'renewal' ? p.chargedPaise : p.pricePaise

/**
 * Grants a purchase that has been paid. The one place each kind's effect lives, used by the wallet path
 * (already paid from the wallet), the simulated path, and a confirmed card/UPI payment alike.
 * Returns the purchase row (null for a zero-amount plan change).
 */
export async function grantStudioPurchase(db: DB, studioId: string, p: StudioPurchase, method: PayMethod) {
  switch (p.kind) {
    case 'credits':
      await creditWallet(db, studioId, p.amountPaise, `Wallet top-up · ₹${toMajor(p.amountPaise)}`)
      return recordPurchase(db, studioId, { description: `Money added to wallet · ₹${toMajor(p.amountPaise)}`, kind: 'credits', amountPaise: p.amountPaise, method })
    case 'plan': {
      const plan = PLANS.find((x) => x.id === p.planId)!
      await db.update(schema.studios).set({
        planId: p.planId, planPeriod: p.period, photosLimit: plan.photos,
        validTill: new Date(Date.now() + PERIOD_DAYS[p.period] * 86_400_000).toISOString(),
      }).where(eq(schema.studios.id, studioId)).run()
      return p.totalPaise > 0 ? recordPurchase(db, studioId, { description: p.label, kind: 'plan', amountPaise: p.totalPaise, method }) : null
    }
    case 'renewal': {
      const [ev] = await db.select().from(schema.events).where(and(eq(schema.events.id, p.eventId), eq(schema.events.studioId, studioId))).limit(1)
      if (!ev) throw new AppError(409, 'event_gone', 'Event gone', 'This event no longer exists. Contact support for a refund.')
      const expiresAt = new Date(Math.max(Date.now(), Date.parse(ev.expiresAt)) + 365 * 86_400_000).toISOString()
      await db.update(schema.events).set({ expiresAt, ...(ev.status === 'expiring' || ev.status === 'archived' ? { status: 'live' as const } : {}) })
        .where(eq(schema.events.id, ev.id)).run()
      return recordPurchase(db, studioId, { description: `Event renewal · ${p.eventName}`, kind: 'renewal', amountPaise: p.chargedPaise, method })
    }
    case 'pack': {
      const pack = PACKS.find((x) => x.photos === p.photos)!
      await db.update(schema.events).set({ photoLimit: sql`${schema.events.photoLimit} + ${pack.photos}` })
        .where(and(eq(schema.events.id, p.eventId), eq(schema.events.studioId, studioId))).run()
      return recordPurchase(db, studioId, { description: `${pack.photos.toLocaleString('en-IN')}-photo pack · ${p.eventName}`, kind: 'pack', amountPaise: p.pricePaise, method })
    }
  }
}

/** Opens a card/UPI payment for a studio purchase: a pending row and its Razorpay order. Grants nothing. */
export async function openStudioPayment(env: Env, db: DB, studioId: string, userId: string | undefined, p: StudioPurchase, method: 'card' | 'upi') {
  const id = newId('spay')
  const amountPaise = purchaseAmount(p)
  const checkout = await createProviderOrder(env, amountPaise, id, { studioId, kind: p.kind })
  await db.insert(schema.studioPayments).values({
    id, studioId, kind: p.kind, method, amountPaise, payload: p as unknown as Record<string, unknown>, status: 'pending',
    providerOrderId: checkout.orderId, providerPaymentId: null, createdBy: userId ?? null, createdAt: nowIso(), paidAt: null,
  }).run()
  return { id, kind: p.kind, status: 'pending' as const, amount: toMajor(amountPaise), checkout }
}

type PaymentRow = typeof schema.studioPayments.$inferSelect

/**
 * Applies a proven payment exactly once (compare-and-set pending → paid). A second call -- the webhook after
 * the client's confirm, or a retry -- changes nothing and reports `changed: false`.
 */
export async function settleStudioPayment(db: DB, row: PaymentRow, providerPaymentId: string): Promise<{ changed: boolean }> {
  const res = await db.update(schema.studioPayments).set({ status: 'paid', providerPaymentId, paidAt: nowIso() })
    .where(and(eq(schema.studioPayments.id, row.id), eq(schema.studioPayments.status, 'pending'))).run()
  if (res.meta.changes === 0) return { changed: false }
  const purchase = await grantStudioPurchase(db, row.studioId, row.payload as unknown as StudioPurchase, row.method)
  // Which purchase this payment made, so a repeated confirm answers with the same invoice.
  await db.update(schema.studioPayments).set({ payload: { ...row.payload, purchaseId: purchase?.id ?? null } })
    .where(eq(schema.studioPayments.id, row.id)).run()
  return { changed: true }
}
