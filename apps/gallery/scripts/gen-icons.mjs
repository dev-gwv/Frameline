// Generates the PWA PNG icons (no dependencies): node scripts/gen-icons.mjs
// Draws the Frameline mark — a gold frame on the dark "side" colour — with light anti-aliasing.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

const BG = [0x15, 0x12, 0x0e]
const GOLD = [[0xf2, 0xd3, 0x8a], [0xdd, 0xa8, 0x48], [0xb3, 0x7c, 0x22]]

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const gold = (t) => (t < 0.46 ? mix(GOLD[0], GOLD[1], t / 0.46) : mix(GOLD[1], GOLD[2], (t - 0.46) / 0.54))

/** Signed distance to a rounded rectangle centred at (cx, cy). */
function sdRound(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** `scale` shrinks the mark (maskable icons keep it inside the 80% safe zone). `corner` rounds the tile. */
function icon(size, { scale = 1, corner = 0.22 } = {}) {
  const s = size / 32
  return png(size, (px, py) => {
    const x = px + 0.5, y = py + 0.5
    const c = size / 2
    // tile
    const tileD = corner ? sdRound(x, y, c, c, c, c, size * corner) : -1
    const tileA = Math.min(1, Math.max(0, 0.5 - tileD))
    if (tileA <= 0) return [0, 0, 0, 0]
    // frame: outer 16x12 r2, inner 10x7 r1 (in a 32 grid), centred
    const outer = sdRound(x, y, c, c, 8 * s * scale, 6 * s * scale, 2 * s * scale)
    const inner = sdRound(x, y, c, c + 0 * s, 5 * s * scale, 3.5 * s * scale, 1 * s * scale)
    const inOuter = Math.min(1, Math.max(0, 0.5 - outer))
    const inInner = Math.min(1, Math.max(0, 0.5 - inner))
    const goldA = inOuter * (1 - inInner)
    const t = Math.min(1, Math.max(0, (px + py) / (2 * size) * 1.6 - 0.3))
    const col = mix(BG, gold(t), goldA)
    return [...col, Math.round(tileA * 255)]
  })
}

writeFileSync(join(out, 'icon-192.png'), icon(192))
writeFileSync(join(out, 'icon-512.png'), icon(512))
writeFileSync(join(out, 'icon-maskable-512.png'), icon(512, { scale: 0.8, corner: 0 }))
writeFileSync(join(out, 'apple-touch-icon.png'), icon(180, { corner: 0 }))
console.log('Icons written to', out)
