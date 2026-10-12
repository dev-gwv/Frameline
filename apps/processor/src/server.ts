import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import sharp from 'sharp'
import { z } from 'zod'
import type { ProcessorEnv } from './env.ts'
import { r2Client } from './r2.ts'
import { detectAndEmbed } from './faces.ts'

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

/** Long-edge sizes of the download renditions (web size, and high resolution when the gallery allows it). */
const RENDITION_SIZES = [2048, 3072] as const

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function buildServer(env: ProcessorEnv) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/process', async (c) => {
    const auth = c.req.header('authorization')
    const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token || !safeEqual(token, env.authToken)) return c.json({ error: 'unauthorized' }, 401)

    const body = ProcessJob.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_job', issues: body.error.issues }, 400)
    const job = body.data

    if (!job.key) return c.json({ error: 'no_key', detail: 'Job has no R2 key to process' }, 422)

    try {
      const r2 = r2Client(env.r2)
      const bytes = await r2.getObject(job.bucket, job.key)
      const buffer = Buffer.from(bytes)
      // Turn the photo upright first: cameras store portrait shots sideways plus an EXIF orientation tag, and
      // faces lying on their side aren't found. 422 when the file can't be decoded at all (a video, HEIC this
      // build can't read, a corrupt upload): apps/api then marks the photo `failed` instead of retrying.
      let upright: Buffer
      try {
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
        const dir = job.key.replace(/\/[^/]+$/, '')
        for (const size of RENDITION_SIZES) {
          const jpeg = await sharp(upright).resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
          await r2.putObject(job.bucket, `${dir}/renditions/${size}.jpg`, jpeg, 'image/jpeg')
        }
      }
      return c.json({
        width: result.width,
        height: result.height,
        sizeBytes: buffer.byteLength,
        faces: result.faces.map((f) => ({ box: f.box, embedding: f.embedding })),
      })
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'process failed', photoId: job.photoId, error: String(err) }))
      return c.json({ error: 'process_failed', detail: String(err) }, 502)
    }
  })

  return app
}
