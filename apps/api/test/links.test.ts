import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb, schema } from '../src/db/client'
import { call, expectProblem, freshIp, uniqueEmail } from './helpers'

/** Printed and shared links that used to lead nowhere: smart QR short links and client renewal links. */

async function newStudio() {
  const email = uniqueEmail('links')
  const ip = freshIp()
  const code = (await call('/v1/auth/otp/request', { body: { email }, ip })).json.devCode
  return (await call('/v1/auth/otp/verify', { body: { email, code, studioName: 'Links Studio' }, ip })).json.accessToken as string
}

async function newEvent(token: string, name: string) {
  return (await call('/v1/events', { token, body: { name, date: '2026-12-01', city: 'Jaipur', type: 'wedding', preset: 'open-corporate', guestUploadLimit: 0 } })).json
}

describe('smart QR short links', () => {
  it('resolve to the event, count each scan, and stop when trashed', async () => {
    const token = await newStudio()
    const ev = await newEvent(token, 'QR Wedding')
    const qr = (await call('/v1/qrs', { token, body: { name: `Gate ${Date.now()}`, eventId: ev.id } })).json
    const r = await call(`/v1/public/q/${qr.slug}`)
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ shortId: ev.shortId, target: 'web' })
    await call(`/v1/public/q/${qr.slug}`)
    const row = (await getDb(env.DB).select({ scans: schema.smartQrs.scans }).from(schema.smartQrs).where(eq(schema.smartQrs.id, qr.id)).limit(1))[0]!
    expect(row.scans).toBe(2)
    await call(`/v1/qrs/${qr.id}`, { token, method: 'DELETE' })
    expectProblem(await call(`/v1/public/q/${qr.slug}`), 404)
  })

  it('are unique across studios', async () => {
    const name = `Entrance ${Date.now()}`
    const a = await newStudio()
    const b = await newStudio()
    const qa = (await call('/v1/qrs', { token: a, body: { name, eventId: (await newEvent(a, 'A')).id } })).json
    const qb = (await call('/v1/qrs', { token: b, body: { name, eventId: (await newEvent(b, 'B')).id } })).json
    expect(qb.slug).not.toBe(qa.slug)
    expectProblem(await call(`/v1/qrs/${qb.id}`, { token: b, method: 'PATCH', body: { slug: qa.slug } }), 409, 'slug_taken')
  })
})

describe('renewal links', () => {
  it('let the client pay once and renew the event for a year', async () => {
    const token = await newStudio()
    const ev = await newEvent(token, 'Renew by client')
    const link = (await call(`/v1/events/${ev.id}/renewal-link`, { token, method: 'POST' })).json
    const id = link.url.split('/renew/')[1]
    const shown = await call(`/v1/public/renewals/${id}`)
    expect(shown.json).toMatchObject({ id, eventName: 'Renew by client', price: link.price, paid: false })

    // No gateway in tests: simulated, renewed at once.
    const paid = await call(`/v1/public/renewals/${id}/pay`, { method: 'POST' })
    expect(paid.status).toBe(200)
    expect(paid.json.paid).toBe(true)
    expect(Date.parse(paid.json.eventExpiresAt)).toBeGreaterThan(Date.parse(ev.expiresAt))
    expectProblem(await call(`/v1/public/renewals/${id}/pay`, { method: 'POST' }), 409, 'already_paid')

    const purchases = (await call('/v1/purchases', { token })).json.items as { description: string }[]
    expect(purchases.some((p) => p.description === 'Event renewal · Renew by client (paid by your client)')).toBe(true)
  })

  it('404 for an unknown link', async () => {
    expectProblem(await call('/v1/public/renewals/rl_nope'), 404)
  })
})
