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
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t create images. Try another browser.')

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

  if (opts.watermark) {
    const size = Math.max(14, Math.round(Math.min(w, h) * 0.035))
    ctx.font = `600 ${size}px Fraunces, Georgia, serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = size / 4
    ctx.fillText(opts.watermark, w - size, h - size * 0.7)
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t create the file. The photo may be too large for this device.'))), 'image/jpeg', 0.92))
}
