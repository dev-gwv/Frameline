import { describe, expect, it } from 'vitest'
import { createMockApi } from '@frameline/shared'
import { call, expectProblem, tokenFor } from './helpers'

const MEHTA = '7A1C0B2' // link-pin, store on
const key = (tag: string) => ({ 'idempotency-key': `${tag}-${crypto.randomUUID()}` })

/** A fresh paid order (no Razorpay keys in tests, so orders are paid immediately). */
async function paidOrder() {
  const token = (await call(`/v1/public/events/${MEHTA}/pin`, { body: { pin: '5211' } })).json.token as string
  const [ph] = (await call(`/v1/public/events/${MEHTA}/photos?limit=1`, { token })).json.items
  const r = await call(`/v1/public/events/${MEHTA}/orders`, { token, body: { items: [{ priceId: 'single', photoIds: [ph.id] }], method: 'upi', buyer: { name: 'Refund Me', email: 'refund@example.com' } } })
  expect(r.status).toBe(201)
  expect(r.json.status).toBe('paid')
  return r.json as { id: string; number: number; paid: number; share: number }
}

describe('wallet', () => {
  it('returns prepaid + earnings as one balance (owner only)', async () => {
    const owner = await tokenFor('owner')
    const w = await call('/v1/wallet', { token: owner })
    expect(w.status).toBe(200)
    expect(w.json).toMatchObject({ currency: 'INR', balance: expect.any(Number), withdrawable: expect.any(Number), prepaid: expect.any(Number), earnings: expect.any(Number), asOf: expect.any(String) })
    expect(w.json.balance).toBeCloseTo(w.json.prepaid + w.json.earnings, 2)
    expect(w.json.withdrawable).toBe(Math.max(0, w.json.earnings))
    const usage = await call('/v1/studio/usage', { token: owner })
    expect(w.json.prepaid).toBe(usage.json.walletCredits)
    expectProblem(await call('/v1/wallet', { token: await tokenFor('editor') }), 403)
  })
})

describe('wallet spending rule', () => {
  it('spends prepaid first, then earnings, with one ledger line per pot (API)', async () => {
    const owner = await tokenFor('owner')
    const before = (await call('/v1/wallet', { token: owner })).json
    expect(before.earnings).toBeGreaterThan(200)
    const amount = Math.round((before.prepaid + 150) * 100) / 100
    const r = await call('/v1/studio/credits/spend', { token: owner, body: { amount, description: 'Pro plan · yearly' }, headers: key('spend') })
    expect(r.status).toBe(200)
    expect(r.json.walletCredits).toBe(0)
    const after = (await call('/v1/wallet', { token: owner })).json
    expect(after.prepaid).toBe(0)
    expect(after.earnings).toBeCloseTo(before.earnings - 150, 2)
    expect(after.withdrawable).toBeCloseTo(Math.max(0, before.earnings - 150), 2)
    expect(after.balance).toBeCloseTo(before.balance - amount, 2)
    const lines = (await call('/v1/ledger?limit=2', { token: owner })).json.items as { type: string; amount: number; description: string }[]
    const byPot = Object.fromEntries(lines.map((l) => [l.description, l.amount]))
    expect(byPot['Pro plan · yearly · from sales']).toBeCloseTo(-150, 2)
    if (before.prepaid > 0) expect(byPot['Pro plan · yearly · from added money']).toBeCloseTo(-before.prepaid, 2)
    // More than prepaid + earnings → 402 with what's available.
    const short = await call('/v1/studio/credits/spend', { token: owner, body: { amount: Math.ceil(after.balance) + 1000, description: 'Too much' }, headers: key('spend') })
    expectProblem(short, 402, 'insufficient_credits')
    expect(short.json.available).toBeCloseTo(Math.max(0, after.earnings), 2)
  })

  it('uses the same rule in the mock', async () => {
    const m = createMockApi(undefined, { latency: 0 })
    const before = await m.getWallet()
    await m.addCredits(100)
    const mid = await m.getWallet()
    expect(mid.prepaid).toBe(before.prepaid + 100)
    const { entry, walletCredits } = await m.spendCredits(mid.prepaid + 40, 'AI enhance')
    expect(walletCredits).toBe(0)
    expect(entry).toMatchObject({ type: 'credits-used', amount: -mid.prepaid, description: 'AI enhance · from added money' })
    const after = await m.getWallet()
    expect(after.earnings).toBeCloseTo(mid.earnings - 40, 2)
    expect(after.withdrawable).toBeCloseTo(Math.max(0, mid.earnings - 40), 2)
    const [top] = await m.listLedger()
    expect(top).toMatchObject({ type: 'credits-used', amount: -40, description: 'AI enhance · from sales' })
    await expect(m.spendCredits(after.balance + 1, 'Too much')).rejects.toMatchObject({ status: 402, code: 'insufficient_credits' })
  })
})

describe('needs you', () => {
  it('lists access requests and guest uploads awaiting review, with ids', async () => {
    const r = await call('/v1/needs-you', { token: await tokenFor('editor') })
    expect(r.status).toBe(200)
    const items = r.json.items as { id: string; kind: string; eventId: string; accessRequestId?: string; count?: number }[]
    expect(items.find((i) => i.kind === 'access-request' && i.accessRequestId === 'ar1')).toMatchObject({ id: 'access-request:ar1', eventId: 'ev_riya' })
    const uploads = items.find((i) => i.kind === 'guest-uploads' && i.eventId === 'ev_riya')
    expect(uploads?.count).toBeGreaterThan(0)
    // Every item is actionable and points at an event.
    for (const i of items) expect(i.eventId).toBeTruthy()
    expectProblem(await call('/v1/needs-you', { token: await tokenFor('uploader') }), 403)
  })
})

describe('refunds', () => {
  it('refunds a paid order once: ledger debit, status, idempotent replay', async () => {
    const owner = await tokenFor('owner')
    const order = await paidOrder()
    const before = (await call('/v1/wallet', { token: owner })).json
    const headers = key('refund')
    const r = await call(`/v1/orders/${order.id}/refund`, { token: owner, body: { reason: 'Duplicate order' }, headers })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ id: order.id, status: 'refunded', refundReason: 'Duplicate order', refundedAt: expect.any(String) })

    // Same Idempotency-Key → same response, no second ledger line.
    const replay = await call(`/v1/orders/${order.id}/refund`, { token: owner, body: { reason: 'Duplicate order' }, headers })
    expect(replay.status).toBe(200)
    expect(replay.json.refundedAt).toBe(r.json.refundedAt)

    const after = (await call('/v1/wallet', { token: owner })).json
    expect(after.earnings).toBeCloseTo(before.earnings - order.share, 2)
    const ledger = (await call('/v1/ledger?limit=5', { token: owner })).json.items as { type: string; amount: number; description: string }[]
    const lines = ledger.filter((l) => l.type === 'refund' && l.description.startsWith(`Order #${order.number} refunded`))
    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBeCloseTo(-order.share, 2)

    // A new key can't refund it again.
    expectProblem(await call(`/v1/orders/${order.id}/refund`, { token: owner, body: { reason: 'Again' }, headers: key('refund') }), 409, 'order_not_refundable')
  })

  it('validates state, reason and role', async () => {
    const owner = await tokenFor('owner')
    expectProblem(await call('/v1/orders/o1037/refund', { token: owner, body: { reason: 'x' }, headers: key('r') }), 409, 'order_not_refundable') // pending
    expectProblem(await call('/v1/orders/o1039/refund', { token: owner, body: { reason: 'x' }, headers: key('r') }), 409, 'order_not_refundable') // paid directly
    expectProblem(await call('/v1/orders/nope/refund', { token: owner, body: { reason: 'x' }, headers: key('r') }), 404)
    const order = await paidOrder()
    expectProblem(await call(`/v1/orders/${order.id}/refund`, { token: owner, body: { reason: '  ' }, headers: key('r') }), 422, 'validation_failed')
    expectProblem(await call(`/v1/orders/${order.id}/refund`, { token: await tokenFor('editor'), body: { reason: 'x' }, headers: key('r') }), 403)
  })
})

describe('mock API: contract v4', () => {
  it('wallet, needs you and refund behave like the real API', async () => {
    const m = createMockApi(undefined, { latency: 0 })
    const w = await m.getWallet()
    expect(w.balance).toBeCloseTo(w.prepaid + w.earnings, 2)
    const needs = await m.listNeedsYou()
    expect(needs.find((i) => i.id === 'access-request:ar1')).toMatchObject({ eventId: 'ev_riya', accessRequestId: 'ar1' })
    expect(needs.find((i) => i.kind === 'guest-uploads' && i.eventId === 'ev_riya')?.count).toBeGreaterThan(0)

    const o = await m.refundOrder('o1043', 'Duplicate order')
    expect(o).toMatchObject({ status: 'refunded', refundReason: 'Duplicate order' })
    expect((await m.getWallet()).earnings).toBeCloseTo(w.earnings - o.share, 2)
    expect((await m.listLedger())[0]).toMatchObject({ type: 'refund', amount: -o.share })
    await expect(m.refundOrder('o1043', 'Again')).rejects.toMatchObject({ status: 409, code: 'order_not_refundable' })
    await expect(m.refundOrder('o1037', 'x')).rejects.toMatchObject({ status: 409, code: 'order_not_refundable' })
    await expect(m.refundOrder('o1042', ' ')).rejects.toMatchObject({ status: 422 })
  })
})
