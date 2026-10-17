import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import sharp from 'sharp'
import { z } from 'zod'
import type { ProcessorEnv } from './env.ts'
import { r2Client } from './r2.ts'
import { detectAndEmbed } from './faces.ts'
import { readExif, type ExifSummary } from './exif.ts'
import { renderDownload } from './render.ts'
import { Limiter } from './limiter.ts'

/**
 * Matches apps/api's `HttpProcessor`/`ProcessResult` contract exactly (apps/api/src/services/processor.ts) —
 * read that file before changing this one, since the two must agree on the wire shape.
 */
const ProcessJob = z.object({
  kind: z.literal('process-photo'),
  photoId: z.string(),
  eventId: z.string(),
  studioId: z.string(),
  key: z.string().nullable(),
  quality: z.enum(['web', 'original']),
  enhance: z.object({ preset: z.string().optional(), prompt: z.string().optional() }).optional(),
  reindex: z.boolean().optional(),
  bucket: z.string(),
})

const RenderJob = z.object({
  bucket: z.string(),
  key: z.string(),
  size: z.union([z.literal(2048), z.literal(3072)]),
  rotation: z.number().int().optional(),
  watermark: z.object({
    text: z.string().max(200), subtitle: z.string().max(200).optional(),
    position: z.enum(['tl', 'tc', 'tr', 'bl', 'bc', 'br']), size: z.enum(['subtle', 'normal', 'bold']),
    opacity: z.number().min(0).max(100), edgeOffset: z.number().min(0).max(30).optional(),
  }).optional(),
})

/** Long-edge sizes of the download renditions (web size, and high resolution when the gallery allows it). */
const RENDITION_SIZES = [2048, 3072] as const

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function buildServer(env: ProcessorEnv) {
  const app = new Hono()
  // Photos worked on at once (2 = the container's 2 cores), and how many may wait for a turn (limiter.ts).
  const limiter = new Limiter(env.maxJobs, env.maxWaiting)
  const busy = (c: { json: (b: unknown, s: 503, h: Record<string, string>) => Response }) =>
    c.json({ error: 'busy', detail: 'The processor is at capacity; try again shortly.' }, 503, { 'Retry-After': '30' })

  app.get('/health', (c) => c.json({ ok: true, ...limiter.stats }))

  // A download rendition made now: rotation and watermark as they are today (apps/api streams it to the guest).
  app.post('/render', async (c) => {
    const auth = c.req.header('authorization')
    const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token || !safeEqual(token, env.authToken)) return c.json({ error: 'unauthorized' }, 401)
    const body = RenderJob.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_job', issues: body.error.issues }, 400)
    const job = body.data
    const out = await limiter.run(async () => { try {
      const original = Buffer.from(await r2Client(env.r2).getObject(job.bucket, job.key))
      const jpeg = await renderDownload(original, { size: job.size, rotation: job.rotation, watermark: job.watermark })
      return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.byteLength) } })
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'render failed', key: job.key, error: String(err) }))
      return c.json({ error: 'render_failed', detail: String(err) }, 502)
    } })
    return out ?? busy(c)
  })

  app.post('/process', async (c) => {
    const auth = c.req.header('authorization')
    const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token || !safeEqual(token, env.authToken)) return c.json({ error: 'unauthorized' }, 401)

    const body = ProcessJob.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_job', issues: body.error.issues }, 400)
    const job = body.data

    if (!job.key) return c.json({ error: 'no_key', detail: 'Job has no R2 key to process' }, 422)
    const key = job.key

    const out = await limiter.run(async () => { try {
      const r2 = r2Client(env.r2)
      const bytes = await r2.getObject(job.bucket, key)
      const buffer = Buffer.from(bytes)
      // Turn the photo upright first: cameras store portrait shots sideways plus an EXIF orientation tag, and
      // faces lying on their side aren't found. 422 when the file can't be decoded at all (a video, HEIC this
      // build can't read, a corrupt upload): apps/api then marks the photo `failed` instead of retrying.
      let upright: Buffer
      let exif: ExifSummary = {}
      try {
        exif = readExif((await sharp(buffer).metadata()).exif)
        upright = await sharp(buffer).rotate().toBuffer()
      } catch (err) {
        return c.json({ error: 'unsupported_file', detail: String(err) }, 422)
      }
      const result = await detectAndEmbed(upright)
      // Download renditions next to the original (…/<photoId>/renditions/2048.jpg and 3072.jpg), which
      // GET /v1/public/photos/:id/download serves. Unwatermarked: the API serves them only when no watermark
      // applies, otherwise the gallery renders the download itself with the watermark burned in.
      // Watermark burn-in and AI enhance are still not built; `previewUrl` stays unset, so the gallery keeps the original.
      if (!job.reindex) {
        const dir = key.replace(/\/[^/]+$/, '')
        for (const size of RENDITION_SIZES) {
          const jpeg = await sharp(upright).resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
          await r2.putObject(job.bucket, `${dir}/renditions/${size}.jpg`, jpeg, 'image/jpeg')
        }
      }
      return c.json({
        width: result.width,
        height: result.height,
        sizeBytes: buffer.byteLength,
        ...(exif.capturedAt ? { capturedAt: exif.capturedAt } : {}),
        // Only fields the file has: applyResult() merges these over what the upload already recorded.
        exif: Object.fromEntries(Object.entries({ camera: exif.camera, lens: exif.lens, exposure: exif.exposure }).filter(([, v]) => v)),
        faces: result.faces.map((f) => ({ box: f.box, embedding: f.embedding })),
      })
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'process failed', photoId: job.photoId, error: String(err) }))
      return c.json({ error: 'process_failed', detail: String(err) }, 502)
    } })
    return out ?? busy(c)
  })

  return app
}
