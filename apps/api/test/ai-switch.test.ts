import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import { freshIp } from './helpers'

/**
 * AI_FEATURES=off (lib/features.ts): with no image processor, nothing may depend on face finding. Guests get
 * settings without selfie search or face privacy, "own" downloads become "all", and the apps learn it from /v1/meta.
 */
const RIYA = '6402F9F' // link-pin 5211, face privacy on, downloads 'own'
const off = { ...env, AI_FEATURES: 'off' }

async function call(path: string, init: { body?: unknown; token?: string; ai?: boolean } = {}) {
  const headers: Record<string, string> = { 'cf-connecting-ip': freshIp() }
  if (init.body) headers['content-type'] = 'application/json'
  if (init.token) headers.authorization = `Bearer ${init.token}`
  const req = new Request(`https://api.test${path}`, { method: init.body ? 'POST' : 'GET', headers, body: init.body ? JSON.stringify(init.body) : undefined })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, init.ai === false ? off : env, ctx)
  await waitOnExecutionContext(ctx)
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, any> }
}

describe('the AI switch', () => {
  it('tells the apps whether AI is on', async () => {
    expect((await call('/v1/meta')).json.features).toMatchObject({ ai: true })
    expect((await call('/v1/meta', { ai: false })).json.features).toMatchObject({ ai: false })
  })

  it('tells the apps whether payments work and who the invoice seller is, never a made-up one', async () => {
    const meta = async (e: Record<string, unknown>) => {
      const ctx = createExecutionContext()
      const res = await worker.fetch(new Request('https://api.test/v1/meta', { headers: { 'cf-connecting-ip': freshIp() } }), { ...env, ...e }, ctx)
      await waitOnExecutionContext(ctx)
      return ((await res.json()) as { features: Record<string, unknown> }).features
    }
    const prod = { ENVIRONMENT: 'production', RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }
    expect(await meta(prod)).toMatchObject({ payments: false })
    expect((await meta(prod)).seller).toBeUndefined()
    expect(await meta({ ...prod, RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 's' })).toMatchObject({ payments: true })
    expect(await meta({ SELLER_NAME: 'Acme Pvt Ltd', SELLER_GSTIN: '27ABCDE1234F1Z5' })).toMatchObject({ seller: { name: 'Acme Pvt Ltd', gstin: '27ABCDE1234F1Z5' } })
  })

  it('without payments, no gallery offers anything for sale (a checkout could only fail)', async () => {
    const get = async (e: Record<string, unknown>) => {
      const ctx = createExecutionContext()
      const res = await worker.fetch(new Request('https://api.test/v1/public/events/7A1C0B2', { headers: { 'cf-connecting-ip': freshIp() } }), { ...env, ...e }, ctx)
      await waitOnExecutionContext(ctx)
      return ((await res.json()) as { settings: { storeEnabled: boolean } }).settings
    }
    expect((await get({})).storeEnabled).toBe(true) // Mehta Sangeet sells; tests simulate payments
    expect((await get({ ENVIRONMENT: 'production', RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined })).storeEnabled).toBe(false)
  })

  it('with AI off, a face-privacy gallery works without a selfie: the event PIN sees and downloads everything', async () => {
    const pub = await call(`/v1/public/events/${RIYA}`, { ai: false })
    expect(pub.json.settings).toMatchObject({ faceSearch: false, facePrivacy: false, downloads: 'all' })

    const pin = await call(`/v1/public/events/${RIYA}/pin`, { body: { pin: '5211' }, ai: false })
    expect(pin.json.seeAll).toBe(true)
    const photos = await call(`/v1/public/events/${RIYA}/photos?limit=3`, { token: pin.json.token, ai: false })
    expect(photos.status).toBe(200)
    expect(photos.json.items.length).toBeGreaterThan(0)

    // With AI on, the same PIN keeps face privacy.
    const on = await call(`/v1/public/events/${RIYA}/pin`, { body: { pin: '5211' } })
    expect(on.json.seeAll).toBe(false)
  })

  it('with AI off, selfie search answers that it is turned off', async () => {
    const pin = await call(`/v1/public/events/${RIYA}/pin`, { body: { pin: '5211' }, ai: false })
    const r = await call(`/v1/public/events/${RIYA}/faces/search`, { token: pin.json.token, body: { key: 'selfies/test.jpg' }, ai: false })
    expect(r.status).toBe(403)
    expect(r.json.code).toBe('face_search_disabled')
  })
})
