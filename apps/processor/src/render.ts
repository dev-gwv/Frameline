import sharp from 'sharp'

/**
 * Download renditions made on request: upright, turned by the studio's rotation, resized to the long edge and,
 * when the gallery watermarks downloads, with the watermark burned in. Same layout as the gallery's own
 * canvas rendering (apps/gallery/src/lib/download.ts), so a file looks the same whichever side made it.
 */
export interface WatermarkSpec {
  /** Already resolved by the API (logo mode → studio name). */
  text: string
  subtitle?: string
  position: 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'
  size: 'subtle' | 'normal' | 'bold'
  /** 0–100. */
  opacity: number
  /** % of the short side (default 3). */
  edgeOffset?: number
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function watermarkSvg(W: number, H: number, wm: WatermarkSpec): Buffer {
  const short = Math.min(W, H)
  const base = short * (wm.size === 'subtle' ? 0.028 : wm.size === 'bold' ? 0.055 : 0.04)
  const pad = short * ((wm.edgeOffset ?? 3) / 100 || 0.04)
  const bottom = wm.position[0] === 'b'
  const h = wm.position[1]
  const anchor = h === 'r' ? 'end' : h === 'c' ? 'middle' : 'start'
  const x = h === 'r' ? W - pad : h === 'c' ? W / 2 : pad
  const sub = wm.subtitle?.trim()
  const subSize = base * 0.42
  const y1 = bottom ? H - pad - (sub ? subSize * 1.5 : 0) : pad + base * 0.8
  const y2 = bottom ? H - pad : pad + base * 1.25 + subSize * 0.8
  const alpha = Math.min(1, Math.max(0.1, wm.opacity / 100))
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><filter id="s" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="${(base * 0.18).toFixed(1)}" flood-color="#000" flood-opacity="0.35"/></filter></defs>
  <g fill="#FFFFFF" fill-opacity="${alpha}" text-anchor="${anchor}" filter="url(#s)">
    <text x="${x.toFixed(1)}" y="${y1.toFixed(1)}" font-family="Fraunces, Georgia, 'DejaVu Serif', serif" font-weight="600" font-size="${base.toFixed(1)}">${esc(wm.text)}</text>
    ${sub ? `<text x="${x.toFixed(1)}" y="${y2.toFixed(1)}" font-family="Manrope, 'DejaVu Sans', sans-serif" font-weight="500" font-size="${subSize.toFixed(1)}" letter-spacing="${(subSize * 0.08).toFixed(1)}">${esc(sub.toUpperCase())}</text>` : ''}
  </g>
</svg>`)
}

export async function renderDownload(original: Buffer, opts: { size: number; rotation?: number; watermark?: WatermarkSpec }): Promise<Buffer> {
  // EXIF orientation first, then the studio's own turn (multiples of 90).
  let img = sharp(await sharp(original).rotate().toBuffer())
  const turn = (((opts.rotation ?? 0) % 360) + 360) % 360
  if (turn) img = sharp(await img.rotate(turn).toBuffer())
  const resized = await img.resize(opts.size, opts.size, { fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true })
  let out = sharp(resized.data)
  if (opts.watermark?.text.trim()) out = out.composite([{ input: watermarkSvg(resized.info.width, resized.info.height, opts.watermark), top: 0, left: 0 }])
  return out.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
}
