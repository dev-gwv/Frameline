/**
 * A photo's pixel size read from the start of its file (JPEG, PNG, WebP, GIF), without decoding it.
 * The first 128 KB is enough for almost every camera JPEG (the size comes after the EXIF block).
 * Returns null for other formats (HEIC) or when the header isn't in `bytes`.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = bytes
  const u16be = (i: number) => (b[i] << 8) | b[i + 1]
  const u16le = (i: number) => b[i] | (b[i + 1] << 8)
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
  const ok = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null)
  if (b.length < 30) return null

  // PNG: signature, then the IHDR chunk with width and height.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ok(u32be(16), u32be(20))

  // GIF87a / GIF89a: logical screen size.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ok(u16le(6), u16le(8))

  // WebP: RIFF....WEBP then VP8 (lossy), VP8L (lossless) or VP8X (extended).
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (kind === 'VP8 ') return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff)
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    }
    if (kind === 'VP8X') return ok(u24le(24) + 1, u24le(27) + 1)
    return null
  }

  // JPEG: walk the markers to the first start-of-frame (SOF0–SOF15, not DHT/JPG/DAC).
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker === 0xff) { i++; continue }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(u16be(i + 7), u16be(i + 5))
      if (marker === 0xd9 || marker === 0xda) return null
      i += 2 + u16be(i + 2)
    }
  }
  return null
}
