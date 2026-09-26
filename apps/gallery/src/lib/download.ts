import type { Photo, PublicEvent, PublicStudio, WatermarkSettings } from '@frameline/shared'

/**
 * Real downloads without a backend: each photo is rendered to a canvas (its tone gradient, or its uploaded
 * image when one exists), watermarked with the studio's watermark settings, and saved as a JPEG.
 * TODO(api): swap for signed R2 URLs of the web/original rendition (watermarked server-side); downloads are
 * counted with api.recordDownload by the callers.
 */
export interface RenderOptions {
  watermark?: WatermarkSettings
  applyWatermark: boolean
  original: boolean
  studio: PublicStudio
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Image failed to load'))
  img.src = src
})

async function ensureFont(family: string) {
  try { await document.fonts?.load(`600 48px "${family}"`) } catch { /* fall back to serif */ }
}

export async function renderPhoto(photo: Photo, opts: RenderOptions): Promise<Blob> {
  const long = opts.original ? 3072 : 2048
  const w0 = photo.exif?.width || 6000, h0 = photo.exif?.height || 4000
  const scale = long / Math.max(w0, h0)
  const W = Math.round(w0 * scale), H = Math.round(h0 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser')

  let drewImage = false
  if (photo.url) {
    try {
      const img = await loadImage(photo.url)
      const r = Math.max(W / img.width, H / img.height)
      const dw = img.width * r, dh = img.height * r
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
      drewImage = true
    } catch { /* fall back to the tone */ }
  }
  if (!drewImage) {
    // Same geometry as CSS linear-gradient(<angle>deg, a, b 55%, c)
    const rad = (photo.tone.angle * Math.PI) / 180
    const dx = Math.sin(rad), dy = -Math.cos(rad)
    const len = Math.abs(W * dx) + Math.abs(H * dy)
    const cx = W / 2, cy = H / 2
    const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2)
    g.addColorStop(0, photo.tone.stops[0]); g.addColorStop(0.55, photo.tone.stops[1]); g.addColorStop(1, photo.tone.stops[2])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    const v = ctx.createRadialGradient(W / 2, H * 0.35, Math.min(W, H) * 0.25, W / 2, H * 0.35, Math.max(W, H) * 0.8)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, H)
  }

  const wm = opts.watermark
  if (opts.applyWatermark && wm) {
    const text = wm.mode === 'logo' ? opts.studio.name : wm.text || opts.studio.name
    const base = Math.min(W, H) * (wm.size === 'subtle' ? 0.028 : wm.size === 'bold' ? 0.055 : 0.04)
    const font = wm.font || 'Fraunces'
    await ensureFont(font)
    ctx.save()
    ctx.globalAlpha = Math.min(1, Math.max(0.1, wm.opacity / 100))
    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = base * 0.35
    ctx.font = `600 ${base}px "${font}", Georgia, serif`
    const pad = Math.min(W, H) * 0.04
    const right = wm.position === 'tr' || wm.position === 'br'
    const bottom = wm.position === 'bl' || wm.position === 'br'
    ctx.textAlign = right ? 'right' : 'left'
    ctx.textBaseline = bottom ? 'alphabetic' : 'top'
    const x = right ? W - pad : pad
    const sub = wm.subtitle?.trim()
    const subSize = base * 0.42
    let y = bottom ? H - pad - (sub ? subSize * 1.5 : 0) : pad
    ctx.fillText(text, x, y)
    if (sub) {
      ctx.font = `500 ${subSize}px "Manrope", system-ui, sans-serif`
      y = bottom ? H - pad : pad + base * 1.25
      ctx.fillText(sub.toUpperCase(), x, y)
    }
    ctx.restore()
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/jpeg', 0.9))
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const downloadName = (studio: PublicStudio, event: PublicEvent, photo: Photo, original: boolean) =>
  `${studio.handle}-${event.shortId}-${photo.filename.replace(/\.[a-z0-9]+$/i, '')}${original ? '' : '-web'}.jpg`

/** Downloads photos one after another; reports progress and can be cancelled via the signal. */
export async function downloadPhotos(
  photos: Photo[], event: PublicEvent, opts: RenderOptions, onProgress: (done: number) => void, signal?: AbortSignal,
) {
  let done = 0
  for (const p of photos) {
    if (signal?.aborted) break
    const blob = await renderPhoto(p, opts)
    saveBlob(blob, downloadName(opts.studio, event, p, opts.original))
    done++
    onProgress(done)
    if (photos.length > 1) await new Promise((r) => setTimeout(r, 350))
  }
  return done
}
