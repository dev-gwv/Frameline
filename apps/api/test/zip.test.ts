import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ZipWriter, crc32 } from '../src/lib/zip'
import { BASE } from './helpers'

/** The streamed ZIP behind "Email me a ZIP" (it used to be a JSON list of links). */

const enc = new TextEncoder()
const stream = (...parts: string[]) => new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close() } })

async function build(files: [string, string[]][]) {
  const chunks: Uint8Array[] = []
  const zip = new ZipWriter(async (c) => { chunks.push(c.slice()) })
  for (const [name, parts] of files) await zip.add(name, stream(...parts), new Date('2026-10-12T10:20:30Z'))
  await zip.finish()
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

/** Reads a ZIP back through its central directory, the way unzip tools do. */
function read(zip: Uint8Array) {
  const v = new DataView(zip.buffer)
  const eocd = zip.length - 22
  expect(v.getUint32(eocd, true)).toBe(0x06054b50)
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const files: { name: string; data: string; crc: number }[] = []
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const local = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen))
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const dataStart = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = zip.subarray(dataStart, dataStart + size)
    expect(crc32(data)).toBe(crc)
    files.push({ name, data: new TextDecoder().decode(data), crc })
    p += 46 + nameLen
  }
  return files
}

describe('streamed ZIP', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('hello'))).toBe(0x3610a686)
    // Chunked input gives the same CRC as one piece.
    expect(crc32(enc.encode('lo'), crc32(enc.encode('hel')))).toBe(0x3610a686)
  })

  it('writes files an unzip tool can read back, with unique safe names', async () => {
    const files = read(await build([
      ['IMG_1.jpg', ['abc', 'def']],
      ['IMG_1.jpg', ['second']],
      ['a/b\\c.jpg', ['x']],
      ['दुल्हन.jpg', ['y']],
    ]))
    expect(files.map((f) => f.name)).toEqual(['IMG_1.jpg', 'IMG_1 (2).jpg', 'a_b_c.jpg', 'दुल्हन.jpg'])
    expect(files.map((f) => f.data)).toEqual(['abcdef', 'second', 'x', 'y'])
  })

  it('streams a studio export of the photos’ files from the emailed link', async () => {
    const photos = await env.DB.prepare(`SELECT id FROM photos WHERE event_id = 'ev_riya' AND status = 'ready' AND deleted_at IS NULL LIMIT 2`).all<{ id: string }>()
    const ids = photos.results.map((p) => p.id)
    for (const [i, id] of ids.entries()) {
      const key = `studios/st_northlight/events/ev_riya/originals/${id}/zip-${i}.jpg`
      await env.MEDIA.put(key, `photo-${i}`)
      await env.DB.prepare('UPDATE photos SET r2_key = ?, filename = ? WHERE id = ?').bind(key, `zip-${i}.jpg`, id).run()
    }
    const zipId = `zip_test_${Date.now()}`
    await env.DB.prepare(`INSERT INTO zip_requests (id, studio_id, event_id, album_id, photo_ids, email, photo_count, status, requested_at, ready_at, url, guest_id, requested_by)
      VALUES (?, 'st_northlight', 'ev_riya', NULL, ?, 'me@example.com', 2, 'ready', ?, ?, NULL, NULL, 'studio')`)
      .bind(zipId, JSON.stringify(ids), new Date().toISOString(), new Date().toISOString()).run()
    const res = await SELF.fetch(`${BASE}/v1/public/zips/${zipId}/download`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    const files = read(new Uint8Array(await res.arrayBuffer()))
    expect(files.map((f) => f.data).sort()).toEqual(['photo-0', 'photo-1'])
  })

  it('knows when a plain ZIP is full', async () => {
    const zip = new ZipWriter(async () => {})
    expect(zip.fits(100)).toBe(true)
    expect(zip.fits(0xffffffff)).toBe(false)
  })
})
