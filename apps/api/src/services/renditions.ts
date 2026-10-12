import { eq } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'

type EventRow = typeof schema.events.$inferSelect
type PhotoRow = typeof schema.photos.$inferSelect

/** What the processor burns in: the gallery's watermark rule, with logo mode resolved to the studio's name. */
export interface WatermarkSpec {
  text: string
  subtitle?: string
  position: 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'
  size: 'subtle' | 'normal' | 'bold'
  opacity: number
  edgeOffset?: number
}

/**
 * The watermark a guest's download of this size must carry, or null for none. Mirrors the gallery
 * (DownloadSheet's applyWatermark + fallbackWatermark): on unless the event turns it off; a studio with no
 * saved watermark gets its name, bottom right.
 */
export async function watermarkFor(env: Env, e: EventRow, size: '2048' | '3072'): Promise<WatermarkSpec | null> {
  if (e.settings.watermarkOff) return null
  const db = getDb(env.DB)
  const [wm] = await db.select({ s: schema.watermarks.settings }).from(schema.watermarks).where(eq(schema.watermarks.studioId, e.studioId)).limit(1)
  const [st] = await db.select({ name: schema.studios.name }).from(schema.studios).where(eq(schema.studios.id, e.studioId)).limit(1)
  const name = st?.name ?? 'Studio'
  if (!wm) return { text: name, position: 'br', size: 'normal', opacity: 70, edgeOffset: 3 }
  const s = wm.s
  if (!(size === '3072' ? s.applyTo.originals : s.applyTo.downloads)) return null
  return {
    text: s.mode === 'logo' ? name : s.text || name, subtitle: s.subtitle || undefined,
    position: s.position, size: s.size, opacity: s.opacity, edgeOffset: s.edgeOffset,
  }
}

/**
 * A download-size file for one photo, or null when there is none to give (the gallery then renders it itself).
 *   - Plain and unrotated: the rendition the processor wrote at upload (…/renditions/<size>.jpg).
 *   - Watermarked or turned by the studio: rendered now by the processor, so it is always current.
 *   - No processor: null.
 */
export async function downloadFile(env: Env, p: PhotoRow, size: '2048' | '3072', watermark: WatermarkSpec | null): Promise<ReadableStream<Uint8Array> | null> {
  if (!p.r2Key || !env.PROCESSOR_URL) return null
  if (!watermark && !p.rotation) {
    const stored = await env.MEDIA.get(p.r2Key.replace(/\/[^/]+$/, `/renditions/${size}.jpg`))
    if (stored) return stored.body
  }
  const res = await fetch(`${env.PROCESSOR_URL.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.PROCESSOR_TOKEN ? { Authorization: `Bearer ${env.PROCESSOR_TOKEN}` } : {}) },
    body: JSON.stringify({ bucket: env.R2_BUCKET_NAME, key: p.r2Key, size: Number(size), rotation: p.rotation || undefined, watermark: watermark ?? undefined }),
  }).catch(() => null)
  return res?.ok && res.body ? res.body : null
}
