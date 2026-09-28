import { watermarkAnchor, type Photo, type PublicEvent, type PublicStudio, type WatermarkSettings } from '@frameline/shared'

/**
 * Downloads: first the API's rendition (api.getPhotoDownloadUrl — watermarked server-side, counted by the API).
 * When there is none, the photo is rendered to a canvas (its tone gradient, or its uploaded image), watermarked
 * with the gallery's watermark settings, saved as a JPEG and counted with api.recordDownload.
 */
export interface RenderOptions {
  watermark?: WatermarkSettings
  applyWatermark: boolean
  original: boolean
  studio: PublicStudio
  /** Rendition URL from the API, or null to render locally. */
  getUrl?: (photo: Photo) => Promise<string | null>
  /** Called for photos rendered locally (the API counts its own renditions). */
  onLocal?: (photo: Photo) => void
}

/** Saves one photo: the API rendition when there is one, else the canvas render. */
export async function savePhoto(photo: Photo, event: PublicEvent, opts: RenderOptions) {
  const name = downloadName(opts.studio, event, photo, opts.original)
  const url = opts.getUrl ? await opts.getUrl(photo).catch(() => null) : null
  if (url) {
    try {
      const res = await fetch(url)
      if (res.ok) { saveBlob(await res.blob(), name); return }
    } catch { /* fall back to the local render */ }
  }
  saveBlob(await renderPhoto(photo, opts), name)
  opts.onLocal?.(photo)
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
  const rotation = photo.rotation ?? 0
  const sideways = rotation === 90 || rotation === 270
  const w0 = photo.exif?.width || 6000, h0 = photo.exif?.height || 4000
  const scale = long / Math.max(w0, h0)
  // The photo is drawn in its own orientation (pw × ph), then turned by Photo.rotation onto a W × H canvas.
  const pw = Math.round(w0 * scale), ph = Math.round(h0 * scale)
  const W = sideways ? ph : pw, H = sideways ? pw : ph
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser')

  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.translate(-pw / 2, -ph / 2)
  let drewImage = false
  if (photo.url) {
    try {
      const img = await loadImage(photo.url)
      const r = Math.max(pw / img.width, ph / img.height)
      const dw = img.width * r, dh = img.height * r
      ctx.drawImage(img, (pw - dw) / 2, (ph - dh) / 2, dw, dh)
      drewImage = true
    } catch { /* fall back to the tone */ }
  }
  if (!drewImage) {
    // Same geometry as CSS linear-gradient(<angle>deg, a, b 55%, c)
    const rad = (photo.tone.angle * Math.PI) / 180
    const dx = Math.sin(rad), dy = -Math.cos(rad)
    const len = Math.abs(pw * dx) + Math.abs(ph * dy)
    const cx = pw / 2, cy = ph / 2
    const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2)
    g.addColorStop(0, photo.tone.stops[0]); g.addColorStop(0.55, photo.tone.stops[1]); g.addColorStop(1, photo.tone.stops[2])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, pw, ph)
    const v = ctx.createRadialGradient(pw / 2, ph * 0.35, Math.min(pw, ph) * 0.25, pw / 2, ph * 0.35, Math.max(pw, ph) * 0.8)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, pw, ph)
  }
  ctx.restore()

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
    // edgeOffset is % of the short side (default 3).
    const pad = Math.min(W, H) * ((wm.edgeOffset ?? 3) / 100 || 0.04)
    const anchor = watermarkAnchor(wm.position)
    const bottom = anchor.y === 'bottom'
    ctx.textAlign = anchor.x
    ctx.textBaseline = bottom ? 'alphabetic' : 'top'
    const x = anchor.x === 'right' ? W - pad : anchor.x === 'center' ? W / 2 : pad
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
    await savePhoto(p, event, opts)
    done++
    onProgress(done)
    if (photos.length > 1) await new Promise((r) => setTimeout(r, 350))
  }
  return done
}
