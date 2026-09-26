import { createRoute, z } from '@hono/zod-openapi'
import { and, eq, max, sql } from 'drizzle-orm'
import { hash, tone } from '@frameline/shared'
import type { PhotoJob } from '../env'
import { getDb, schema } from '../db/client'
import type { UploadFileRecord } from '../db/schema'
import { photoOut } from '../db/mappers'
import { AppError, Conflict, NotFound, Unauthorized, ValidationFailed } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { signJwt, verifyJwt } from '../lib/jwt'
import { IdempotencyHeader, body, createRouter, json, problems, security } from '../lib/openapi'
import { membershipOf, requireStudio, userOf } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { Photo } from '../schemas/domain'
import { assertEventVisible } from '../services/access'
import { audit } from '../services/audit'
import { eventForMember, recountStatements } from '../services/events'
import { emit } from '../services/realtime'
import {
  PART_SIZE, PRESIGN_TTL_SEC, abortMultipart, completeMultipart, createMultipart, objectKey, presignPart, uploadMode, type UploadMode,
} from '../services/storage'

export const uploadRoutes = createRouter()

const MAX_FILE_BYTES = 200 * 1024 * 1024
const MAX_FILES = 100

const UploadFileInput = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  contentType: z.string().regex(/^(image|video)\/[\w.+-]+$/, 'Only image or video files').default('image/jpeg'),
  width: z.number().int().min(0).max(100_000).optional(),
  height: z.number().int().min(0).max(100_000).optional(),
  capturedAt: z.string().optional(),
  url: z.url().max(2048).optional().openapi({ description: 'Register an already-hosted file instead of uploading bytes.' }),
  external: z.boolean().optional().openapi({ description: 'Metadata only: no bytes will be uploaded (e.g. placeholder or `url` given).' }),
})

const CreateUploadBody = z.object({
  albumId: z.string().max(128),
  quality: z.enum(['web', 'original']).default('web'),
  files: z.array(UploadFileInput).min(1).max(MAX_FILES),
  source: z.enum(['web', 'camera', 'drive', 'guest', 'desktop']).optional().openapi({ description: 'Default: guest for the guest album, else web. Guest uploads don’t use plan capacity and go to review when the event asks for it.' }),
  uploadedBy: z.string().trim().min(1).max(120).optional(),
  watermark: z.boolean().optional().openapi({ description: 'Burn the studio watermark into the rendition.' }),
  fast: z.boolean().optional().openapi({ description: 'Skip heavier processing steps (live camera sync).' }),
}).openapi('CreateUpload')

const UploadSession = z.object({
  uploadId: z.string(),
  mode: z.enum(['s3', 'proxy']).openapi({ description: '`s3`: PUT parts to presigned R2 URLs. `proxy`: PUT parts to this API (dev).' }),
  partSize: z.number().int(),
  expiresAt: z.string(),
  files: z.array(z.object({
    photoId: z.string(), filename: z.string(), key: z.string().nullable(),
    parts: z.array(z.object({ partNumber: z.number().int(), url: z.string() })),
  })),
}).openapi('UploadSession')

uploadRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/uploads', tags: ['Uploads'], summary: 'Start a multipart upload',
  description: 'Reserves photo ids and returns one PUT URL per part (10 MiB each). PUT each part’s bytes, read the `ETag` response header, then call `…/complete`. Supports `Idempotency-Key`. Uploaders may only upload to events assigned to them.',
  security, middleware: [requireStudio('uploader', 'upload'), idempotent] as const,
  request: { params: z.object({ id: z.string() }), headers: IdempotencyHeader, body: body(CreateUploadBody) },
  responses: { 201: json(UploadSession, 'Upload started'), ...problems(401, 402, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const me = userOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const input = c.req.valid('json')
  const [album] = await db.select().from(schema.albums).where(and(eq(schema.albums.id, input.albumId), eq(schema.albums.eventId, ev.id))).limit(1)
  if (!album) throw new ValidationFailed([{ field: 'albumId', in: 'body', message: 'Album not found in this event', code: 'unknown_album' }])

  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  const guestUpload = (input.source ?? (album.kind === 'guest' ? 'guest' : 'web')) === 'guest'
  const cost = guestUpload ? 0 : input.files.length * (input.quality === 'original' ? 2 : 1)
  if (cost && studio.photosUsed + cost > studio.photosLimit) {
    throw new AppError(402, 'quota_exceeded', 'Photo quota exceeded', `This upload needs ${cost} photo credits but only ${Math.max(0, studio.photosLimit - studio.photosUsed)} are left on your plan. Add a photo pack or upgrade.`)
  }

  const mode: UploadMode = uploadMode(c.env)
  const uploadId = newId('up')
  const expiresAt = new Date(Date.now() + PRESIGN_TTL_SEC * 1000).toISOString()
  const origin = (c.env.API_PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '')
  const records: UploadFileRecord[] = []
  const out: z.infer<typeof UploadSession>['files'] = []
  for (const f of input.files) {
    const photoId = newId('ph')
    if (f.url || f.external) {
      records.push({ photoId, filename: f.filename, size: f.size, contentType: f.contentType, key: null, multipartId: null, partSize: 0, partCount: 0, width: f.width, height: f.height, capturedAt: f.capturedAt, url: f.url })
      out.push({ photoId, filename: f.filename, key: null, parts: [] })
      continue
    }
    const key = objectKey(m.studioId, ev.id, photoId, f.filename)
    const multipartId = await createMultipart(c.env, mode, key, f.contentType)
    const partCount = Math.max(1, Math.ceil(f.size / PART_SIZE))
    records.push({ photoId, filename: f.filename, size: f.size, contentType: f.contentType, key, multipartId, partSize: PART_SIZE, partCount, width: f.width, height: f.height, capturedAt: f.capturedAt })
    const parts: { partNumber: number; url: string }[] = []
    if (mode === 's3') {
      for (let n = 1; n <= partCount; n++) parts.push({ partNumber: n, url: await presignPart(c.env, key, multipartId, n) })
    } else {
      const token = await signJwt(c.env.JWT_SECRET, { sub: uploadId, aud: 'upload', pid: photoId }, PRESIGN_TTL_SEC)
      for (let n = 1; n <= partCount; n++) parts.push({ partNumber: n, url: `${origin}/v1/uploads/${uploadId}/files/${photoId}/parts/${n}?token=${token}` })
    }
    out.push({ photoId, filename: f.filename, key, parts })
  }
  await db.insert(schema.uploads).values({
    id: uploadId, studioId: m.studioId, eventId: ev.id, albumId: album.id, userId: me.id, quality: input.quality, mode, files: records,
    options: { source: input.source, uploadedBy: input.uploadedBy, watermark: input.watermark, fast: input.fast },
    status: 'pending', createdAt: nowIso(), expiresAt,
  }).run()
  return c.json({ uploadId, mode, partSize: PART_SIZE, expiresAt, files: out }, 201)
})

/** Dev/proxy part upload: the URL carries a short-lived upload token instead of a bearer header (like a presigned URL). */
uploadRoutes.put('/uploads/:uploadId/files/:photoId/parts/:partNumber{[0-9]+}', async (c) => {
  const { uploadId, photoId } = c.req.param()
  const partNumber = Number(c.req.param('partNumber'))
  const token = c.req.query('token') ?? ''
  const v = await verifyJwt(c.env.JWT_SECRET, token, 'upload')
  if (!v.ok || v.claims.sub !== uploadId || v.claims.pid !== photoId) throw new Unauthorized('This upload link is invalid or has expired. Start the upload again.', 'invalid_upload_token')
  const [up] = await getDb(c.env.DB).select().from(schema.uploads).where(eq(schema.uploads.id, uploadId)).limit(1)
  if (!up || up.status !== 'pending' || up.mode !== 'proxy') throw new NotFound('Upload', uploadId)
  const file = up.files.find((f) => f.photoId === photoId)
  if (!file?.key || !file.multipartId) throw new NotFound('Upload file', photoId)
  if (partNumber < 1 || partNumber > file.partCount) throw new ValidationFailed([{ field: 'partNumber', in: 'path', message: `Part must be 1–${file.partCount}`, code: 'out_of_range' }])
  const bytes = await c.req.arrayBuffer()
  if (bytes.byteLength === 0) throw new ValidationFailed([{ field: '(body)', in: 'body', message: 'Part body is empty', code: 'empty' }])
  const part = await c.env.MEDIA.resumeMultipartUpload(file.key, file.multipartId).uploadPart(partNumber, bytes)
  c.header('ETag', part.etag)
  return c.json({ partNumber: part.partNumber, etag: part.etag }, 200)
})

const CompleteBody = z.object({
  files: z.array(z.object({
    photoId: z.string().max(64),
    parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).max(10_000).default([]),
  })).min(1).max(MAX_FILES),
}).openapi('CompleteUpload')

uploadRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/uploads/{uploadId}/complete', tags: ['Uploads'], summary: 'Finish an upload',
  description: 'Completes each listed file, creates photo rows with status `processing` and queues them for processing. Files that are not listed are aborted.',
  security, middleware: [requireStudio('uploader', 'upload'), idempotent] as const,
  request: { params: z.object({ id: z.string(), uploadId: z.string() }), headers: IdempotencyHeader, body: body(CompleteBody) },
  responses: { 201: json(z.object({ items: z.array(Photo) }), 'Photos created'), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const me = userOf(c)
  const db = getDb(c.env.DB)
  const { id, uploadId } = c.req.valid('param')
  const ev = await eventForMember(db, m, id)
  const [up] = await db.select().from(schema.uploads).where(and(eq(schema.uploads.id, uploadId), eq(schema.uploads.eventId, ev.id))).limit(1)
  if (!up) throw new NotFound('Upload', uploadId)
  assertEventVisible(m, up.eventId)
  if (up.status !== 'pending') throw new Conflict('This upload was already completed or aborted.', 'upload_closed')

  const wanted = new Map(c.req.valid('json').files.map((f) => [f.photoId, f.parts]))
  const unknown = [...wanted.keys()].filter((pid) => !up.files.some((f) => f.photoId === pid))
  if (unknown.length) throw new ValidationFailed(unknown.map((pid) => ({ field: 'files', in: 'body' as const, message: `Photo ${pid} is not part of this upload`, code: 'unknown_photo' })))

  const done: UploadFileRecord[] = []
  for (const f of up.files) {
    const parts = wanted.get(f.photoId)
    if (!parts) {
      if (f.key && f.multipartId) await abortMultipart(c.env, up.mode, f.key, f.multipartId)
      continue
    }
    if (f.key && f.multipartId) {
      if (parts.length !== f.partCount) {
        throw new ValidationFailed([{ field: `files.${f.photoId}.parts`, in: 'body', message: `Expected ${f.partCount} parts, got ${parts.length}`, code: 'parts_mismatch' }])
      }
      await completeMultipart(c.env, up.mode, f.key, f.multipartId, parts)
    }
    done.push(f)
  }

  const p = schema.photos
  const [{ top }] = await db.select({ top: max(p.index) }).from(p).where(eq(p.albumId, up.albumId))
  const now = nowIso()
  const [album] = await db.select({ kind: schema.albums.kind }).from(schema.albums).where(eq(schema.albums.id, up.albumId)).limit(1)
  const opts = up.options ?? {}
  const source = opts.source ?? (album?.kind === 'guest' ? 'guest' : 'web')
  const reviewStatus = source === 'guest' ? (ev.settings.reviewGuestUploads ? 'pending' as const : 'approved' as const) : null
  const rows: (typeof p.$inferInsert)[] = done.map((f, i) => ({
    id: f.photoId, eventId: up.eventId, albumId: up.albumId, studioId: up.studioId, filename: f.filename, index: (top ?? 0) + i + 1,
    capturedAt: f.capturedAt && !Number.isNaN(Date.parse(f.capturedAt)) ? new Date(f.capturedAt).toISOString() : now,
    tone: tone(hash(f.filename)), url: f.url ?? null, r2Key: f.key, status: 'processing', hidden: false, favourites: 0, downloads: 0, faces: [],
    exif: { width: f.width ?? 0, height: f.height ?? 0, sizeBytes: f.size }, uploadedBy: opts.uploadedBy ?? (me.name || me.email),
    source, quality: up.quality, createdAt: now, reviewStatus,
  }))
  const cost = source === 'guest' ? 0 : rows.length * (up.quality === 'original' ? 2 : 1)
  if (rows.length) {
    await db.batch([
      db.update(schema.uploads).set({ status: 'completed' }).where(eq(schema.uploads.id, up.id)),
      ...rows.map((r) => db.insert(p).values(r)),
      db.update(schema.studios).set({ photosUsed: sql`${schema.studios.photosUsed} + ${cost}` }).where(eq(schema.studios.id, up.studioId)),
      db.update(schema.events).set({ status: 'uploading' }).where(and(eq(schema.events.id, up.eventId), eq(schema.events.status, 'draft'))),
      ...recountStatements(db, up.eventId),
    ])
    const jobs: { body: PhotoJob }[] = rows.map((r) => ({ body: { kind: 'process-photo', photoId: r.id, eventId: up.eventId, studioId: up.studioId, key: r.r2Key ?? null, quality: up.quality, ...(opts.watermark ? { watermark: true } : {}) } }))
    for (let i = 0; i < jobs.length; i += 100) await c.env.PHOTO_QUEUE.sendBatch(jobs.slice(i, i + 100))
  } else {
    await db.update(schema.uploads).set({ status: 'aborted' }).where(eq(schema.uploads.id, up.id)).run()
  }
  audit(c, 'photos.upload', { type: 'event', id: up.eventId }, { count: rows.length, quality: up.quality })
  emit(c, m.studioId, 'photos', 'albums', 'events', 'usage')
  const created = rows.length ? await db.select().from(p).where(sql`${p.id} IN (SELECT value FROM json_each(${JSON.stringify(rows.map((r) => r.id))}))`) : []
  const position = new Map(rows.map((r, i) => [r.id, i]))
  created.sort((a, b) => position.get(a.id)! - position.get(b.id)!)
  return c.json({ items: created.map((r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE)) }, 201)
})

/** Serves R2 objects in dev (production serves media from an R2 custom domain via PUBLIC_MEDIA_BASE). */
uploadRoutes.get('/media/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
  if (!key.startsWith('studios/')) throw new NotFound('File')
  const obj = await c.env.MEDIA.get(key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers })
  if (!obj) throw new NotFound('File')
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('ETag', obj.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers })
  return new Response(obj.body, { status: c.req.header('range') ? 206 : 200, headers })
})
