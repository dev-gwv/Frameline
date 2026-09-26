import { describe, expect, it } from 'vitest'
import { call, expectProblem, freshIp, tokenFor, uniqueEmail } from './helpers'

describe('meta, errors, versioning', () => {
  it('serves /health and /v1/meta', async () => {
    const h = await call('/health')
    expect(h.status).toBe(200)
    expect(h.json).toEqual({ status: 'ok', checks: { db: 'ok' } })
    const m = await call('/v1/meta')
    expect(m.json).toMatchObject({ apiVersion: 'v1', version: '1.0.0', environment: 'test' })
    expect(m.headers.get('api-version')).toBe('1')
  })

  it('echoes a valid X-Request-Id and generates one otherwise', async () => {
    const r = await call('/v1/meta', { headers: { 'x-request-id': 'req-test-12345' } })
    expect(r.headers.get('x-request-id')).toBe('req-test-12345')
    const g = await call('/v1/meta')
    expect(g.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns problem+json for unknown routes', async () => {
    const r = await call('/v1/nope')
    expectProblem(r, 404, 'not_found')
    expect(r.json.requestId).toBe(r.headers.get('x-request-id'))
  })

  it('publishes an OpenAPI document and docs page', async () => {
    const spec = await call('/v1/openapi.json')
    expect(spec.status).toBe(200)
    expect(spec.json.openapi).toBe('3.1.0')
    for (const p of ['/v1/events', '/v1/events/{id}/photos', '/v1/auth/otp/request', '/v1/public/events/{shortId}/faces/search', '/v1/store/settings', '/v1/events/{id}/photo-ids']) expect(spec.json.paths).toHaveProperty([p])
    const docs = await call('/v1/docs')
    expect(docs.status).toBe(200)
    expect(String(docs.json)).toContain('/v1/openapi.json')
  })
})

describe('validation', () => {
  it('returns 422 with field errors', async () => {
    const token = await tokenFor('owner')
    const r = await call('/v1/events', { token, body: { name: '', date: 'not-a-date', type: 'party', preset: 'race', extra: 1 } })
    expectProblem(r, 422, 'validation_failed')
    const fields = r.json.errors.map((e: { field: string }) => e.field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'date', 'type']))
    for (const e of r.json.errors) expect(e).toMatchObject({ in: 'body', message: expect.any(String), code: expect.any(String) })
  })

  it('validates query parameters', async () => {
    const token = await tokenFor('owner')
    const r = await call('/v1/events/ev_riya/photos?limit=5000&sort=random', { token })
    expectProblem(r, 422, 'validation_failed')
    expect(r.json.errors.map((e: { field: string; in: string }) => `${e.in}:${e.field}`)).toEqual(expect.arrayContaining(['query:limit', 'query:sort']))
  })

  it('rejects non-JSON bodies and oversize bodies', async () => {
    const token = await tokenFor('owner')
    const r = await call('/v1/events', { token, method: 'POST', headers: { 'content-type': 'text/plain' } })
    expect(r.status).toBe(415)
    const big = await call('/v1/events', { token, body: { name: 'x'.repeat(1_100_000) } })
    expectProblem(big, 413)
  })
})

describe('RBAC', () => {
  it('forbids uploaders from creating events', async () => {
    const r = await call('/v1/events', { token: await tokenFor('uploader'), body: { name: 'Nope', date: '2026-10-10', city: 'Pune', type: 'wedding', preset: 'private-family', guestUploadLimit: 10 } })
    expectProblem(r, 403, 'insufficient_role')
    expect(r.json.requiredRole).toBe('editor')
  })

  it('limits uploaders to their assigned events', async () => {
    const token = await tokenFor('uploader')
    const list = await call('/v1/events', { token })
    expect(list.json.items.map((e: { id: string }) => e.id)).toEqual(['ev_tessera'])
    expectProblem(await call('/v1/events/ev_riya', { token }), 404, 'not_found')
    expect((await call('/v1/events/ev_tessera/photos?limit=5', { token })).status).toBe(200)
  })

  it('reserves billing, payouts and team for owners', async () => {
    const editor = await tokenFor('editor')
    expectProblem(await call('/v1/orders', { token: editor }), 403, 'insufficient_role')
    expectProblem(await call('/v1/ledger', { token: editor }), 403, 'insufficient_role')
    expectProblem(await call('/v1/studio/credits', { token: editor, body: { amount: 100 } }), 403, 'insufficient_role')
    expectProblem(await call('/v1/team/invites', { token: editor, body: { email: 'x@example.com', role: 'editor' } }), 403, 'insufficient_role')
    const owner = await tokenFor('owner')
    const orders = await call('/v1/orders', { token: owner })
    expect(orders.status).toBe(200)
    expect(orders.json.items[0]).toMatchObject({ id: 'o1043', paid: 1199, share: 1079.1 })
  })
})

describe('rate limiting', () => {
  it('returns 429 with Retry-After and RateLimit headers after 5 OTP requests per IP', async () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) {
      const r = await call('/v1/auth/otp/request', { ip, body: { email: uniqueEmail('rl') } })
      expect(r.status).toBe(202)
      expect(r.headers.get('ratelimit-limit')).toBe('5')
      expect(r.headers.get('ratelimit-remaining')).toBe(String(4 - i))
    }
    const blocked = await call('/v1/auth/otp/request', { ip, body: { email: uniqueEmail('rl') } })
    expectProblem(blocked, 429, 'rate_limited')
    const retry = Number(blocked.headers.get('retry-after'))
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(900)
    expect(blocked.headers.get('ratelimit-remaining')).toBe('0')
    expect(blocked.headers.get('ratelimit-policy')).toBe('5;w=900')
    // A different IP is unaffected.
    expect((await call('/v1/auth/otp/request', { body: { email: uniqueEmail('rl') } })).status).toBe(202)
  })
})

describe('idempotency', () => {
  const input = { name: 'Idempotent Gala', date: '2026-11-01T00:00:00.000Z', city: 'Pune', type: 'corporate', preset: 'open-corporate', guestUploadLimit: 50 }

  it('replays the first response for the same key and body', async () => {
    const token = await tokenFor('owner')
    const key = `idem-${crypto.randomUUID()}`
    const a = await call('/v1/events', { token, body: input, headers: { 'idempotency-key': key } })
    expect(a.status).toBe(201)
    const b = await call('/v1/events', { token, body: input, headers: { 'idempotency-key': key } })
    expect(b.status).toBe(201)
    expect(b.headers.get('idempotent-replayed')).toBe('true')
    expect(b.json.id).toBe(a.json.id)
    const list = await call('/v1/events?limit=200', { token })
    expect(list.json.items.filter((e: { name: string; id: string }) => e.name === input.name && e.id === a.json.id)).toHaveLength(1)
  })

  it('rejects the same key with a different body', async () => {
    const token = await tokenFor('owner')
    const key = `idem-${crypto.randomUUID()}`
    expect((await call('/v1/events', { token, body: input, headers: { 'idempotency-key': key } })).status).toBe(201)
    expectProblem(await call('/v1/events', { token, body: { ...input, name: 'Different' }, headers: { 'idempotency-key': key } }), 422, 'idempotency_key_reused')
  })
})
