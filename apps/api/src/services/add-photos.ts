import { and, eq, max, sql } from 'drizzle-orm'
import { hash, tone } from '@frameline/shared'
import type { Env, ProcessPhotoJob } from '../env'
import { getDb, schema } from '../db/client'
import { webCopyKey } from '../db/mappers'
import type { UploadSessionOptions } from '../db/schema'
import { nowIso } from '../lib/ids'
import { recountStatements } from './events'

/** A file that is already stored (in R2, in the studio's Drive, or registered by URL), ready to become a photo. */
export interface StoredFile {
  photoId: string
  filename: string
  size: number
  key: string | null
  url?: string
  width?: number
  height?: number
  capturedAt?: string
  storage?: 'r2' | 'drive'
  driveFileId?: string
  /** A 2048 px web copy is already stored next to it. */
  webCopy?: boolean
}

type EventRow = typeof schema.events.$inferSelect

/**
 * Inserts `processing` photos for stored files, charges the plan, updates counts and queues processing. Shared by
 * upload completion, Drive imports and Drive uploads. Returns the inserted rows in the order given.
 */
export async function addPhotos(env: Env, a: {
  event: EventRow; albumId: string; studioId: string; quality: 'web' | 'original'; options: UploadSessionOptions; uploaderName: string; files: StoredFile[]
}): Promise<(typeof schema.photos.$inferInsert)[]> {
  const db = getDb(env.DB)
  const ev = a.event
  const p = schema.photos
  if (!a.files.length) return []
  const [{ top }] = await db.select({ top: max(p.index) }).from(p).where(eq(p.albumId, a.albumId))
  const now = nowIso()
  const [album] = await db.select({ kind: schema.albums.kind }).from(schema.albums).where(eq(schema.albums.id, a.albumId)).limit(1)
  const opts = a.options
  const source = opts.source ?? (album?.kind === 'guest' ? 'guest' : 'web')
  const reviewStatus = source === 'guest' ? (ev.settings.reviewGuestUploads ? 'pending' as const : 'approved' as const) : null
  const rows: (typeof p.$inferInsert)[] = a.files.map((f, i) => ({
    id: f.photoId, eventId: ev.id, albumId: a.albumId, studioId: a.studioId, filename: f.filename, index: (top ?? 0) + i + 1,
    capturedAt: f.capturedAt && !Number.isNaN(Date.parse(f.capturedAt)) ? new Date(f.capturedAt).toISOString() : now,
    tone: tone(hash(f.filename)), url: f.url ?? null, r2Key: f.key, status: 'processing', hidden: false, favourites: 0, downloads: 0, faces: [],
    exif: { width: f.width ?? 0, height: f.height ?? 0, sizeBytes: f.size }, uploadedBy: opts.uploadedBy ?? a.uploaderName,
    source, quality: a.quality, createdAt: now, reviewStatus,
    storage: f.storage ?? 'r2', driveFileId: f.driveFileId ?? null, webCopy: f.webCopy ?? false,
  }))
  const cost = source === 'guest' ? 0 : rows.length * (a.quality === 'original' ? 2 : 1)
  await db.batch([
    db.update(schema.studios).set({ photosUsed: sql`${schema.studios.photosUsed} + ${cost}` }).where(eq(schema.studios.id, a.studioId)),
    ...rows.map((r) => db.insert(p).values(r)),
    db.update(schema.events).set({ status: 'uploading' }).where(and(eq(schema.events.id, ev.id), eq(schema.events.status, 'draft'))),
    ...recountStatements(db, ev.id),
    // Camera sync: the camera feeding this album last sent something now.
    ...(source === 'camera' ? [db.update(schema.cameras).set({ lastUploadAt: now }).where(and(eq(schema.cameras.eventId, ev.id), eq(schema.cameras.albumId, a.albumId)))] : []),
  ])
  const jobs: { body: ProcessPhotoJob }[] = rows.map((r) => ({ body: processJob(r, a.quality, opts.watermark) }))
  for (let i = 0; i < jobs.length; i += 100) await env.PHOTO_QUEUE.sendBatch(jobs.slice(i, i + 100))
  return rows
}

/**
 * The processing job for a new photo. An original in Drive isn't in R2, so the processor works from the web copy
 * (`webOnly`), which the studio's browser sends just after the photo is made.
 */
export function processJob(r: Pick<typeof schema.photos.$inferInsert, 'id' | 'eventId' | 'studioId' | 'r2Key' | 'storage'>, quality: 'web' | 'original', watermark?: boolean): ProcessPhotoJob {
  const drive = r.storage === 'drive' && !!r.r2Key
  return {
    kind: 'process-photo', photoId: r.id, eventId: r.eventId, studioId: r.studioId,
    key: drive ? webCopyKey(r.r2Key!) : r.r2Key ?? null, quality,
    ...(drive ? { webOnly: true } : {}),
    ...(watermark ? { watermark: true } : {}),
  }
}
