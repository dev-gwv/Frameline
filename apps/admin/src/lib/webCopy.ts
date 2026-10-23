import { WEB_COPY_PX } from '@frameline/shared'

/**
 * The 2048 px JPEG a studio upload sends with each photo (PUT /v1/photos/:id/web), so guests load about a tenth of
 * the original's size without the image processor. Turned upright from the photo's EXIF orientation, like the
 * processor's own rendition. Null when the browser can't read the file (HEIC in most browsers): that photo then
 * shows its original.
 */
export async function makeWebCopy(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { return null }
  try {
    const scale = Math.min(1, WEB_COPY_PX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, w, h)
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    }
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}
