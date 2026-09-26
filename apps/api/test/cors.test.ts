import { describe, expect, it } from 'vitest'
import { SELF } from 'cloudflare:test'

/**
 * Every custom header the shared HTTP client sends must pass the browser's CORS preflight,
 * otherwise web clients fail with a bare "Failed to fetch" (tests calling the Worker directly
 * never see it). Keep this list in sync with packages/shared/src/http.ts.
 */
const CLIENT_HEADERS = ['authorization', 'content-type', 'idempotency-key', 'x-request-id', 'x-studio-id', 'x-guest-token', 'x-guest-device']

describe('CORS preflight', () => {
  for (const origin of ['http://localhost:5173', 'http://localhost:5174']) {
    it(`allows every client header from ${origin}`, async () => {
      const res = await SELF.fetch('https://api.test/v1/public/events/6402F9F', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': CLIENT_HEADERS.join(',') },
      })
      expect(res.status).toBeLessThan(300)
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(/\s*,\s*/)
      for (const h of CLIENT_HEADERS) expect(allowed, `missing ${h}`).toContain(h)
    })
  }

  it('rejects unknown origins', async () => {
    const res = await SELF.fetch('https://api.test/v1/meta', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } })
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example')
  })
})
