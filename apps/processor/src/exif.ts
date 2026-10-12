/**
 * Reads the few EXIF fields Frameline shows (capture time, camera, lens, exposure) from the raw EXIF block that
 * `sharp(...).metadata().exif` returns. A small TIFF reader instead of a dependency: IFD0 → Exif sub-IFD, a
 * handful of tags, nothing written. Anything malformed yields `{}`; EXIF is never worth failing a photo over.
 */

export interface ExifSummary {
  capturedAt?: string
  camera?: string
  lens?: string
  exposure?: string
}

const TAG = {
  make: 0x010f, model: 0x0110, exifIfd: 0x8769,
  exposureTime: 0x829a, fNumber: 0x829d, iso: 0x8827, dateTimeOriginal: 0x9003, offsetTimeOriginal: 0x9011,
  focalLength: 0x920a, lensModel: 0xa434,
} as const

type Value = string | number | undefined

export function readExif(raw: Buffer | undefined): ExifSummary {
  try {
    if (!raw || raw.length < 14) return {}
    // sharp hands back the APP1 payload: "Exif\0\0" then the TIFF header.
    const tiff = raw.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? raw.subarray(6) : raw
    const le = tiff.toString('latin1', 0, 2) === 'II'
    if (!le && tiff.toString('latin1', 0, 2) !== 'MM') return {}
    const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o))
    const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o))

    const readIfd = (offset: number): Map<number, Value> => {
      const out = new Map<number, Value>()
      if (offset <= 0 || offset + 2 > tiff.length) return out
      const n = u16(offset)
      for (let i = 0; i < n; i++) {
        const e = offset + 2 + i * 12
        if (e + 12 > tiff.length) break
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4)
        const sizes: Record<number, number> = { 2: 1, 3: 2, 4: 4, 5: 8, 10: 8 }
        const size = (sizes[type] ?? 0) * count
        if (!size) continue
        const at = size <= 4 ? e + 8 : u32(e + 8)
        if (at + size > tiff.length) continue
        if (type === 2) out.set(tag, tiff.toString('latin1', at, at + count).replace(/\0.*$/s, '').trim())
        else if (type === 3) out.set(tag, u16(at))
        else if (type === 4) out.set(tag, u32(at))
        else if (type === 5 || type === 10) { const d = u32(at + 4); out.set(tag, d ? u32(at) / d : undefined) }
      }
      return out
    }

    const ifd0 = readIfd(u32(4))
    const sub = typeof ifd0.get(TAG.exifIfd) === 'number' ? readIfd(ifd0.get(TAG.exifIfd) as number) : new Map<number, Value>()
    const str = (m: Map<number, Value>, t: number) => (typeof m.get(t) === 'string' && m.get(t) ? (m.get(t) as string) : undefined)
    const num = (m: Map<number, Value>, t: number) => (typeof m.get(t) === 'number' && Number.isFinite(m.get(t)) ? (m.get(t) as number) : undefined)

    const out: ExifSummary = {}
    const make = str(ifd0, TAG.make), model = str(ifd0, TAG.model)
    if (model) out.camera = make && !model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]) ? `${make} ${model}` : model
    const lens = str(sub, TAG.lensModel)
    if (lens) out.lens = lens

    // "2026:10:12 18:04:31" (+ optional offset "+05:30"); without an offset the camera clock is taken as IST.
    const when = str(sub, TAG.dateTimeOriginal)
    const m = when?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (m && m[1] !== '0000') {
      const offset = str(sub, TAG.offsetTimeOriginal)?.match(/^[+-]\d{2}:\d{2}$/)?.[0] ?? '+05:30'
      const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`)
      if (!Number.isNaN(d.getTime())) out.capturedAt = d.toISOString()
    }

    const t = num(sub, TAG.exposureTime), f = num(sub, TAG.fNumber), iso = num(sub, TAG.iso), fl = num(sub, TAG.focalLength)
    const parts = [
      fl ? `${Math.round(fl)}mm` : undefined,
      f ? `f/${Math.round(f * 10) / 10}` : undefined,
      t ? (t >= 1 ? `${Math.round(t * 10) / 10}s` : `1/${Math.round(1 / t)}s`) : undefined,
      iso ? `ISO ${iso}` : undefined,
    ].filter(Boolean)
    if (parts.length) out.exposure = parts.join(' · ')
    return out
  } catch {
    return {}
  }
}
