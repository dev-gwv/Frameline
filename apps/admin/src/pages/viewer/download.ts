import type { Photo } from '@frameline/shared'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The photo file couldn’t be read.'))
    img.src = src
  })
}

/**
 * Renders a real JPEG for a photo: the uploaded file when this browser still has it,
 * otherwise the placeholder tone. The API will serve R2 renditions instead.
 */
export async function renderPhoto(photo: Photo, url: string | undefined, opts: { maxEdge?: number; watermark?: string }): Promise<Blob> {
  let W = photo.exif.width || 6000
  let H = photo.exif.height || 4000
  let img: HTMLImageElement | null = null
  if (url) {
    try { img = await loadImage(url); W = img.naturalWidth; H = img.naturalHeight } catch { img = null }
  }
  const k = opts.maxEdge ? Math.min(1, opts.maxEdge / Math.max(W, H)) : 1
  const w = Math.round(W * k), h = Math.round(H * k)
  // Photo.rotation (clockwise) turns the file the same way the viewer shows it.
  const rot = photo.rotation ?? 0
  const sideways = rot === 90 || rot === 270
  const canvas = document.createElement('canvas')
  canvas.width = sideways ? h : w
  canvas.height = sideways ? w : h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t create images. Try another browser.')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.translate(-w / 2, -h / 2)

  if (img) {
    ctx.drawImage(img, 0, 0, w, h)
  } else {
    // CSS linear-gradient angle → canvas gradient line through the centre.
    const a = (photo.tone.angle * Math.PI) / 180
    const dx = Math.sin(a), dy = -Math.cos(a)
    const len = Math.abs(w * dx) + Math.abs(h * dy)
    const g = ctx.createLinearGradient(w / 2 - (dx * len) / 2, h / 2 - (dy * len) / 2, w / 2 + (dx * len) / 2, h / 2 + (dy * len) / 2)
    g.addColorStop(0, photo.tone.stops[0])
    g.addColorStop(0.55, photo.tone.stops[1])
    g.addColorStop(1, photo.tone.stops[2])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    const v = ctx.createRadialGradient(w / 2, h * 0.35, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.3)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
  }

  // The watermark goes on the upright picture.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const cw = canvas.width, ch = canvas.height
  if (opts.watermark) {
    const size = Math.max(14, Math.round(Math.min(cw, ch) * 0.035))
    ctx.font = `600 ${size}px Fraunces, Georgia, serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = size / 4
    ctx.fillText(opts.watermark, cw - size, ch - size * 0.7)
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t create the file. The photo may be too large for this device.'))), 'image/jpeg', 0.92))
}

/**
 * Downloads one photo: the API's file first (web size = 2048 px), else the file this browser uploaded,
 * else a JPEG drawn from the placeholder tone. Returns the saved size in bytes.
 */
export async function downloadPhoto(
  api: { getPhotoDownloadUrl: (id: string, o?: { size?: 2048 | 3072 }) => Promise<string | null> },
  photo: Photo, kind: 'web' | 'original', opts: { url?: string; watermark?: string; save: (blob: Blob, name: string) => void },
): Promise<number> {
  const base = photo.filename.replace(/\.[^.]+$/, '')
  const signed = await api.getPhotoDownloadUrl(photo.id, kind === 'web' ? { size: 2048 } : {}).catch(() => null)
  const source = signed ?? (kind === 'original' ? opts.url : undefined)
  if (source) {
    const res = await fetch(source).catch(() => null)
    if (res?.ok) {
      const file = await res.blob()
      opts.save(file, kind === 'web' && signed ? `${base}_2048.jpg` : photo.filename)
      return file.size
    }
  }
  const blob = await renderPhoto(photo, opts.url, kind === 'web' ? { maxEdge: 2048, watermark: opts.watermark } : {})
  opts.save(blob, kind === 'web' ? `${base}_2048.jpg` : `${base}.jpg`)
  return blob.size
}
