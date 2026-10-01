import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
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
      // Face recognition milestone: detect + embed only. Renditions/watermark/enhance are a later pass —
      // `previewUrl` is omitted, which tells apps/api's applyResult() to keep the photo's existing url as-is.
      const result = await detectAndEmbed(buffer)
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
