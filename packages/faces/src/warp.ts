import type { Affine2x3 } from './align.ts'

/** Raw interleaved pixel buffer, HWC (one `channels`-length pixel per (x,y), row-major). */
export interface RawImage { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number }

function invert(m: Affine2x3): Affine2x3 {
  const det = m.a * m.e - m.b * m.d
  if (Math.abs(det) < 1e-12) throw new Error('warpAffine: singular transform')
  const ia = m.e / det, ib = -m.b / det, id = -m.d / det, ie = m.a / det
  return { a: ia, b: ib, c: -(ia * m.c + ib * m.f), d: id, e: ie, f: -(id * m.c + ie * m.f) }
}

/**
 * Resamples `src` into a `width`×`height` output using `forward` (an output-space point → it's where that
 * point sits in the aligned/template space, e.g. the transform from `similarityTransform5pt`): each OUTPUT
 * pixel samples the SOURCE location that maps forward onto it — found here by inverting `forward` once and
 * applying it per output pixel, bilinear-interpolated. Pixels that fall outside `src` are filled with 0 (black).
 *
 * This exists instead of relying on a native image library's own affine warp (e.g. sharp's `affine()`, whose
 * `idx/idy/odx/ody` offset convention is under-documented and easy to get backwards — ask why before "fixing"
 * this to use one instead) or a browser Canvas 2D warp, so the exact same, easily-unit-tested code runs
 * identically in the Node processor and in the browser's on-device selfie matching.
 */
export function warpAffine(src: RawImage, forward: Affine2x3, width: number, height: number): RawImage {
  const inv = invert(forward)
  const { channels } = src
  const out = new Uint8ClampedArray(width * height * channels)
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const sx = inv.a * ox + inv.b * oy + inv.c
      const sy = inv.d * ox + inv.e * oy + inv.f
      const oi = (oy * width + ox) * channels
      if (sx < 0 || sy < 0 || sx > src.width - 1 || sy > src.height - 1) continue // leave as 0 (black)
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, src.width - 1), y1 = Math.min(y0 + 1, src.height - 1)
      const fx = sx - x0, fy = sy - y0
      for (let c = 0; c < channels; c++) {
        const p00 = src.data[(y0 * src.width + x0) * channels + c]
        const p10 = src.data[(y0 * src.width + x1) * channels + c]
        const p01 = src.data[(y1 * src.width + x0) * channels + c]
        const p11 = src.data[(y1 * src.width + x1) * channels + c]
        const top = p00 + (p10 - p00) * fx
        const bot = p01 + (p11 - p01) * fx
        out[oi + c] = top + (bot - top) * fy
      }
    }
  }
  return { data: out, width, height, channels }
}
