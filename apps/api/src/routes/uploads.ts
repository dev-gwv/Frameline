import { createRoute, z } from '@hono/zod-openapi'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { webCopyKey } from '../db/mappers'
import type { UploadFileRecord, UploadSessionOptions } from '../db/schema'
import { AppError, Conflict, NotFound, Unauthorized, ValidationFailed } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { guestCanSee, studioPhotosOut, verifyMediaSig } from '../lib/media-sign'
import { signJwt, verifyJwt } from '../lib/jwt'
import { IdempotencyHeader, body, createRouter, json, problems, security } from '../lib/openapi'
import { membershipOf, requireStudio, userOf } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { Photo } from '../schemas/domain'
import { assertEventVisible } from '../services/access'
import { audit } from '../services/audit'
import { paymentsLive } from '../services/payments'
import { eventForMember } from '../services/events'
import { emit } from '../services/realtime'
import { queuePartnerNotice } from '../services/partner-notify'
import { addPhotos, type StoredFile } from '../services/add-photos'
import { openOriginal } from '../services/originals'
import { DriveFileMissing, ensureAlbumFolder, getFile, startResumableUpload } from '../services/drive'
import { background } from '../lib/http'
import {
  PART_SIZE, PRESIGN_TTL_SEC, abortMultipart, completeMultipart, createMultipart, objectKey, presignPart, uploadMode, type UploadMode,
} from '../services/storage'

export const uploadRoutes = createRouter()

type UploadInputFile = z.infer<typeof UploadFileInput>

/**
 * Opens R2 multipart uploads (or registers external files) and stores the upload session. With `drive`, each file
 * instead gets a Google Drive resumable upload into the album's folder (originals kept in the studio's Drive).
 */
export async function createUploadSession(c: Context<AppEnv>, a: {
  studioId: string; eventId: string; albumId: string; userId: string; quality: 'web' | 'original'; files: UploadInputFile[]; options: UploadSessionOptions
  drive?: { parentId: string }
}) {
  const db = getDb(c.env.DB)
  const input = { files: a.files, quality: a.quality }
  const m = { studioId: a.studioId }
  const ev = { id: a.eventId }
  const album = { id: a.albumId }
  const me = { id: a.userId }
  const mode: UploadMode | 'drive' = a.drive ? 'drive' : uploadMode(c.env)
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
    if (mode === 'drive') {
      // The key names where the web copy goes (…/renditions/2048.jpg); the original itself never enters R2.
      const appOrigin = c.req.header('origin') ?? new URL(c.env.APP_URL).origin
      const driveUploadUrl = await startResumableUpload(c.env, m.studioId, { name: f.filename, mimeType: f.contentType, size: f.size, parentId: a.drive!.parentId, origin: appOrigin })
      records.push({ photoId, filename: f.filename, size: f.size, contentType: f.contentType, key, multipartId: null, partSize: 0, partCount: 0, width: f.width, height: f.height, capturedAt: f.capturedAt, driveParentId: a.drive!.parentId })
      out.push({ photoId, filename: f.filename, key, parts: [], driveUploadUrl })
      continue
    }
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
    options: a.options,
    status: 'pending', createdAt: nowIso(), expiresAt,
  }).run()
  return { uploadId, mode, partSize: PART_SIZE, expiresAt, files: out }
}

/** Completes the listed files, inserts `processing` photos, updates counts/usage and queues processing. */
export async function completeUploadSession(c: Context<AppEnv>, a: {
  event: typeof schema.events.$inferSelect
  upload: typeof schema.uploads.$inferSelect
  files: { photoId: string; parts: { partNumber: number; etag: string }[]; driveFileId?: string }[]
  uploaderName: string
}) {
  const db = getDb(c.env.DB)
  const ev = a.event
  const up = a.upload
  const m = { studioId: up.studioId }
  if (up.status !== 'pending') throw new Conflict('This upload was already completed or aborted.', 'upload_closed')
  const wanted = new Map(a.files.map((f) => [f.photoId, f]))
  const unknown = [...wanted.keys()].filter((pid) => !up.files.some((f) => f.photoId === pid))
  if (unknown.length) throw new ValidationFailed(unknown.map((pid) => ({ field: 'files', in: 'body' as const, message: `Photo ${pid} is not part of this upload`, code: 'unknown_photo' })))

  const done: StoredFile[] = []
  for (const f of up.files) {
    const sent = wanted.get(f.photoId)
    if (!sent) {
      if (f.key && f.multipartId && up.mode !== 'drive') await abortMultipart(c.env, up.mode, f.key, f.multipartId)
      continue
    }
    if (f.driveParentId) {
      // The browser uploaded straight to Drive: the file must be there, in the album's folder, no bigger than declared.
      if (!sent.driveFileId) continue
      const file = await getFile(c.env, up.studioId, sent.driveFileId).catch((e) => { if (e instanceof DriveFileMissing) return null; throw e })
      if (!file || file.trashed || !file.parents?.includes(f.driveParentId) || Number(file.size ?? 0) > f.size) continue
      done.push({ ...f, url: undefined, size: Number(file.size ?? f.size), storage: 'drive', driveFileId: file.id })
      continue
    }
    if (f.key && f.multipartId) {
      if (sent.parts.length !== f.partCount) {
        throw new ValidationFailed([{ field: `files.${f.photoId}.parts`, in: 'body', message: `Expected ${f.partCount} parts, got ${sent.parts.length}`, code: 'parts_mismatch' }])
      }
      await completeMultipart(c.env, up.mode as UploadMode, f.key, f.multipartId, sent.parts)
      // Part URLs don't bind a length, so check what really arrived against the size declared (and checked) at start.
      const stored = await c.env.MEDIA.head(f.key)
      if (!stored || stored.size > f.size) {
        if (stored) await c.env.MEDIA.delete(f.key)
        continue
      }
    }
    done.push(f)
  }

  const p = schema.photos
  // Claims the session first, so a second completion can't add the same photos again.
  const claimed = await db.update(schema.uploads).set({ status: done.length ? 'completed' : 'aborted' }).where(and(eq(schema.uploads.id, up.id), eq(schema.uploads.status, 'pending'))).run()
  if (!claimed.meta.changes) throw new Conflict('This upload was already completed or aborted.', 'upload_closed')
  const rows = await addPhotos(c.env, {
    event: ev, albumId: up.albumId, studioId: up.studioId, quality: up.quality, options: up.options ?? {}, uploaderName: a.uploaderName, files: done,
  })
  audit(c, 'photos.upload', { type: 'event', id: up.eventId }, { count: rows.length, quality: up.quality })
  if (rows.length) background(c, queuePartnerNotice(c.env, up.eventId, 'photos'))
  emit(c, m.studioId, 'photos', 'albums', 'events', 'usage')
  const created = rows.length ? await db.select().from(p).where(sql`${p.id} IN (SELECT value FROM json_each(${JSON.stringify(rows.map((r) => r.id))}))`) : []
  const position = new Map(rows.map((r, i) => [r.id, i]))
  created.sort((a, b) => position.get(a.id)! - position.get(b.id)!)
  return studioPhotosOut(c.env, created)
}

const MAX_FILE_BYTES = 200 * 1024 * 1024
const MAX_FILES = 100

export const UploadFileInput = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  // Not SVG: it can carry script, and /v1/media serves files from the API's own origin.
  contentType: z.string().regex(/^(image\/(?!svg)[\w.+-]+|video\/[\w.+-]+)$/, 'Only photo or video files').default('image/jpeg'),
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
  mode: z.enum(['s3', 'proxy', 'drive']).openapi({ description: '`s3`: PUT parts to presigned R2 URLs. `proxy`: PUT parts to this API (dev). `drive`: PUT each file to its `driveUploadUrl` (a Google Drive resumable upload; the event keeps originals in the studio’s Drive), then complete with each file’s `driveFileId`.' }),
  partSize: z.number().int(),
  expiresAt: z.string(),
  files: z.array(z.object({
    photoId: z.string(), filename: z.string(), key: z.string().nullable(),
    parts: z.array(z.object({ partNumber: z.number().int(), url: z.string() })),
    driveUploadUrl: z.string().optional(),
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
  const [album] = await db.select().from(schema.albums).where(and(eq(schema.albums.id, input.albumId), eq(schema.albums.eventId, ev.id), isNull(schema.albums.deletedAt))).limit(1)
  if (!album) throw new ValidationFailed([{ field: 'albumId', in: 'body', message: 'Album not found in this event', code: 'unknown_album' }])

  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  // Guest uploads (free of the plan quota) are only those in the guest album; the client's `source` can't make
  // a studio's own photos free.
  const guestUpload = album.kind === 'guest'
  const source = guestUpload ? 'guest' as const : input.source === 'guest' ? 'web' as const : input.source
  const cost = guestUpload ? 0 : input.files.length * (input.quality === 'original' ? 2 : 1)
  // A lapsed plan or trial stops new uploads (galleries stay open). Only while card/UPI payments are switched on:
  // without them a studio would have no way to renew, so nothing is enforced that can't be paid for.
  if (!guestUpload && paymentsLive(c.env) && Date.parse(studio.validTill) < Date.now()) {
    throw new AppError(402, 'plan_expired', 'Plan expired', 'Your plan has ended. Renew it on the Plan page to upload more photos. Your galleries stay open.')
  }
  if (cost && studio.photosUsed + cost > studio.photosLimit) {
    throw new AppError(402, 'quota_exceeded', 'Photo quota exceeded', `This upload needs room for ${cost} photos but your plan has ${Math.max(0, studio.photosLimit - studio.photosUsed)} left. Add a photo pack or upgrade.`)
  }
  // Each event has its own photo limit, which photo packs raise.
  if (!guestUpload && ev.photoCount + input.files.length > ev.photoLimit) {
    const left = Math.max(0, ev.photoLimit - ev.photoCount)
    throw new AppError(402, 'event_limit_reached', 'Event photo limit reached', `${ev.name} has room for ${left} more ${left === 1 ? 'photo' : 'photos'}. Add a photo pack to this event to upload more.`)
  }

  // Originals in the studio's Drive: guest uploads and registered URLs still go to R2.
  const drive = ev.originalsIn === 'drive' && !guestUpload && input.files.some((f) => !f.url && !f.external)
    ? { parentId: await ensureAlbumFolder(c.env, ev, album) }
    : undefined
  const session = await createUploadSession(c, {
    studioId: m.studioId, eventId: ev.id, albumId: album.id, userId: me.id, quality: input.quality, files: input.files,
    options: { source, uploadedBy: input.uploadedBy, watermark: input.watermark, fast: input.fast }, drive,
  })
  return c.json(session, 201)
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

/** Most a web copy may weigh: a 2048 px JPEG is usually 0.3–1.5 MB. */
export const WEB_COPY_MAX_BYTES = 8 * 1024 * 1024

/**
 * The studio's browser sends a 2048 px JPEG of each photo it just uploaded (no image processor needed), stored as
 * …/renditions/2048.jpg next to the original. Galleries then show it instead of the full-size file, and web-size
 * downloads and ZIPs use it. The processor, when it runs, writes the same file again. Best effort: a photo
 * without one still works, it just loads the original.
 */
uploadRoutes.put('/photos/:id/web', requireStudio('uploader', 'upload'), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const p = schema.photos
  const [photo] = await db.select().from(p).where(and(eq(p.id, c.req.param('id')), eq(p.studioId, m.studioId), isNull(p.deletedAt))).limit(1)
  if (!photo) throw new NotFound('Photo', c.req.param('id'))
  assertEventVisible(m, photo.eventId)
  if (!photo.r2Key || photo.url) throw new Conflict('This photo has no uploaded file to go with a web copy.', 'no_file')
  if (!/^image\/jpeg\b/.test(c.req.header('content-type') ?? '')) throw new AppError(415, 'unsupported_media_type', 'Send a JPEG', 'The web copy must be a JPEG.')
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (bytes.byteLength > WEB_COPY_MAX_BYTES) throw new AppError(413, 'payload_too_large', 'Too large', 'The web copy is too large.')
  if (bytes.byteLength < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ValidationFailed([{ field: '(body)', in: 'body', message: 'Not a JPEG file', code: 'not_jpeg' }])
  await c.env.MEDIA.put(webCopyKey(photo.r2Key), bytes, { httpMetadata: { contentType: 'image/jpeg' } })
  // Copies of the photo (picks albums) share its file, so they share the web copy too.
  await db.update(p).set({ webCopy: true }).where(and(eq(p.studioId, m.studioId), eq(p.r2Key, photo.r2Key))).run()
  emit(c, m.studioId, 'photos')
  return c.body(null, 204)
})

const CompleteBody = z.object({
  files: z.array(z.object({
    photoId: z.string().max(64),
    parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).max(10_000).default([]),
    /** Drive uploads: the id Google returned for the uploaded file. */
    driveFileId: z.string().regex(/^[\w-]{10,200}$/).optional(),
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
  const items = await completeUploadSession(c, { event: ev, upload: up, files: c.req.valid('json').files, uploaderName: me.name || me.email })
  return c.json({ items }, 201)
})

const PHOTO_KEY = /^studios\/[^/]+\/events\/([^/]+)\/originals\/([^/]+)\//

/**
 * Serves R2 objects. A photo's file (original or rendition) needs a signature (lib/media-sign.ts): the studio
 * API's opens it, the guest API's only while a guest could see the photo -- some copy of it visible, in an
 * event that isn't in the trash. Files are cached privately for an hour, so hiding a photo takes hold within
 * the hour. Studio assets (logos, covers) stay public.
 */
uploadRoutes.get('/media/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
  if (!key.startsWith('studios/')) throw new NotFound('File')
  let cache = 'public, max-age=31536000, immutable'
  const photo = PHOTO_KEY.exec(key)
  let inDrive: Parameters<typeof openOriginal>[1] | null = null
  if (photo) {
    const [, eventId, photoId] = photo
    const p = schema.photos
    const rows = await getDb(c.env.DB).select({
      hidden: p.hidden, deletedAt: p.deletedAt, reviewStatus: p.reviewStatus, status: p.status, eventDeleted: schema.events.deletedAt,
      id: p.id, r2Key: p.r2Key, storage: p.storage, driveFileId: p.driveFileId, studioId: p.studioId, webCopy: p.webCopy,
    })
      .from(p).innerJoin(schema.events, eq(schema.events.id, p.eventId))
      .where(and(eq(p.eventId, eventId), or(eq(p.id, photoId), eq(p.copiedFrom, photoId)))).limit(50)
    const [exp, sig] = [c.req.query('exp'), c.req.query('sig')]
    const guestsSeeIt = rows.some((r) => !r.eventDeleted && guestCanSee(r))
    const ok = rows.length > 0 && (await verifyMediaSig(c.env.JWT_SECRET, key, exp, sig)
      || (guestsSeeIt && await verifyMediaSig(c.env.JWT_SECRET, key, exp, sig, Date.now(), 'guest')))
    if (!ok) throw new NotFound('File')
    cache = 'private, max-age=3600'
    // Copies (picks albums) share the original's file, so any of them can say where it is.
    inDrive = rows.find((r) => r.storage === 'drive' && r.r2Key === key && r.driveFileId) ?? null
  }
  if (inDrive) {
    // The original is in the studio's Google Drive (the web copy, in R2, is served below like any file).
    const f = await openOriginal(c.env, inDrive, { range: c.req.header('range') })
    if (!f) throw new NotFound('File')
    const headers = new Headers({ 'Content-Type': f.contentType ?? 'application/octet-stream', 'Cache-Control': cache })
    if (f.size) headers.set('Content-Length', String(f.size))
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    headers.set('X-Content-Type-Options', 'nosniff')
    if (f.fallback) headers.set('X-Frameline-Fallback', 'web-copy')
    return new Response(f.body, { status: 200, headers })
  }
  const obj = await c.env.MEDIA.get(key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers })
  if (!obj) throw new NotFound('File')
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('ETag', obj.httpEtag)
  headers.set('Cache-Control', cache)
  // Files are shown as images, never run: even a file that slipped in as HTML or SVG can't run script here.
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  headers.set('X-Content-Type-Options', 'nosniff')
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers })
  return new Response(obj.body, { status: c.req.header('range') ? 206 : 200, headers })
})
