import { describe, expect, it } from 'vitest'
import { imageSize } from '@frameline/shared'
import { call, tokenFor } from './helpers'

/** Things the studio app edits: its profile (logo), events (city, last day, type) and the person's own name. */
describe('editing', () => {
  it('saves a studio profile without a logo, and removes a logo', async () => {
    const token = await tokenFor('owner')
    // The profile form always sends logoUrl; "" means no logo and must not fail the whole save.
    const plain = await call('/v1/studio', { token, method: 'PATCH', body: { city: '', phone: '', logoUrl: '' } })
    expect(plain.status).toBe(200)
    expect(plain.json.logoUrl).toBeUndefined()
    const withLogo = await call('/v1/studio', { token, method: 'PATCH', body: { logoUrl: 'https://example.com/logo.png' } })
    expect(withLogo.json.logoUrl).toBe('https://example.com/logo.png')
    const removed = await call('/v1/studio', { token, method: 'PATCH', body: { logoUrl: '' } })
    expect(removed.status).toBe(200)
    expect(removed.json.logoUrl).toBeUndefined()
  })

  it('edits an event’s city, type and last day, and clears the last day', async () => {
    const token = await tokenFor('owner')
    const made = await call('/v1/events', { token, body: { name: 'Edit me', date: '2026-12-10', city: 'Pune', type: 'wedding', preset: 'private-family' } })
    const id = made.json.id
    const set = await call(`/v1/events/${id}`, { token, method: 'PATCH', body: { city: 'Udaipur', type: 'corporate', endDate: '2026-12-12' } })
    expect(set.status).toBe(200)
    expect(set.json).toMatchObject({ city: 'Udaipur', type: 'corporate' })
    expect(set.json.endDate.slice(0, 10)).toBe('2026-12-12')
    const cleared = await call(`/v1/events/${id}`, { token, method: 'PATCH', body: { endDate: '' } })
    expect(cleared.status).toBe(200)
    expect(cleared.json.endDate).toBeUndefined()
  })

  it('changes your own name', async () => {
    const token = await tokenFor('editor')
    const r = await call('/v1/me', { token, method: 'PATCH', body: { name: 'Meera I.' } })
    expect(r.status).toBe(200)
    expect(r.json.name).toBe('Meera I.')
    expect((await call('/v1/me', { token })).json.user.name).toBe('Meera I.')
    await call('/v1/me', { token, method: 'PATCH', body: { name: 'Meera Iyer' } })
  })
})

describe('imageSize', () => {
  const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(40).fill(0)])
  it('reads PNG, GIF and JPEG headers', () => {
    // PNG: signature + IHDR (1440 × 900).
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x05, 0xa0, 0, 0, 0x03, 0x84)
    expect(imageSize(png)).toEqual({ width: 1440, height: 900 })
    // GIF89a 320 × 200.
    expect(imageSize(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xc8, 0x00))).toEqual({ width: 320, height: 200 })
    // JPEG: SOI, an APP0 block, then SOF0 with 4000 tall × 6000 wide.
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0f, 0xa0, 0x17, 0x70, 0x03)
    expect(imageSize(jpeg)).toEqual({ width: 6000, height: 4000 })
  })
  it('gives up on what it can’t read', () => {
    expect(imageSize(bytes(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70))).toBeNull() // HEIC
    expect(imageSize(new Uint8Array(4))).toBeNull()
  })
})
