import { SELF, env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchBySelfie } from '../src/services/faces'
import { BASE, freshIp, tokenFor } from './helpers'

/** Find my photos from the selfie image itself (POST …/faces/selfie): the processor finds the face; nothing is stored. */

const TESSERA = '3F9E21D' // open link, face search on
const jpeg = (n = 64) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff]); for (let i = 3; i < n; i++) b[i] = i % 251; return b }
const withProcessor = { ...env, PROCESSOR_URL: 'https://processor.test', PROCESSOR_TOKEN: 't' }

async function send(path: string, body: Uint8Array, contentType = 'image/jpeg', token?: string) {
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': contentType, 'cf-connecting-ip': freshIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  })
  return { status: res.status, json: await res.json<any>() }
}

afterEach(() => vi.unstubAllGlobals())

describe('selfie search', () => {
  it('takes the image as the body and answers like faces/search (deterministic without a processor)', async () => {
    const r = await send(`/v1/public/events/${TESSERA}/faces/selfie`, jpeg())
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ faceFound: true, photoIds: expect.any(Array) })
    expect((await send(`/v1/public/events/${TESSERA}/faces/selfie`, jpeg())).json).toEqual(r.json)
  })

  it('refuses a body that is not an image, or is empty', async () => {
    expect((await send(`/v1/public/events/${TESSERA}/faces/selfie`, jpeg(), 'text/plain')).status).toBe(415)
    expect((await send(`/v1/public/events/${TESSERA}/faces/selfie`, new Uint8Array(0))).status).toBe(422)
  })

  it('lets the studio match a face for a personal link the same way', async () => {
    const token = await tokenFor('editor')
    const r = await send('/v1/events/ev_riya/faces/selfie', jpeg(), 'image/jpeg', token)
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ faceFound: true })
    expect((await send('/v1/events/ev_riya/faces/selfie', jpeg())).status).toBe(401)
  })

  it('sends the image to the processor and uses the biggest face it finds', async () => {
    const calls: { url: string; auth: string | null; type: string | null; size: number }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers)
      calls.push({ url: String(input), auth: h.get('authorization'), type: h.get('content-type'), size: (init?.body as Uint8Array).byteLength })
      const emb = (v: number) => Array.from({ length: 128 }, () => v)
      return Response.json({ width: 800, height: 800, faces: [{ box: [0, 0, 10, 10], embedding: emb(0.1) }, { box: [100, 100, 400, 400], embedding: emb(0.2) }] })
    }))
    const r = await searchBySelfie(withProcessor as never, 'ev_riya', jpeg(500), 'image/jpeg')
    expect(calls).toEqual([{ url: 'https://processor.test/embed', auth: 'Bearer t', type: 'image/jpeg', size: 500 }])
    expect(r.faceFound).toBe(true)
  })

  it('says no face when the processor finds none or cannot read the image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ width: 800, height: 800, faces: [] })))
    expect(await searchBySelfie(withProcessor as never, 'ev_riya', jpeg(), 'image/jpeg')).toEqual({ faceFound: false, reason: 'no_face', personId: null, photoIds: [] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unsupported_file"}', { status: 422 })))
    expect((await searchBySelfie(withProcessor as never, 'ev_riya', jpeg(), 'image/jpeg')).faceFound).toBe(false)
  })

  it('tells the guest to try again in a minute while the processor is busy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"busy"}', { status: 503, headers: { 'retry-after': '30' } })))
    await expect(searchBySelfie(withProcessor as never, 'ev_riya', jpeg(), 'image/jpeg')).rejects.toMatchObject({ status: 503, code: 'face_search_busy' })
  })

  it('fails closed in production without a processor', async () => {
    await expect(searchBySelfie({ ...env, ENVIRONMENT: 'production' } as never, 'ev_riya', jpeg(), 'image/jpeg')).rejects.toMatchObject({ status: 503, code: 'face_search_unavailable' })
  })
})
