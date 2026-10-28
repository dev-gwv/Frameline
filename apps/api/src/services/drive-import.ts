import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DriveImport } from '@frameline/shared'
import type { DriveImportJob, Env } from '../env'
import { getDb, schema } from '../db/client'
import { webCopyKey } from '../db/mappers'
import { newId, nowIso } from '../lib/ids'
import { addPhotos, type StoredFile } from './add-photos'
import { DriveBusy, DriveFileMissing, DriveRevoked, IMPORTABLE, MAX_IMPORT_FILE_BYTES, downloadFile, driveFetch, getFile, type DriveFile } from './drive'
import { queuePartnerNotice } from './partner-notify'
import { publishTopics } from './realtime'
import { objectKey } from './storage'

/**
 * Google Drive imports: picked files are copied into R2 by the photo queue, ten per `drive-import` message, and
 * become ordinary photos (`source: drive`, `driveFileId` set so the same file is never imported twice).
 */

export const IMPORT_BATCH = 10
const WEB_COPY_MAX = 8 * 1024 * 1024

type ImportRow = typeof schema.driveImports.$inferSelect
type ItemRow = typeof schema.driveImportItems.$inferSelect

export const importOut = (r: ImportRow): DriveImport => ({
  id: r.id, eventId: r.eventId, name: r.name, status: r.status, total: r.total, done: r.done, skipped: r.skipped, failed: r.failed,
  albumsCreated: r.albumsCreated, quality: r.quality, watermark: r.watermark, createdAt: r.createdAt,
  ...(r.finishedAt ? { finishedAt: r.finishedAt } : {}), ...(r.error ? { error: r.error } : {}),
})

/** Why a Drive file can't come in, or null when it can. */
export function notImportable(f: { mimeType: string; size: number }): string | null {
  if (f.mimeType === 'application/vnd.google-apps.folder') return 'Folder'
  if (/^video\//.test(f.mimeType)) return 'Videos aren’t imported'
  if (!IMPORTABLE.test(f.mimeType)) return /^image\//.test(f.mimeType) ? 'RAW and other camera files aren’t imported yet' : 'Not a photo'
  if (f.size > MAX_IMPORT_FILE_BYTES) return 'Bigger than 200 MB'
  return null
}

/** Queues an import's waiting items. */
export async function queueImport(env: Env, imp: Pick<ImportRow, 'id' | 'studioId'>, itemIds: string[]) {
  const jobs: { body: DriveImportJob }[] = []
  for (let i = 0; i < itemIds.length; i += IMPORT_BATCH) jobs.push({ body: { kind: 'drive-import', importId: imp.id, studioId: imp.studioId, itemIds: itemIds.slice(i, i + IMPORT_BATCH) } })
  for (let i = 0; i < jobs.length; i += 100) await env.PHOTO_QUEUE.sendBatch(jobs.slice(i, i + 100))
}

/** EXIF "2024:01:02 10:11:12" → ISO, or undefined. */
export function exifTime(t?: string): string | undefined {
  const m = t && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(t)
  if (!m) return undefined
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

async function setItem(env: Env, id: string, patch: Partial<ItemRow>) {
  await getDb(env.DB).update(schema.driveImportItems).set(patch).where(eq(schema.driveImportItems.id, id)).run()
}

/** Bumps the import's counters and finishes it once nothing is waiting. */
async function tally(env: Env, importId: string, d: { done?: number; skipped?: number; failed?: number }) {
  const t = schema.driveImports
  const db = getDb(env.DB)
  if (d.done || d.skipped || d.failed) {
    await db.update(t).set({
      done: sql`${t.done} + ${d.done ?? 0}`, skipped: sql`${t.skipped} + ${d.skipped ?? 0}`, failed: sql`${t.failed} + ${d.failed ?? 0}`,
    }).where(eq(t.id, importId)).run()
  }
  await db.run(sql`UPDATE drive_imports SET status = 'done', finished_at = ${nowIso()} WHERE id = ${importId} AND status = 'running'
    AND NOT EXISTS (SELECT 1 FROM drive_import_items WHERE import_id = ${importId} AND status = 'waiting')`)
}

/** Stops an import whose Drive access is gone: every waiting item is skipped. */
export async function failImport(env: Env, importId: string, error: string) {
  const db = getDb(env.DB)
  const waiting = await db.select({ id: schema.driveImportItems.id }).from(schema.driveImportItems)
    .where(and(eq(schema.driveImportItems.importId, importId), eq(schema.driveImportItems.status, 'waiting')))
  await db.update(schema.driveImportItems).set({ status: 'skipped', error }).where(and(eq(schema.driveImportItems.importId, importId), eq(schema.driveImportItems.status, 'waiting'))).run()
  await db.update(schema.driveImports).set({ status: 'failed', error, finishedAt: nowIso(), skipped: sql`${schema.driveImports.skipped} + ${waiting.length}` })
    .where(and(eq(schema.driveImports.id, importId), eq(schema.driveImports.status, 'running'))).run()
}

/** Drive's own thumbnail at 2048 px, as the web copy (best effort: without it galleries load the original). */
async function webCopyFromThumbnail(env: Env, studioId: string, file: DriveFile, key: string): Promise<boolean> {
  if (!file.thumbnailLink) return false
  try {
    const url = /=s\d+(-[a-z]+)?$/.test(file.thumbnailLink) ? file.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, '=s2048') : `${file.thumbnailLink}=s2048`
    const res = await driveFetch(env, studioId, url)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < 3 || bytes.byteLength > WEB_COPY_MAX || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false
    await env.MEDIA.put(webCopyKey(key), bytes, { httpMetadata: { contentType: 'image/jpeg' } })
    return true
  } catch (e) {
    if (e instanceof DriveRevoked) throw e
    return false
  }
}

/** Streams a Drive file into R2 at `key`; returns its size. */
async function copyToR2(env: Env, studioId: string, file: DriveFile, key: string): Promise<number> {
  const res = await downloadFile(env, studioId, file.id)
  const size = Number(file.size ?? res.headers.get('content-length') ?? 0)
  if (!res.body) throw new DriveFileMissing(file.id)
  if (size > 0) {
    const fixed = new FixedLengthStream(size)
    const piping = res.body.pipeTo(fixed.writable)
    await env.MEDIA.put(key, fixed.readable, { httpMetadata: { contentType: file.mimeType } })
    await piping
  } else {
    await env.MEDIA.put(key, await res.arrayBuffer(), { httpMetadata: { contentType: file.mimeType } })
  }
  return size
}

/**
 * Queue handler for one `drive-import` message. Throws DriveBusy (and other passing errors) for the queue to retry;
 * a revoked connection fails the whole import.
 */
export async function runDriveImport(env: Env, job: DriveImportJob): Promise<void> {
  const db = getDb(env.DB)
  const [imp] = await db.select().from(schema.driveImports).where(eq(schema.driveImports.id, job.importId)).limit(1)
  if (!imp) return
  const items = await db.select().from(schema.driveImportItems)
    .where(and(eq(schema.driveImportItems.importId, imp.id), inArray(schema.driveImportItems.id, job.itemIds), eq(schema.driveImportItems.status, 'waiting')))
  if (!items.length) return
  if (imp.status !== 'running') {
    for (const it of items) await setItem(env, it.id, { status: 'skipped', error: 'Import stopped' })
    return
  }
  const [ev] = await db.select().from(schema.events).where(and(eq(schema.events.id, imp.eventId), isNull(schema.events.deletedAt))).limit(1)
  if (!ev) { await failImport(env, imp.id, 'The event was deleted'); return }
  const [user] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, imp.userId)).limit(1)
  const uploader = user?.name || user?.email || 'Google Drive'

  const albumIds = [...new Set(items.map((i) => i.albumId))]
  const liveAlbums = new Set((await db.select({ id: schema.albums.id }).from(schema.albums)
    .where(and(inArray(schema.albums.id, albumIds), eq(schema.albums.eventId, ev.id), isNull(schema.albums.deletedAt)))).map((a) => a.id))
  const already = new Set((await db.select({ f: schema.photos.driveFileId }).from(schema.photos)
    .where(and(eq(schema.photos.eventId, ev.id), inArray(schema.photos.driveFileId, items.map((i) => i.fileId)), isNull(schema.photos.deletedAt)))).map((r) => r.f))
  const [studio] = await db.select({ used: schema.studios.photosUsed, limit: schema.studios.photosLimit }).from(schema.studios).where(eq(schema.studios.id, imp.studioId)).limit(1)
  const unit = imp.quality === 'original' ? 2 : 1
  let room = Math.min(studio ? studio.limit - studio.used : 0, (ev.photoLimit - ev.photoCount) * unit)

  const byAlbum = new Map<string, { item: ItemRow; file: StoredFile }[]>()
  let skipped = 0
  let failed = 0
  for (const it of items) {
    const skip = async (error: string) => { await setItem(env, it.id, { status: 'skipped', error }); skipped++ }
    if (!liveAlbums.has(it.albumId)) { await skip('The album was deleted'); continue }
    if (already.has(it.fileId)) { await skip('Already in this event'); continue }
    if (room < unit) { await skip('No room left on the plan or in the event'); continue }
    let file: DriveFile
    try {
      file = await getFile(env, imp.studioId, it.fileId)
    } catch (e) {
      if (e instanceof DriveFileMissing) { await skip('Gone from Drive, or no longer shared with Frameline'); continue }
      throw e
    }
    const why = file.trashed ? 'In the Drive trash' : notImportable({ mimeType: file.mimeType, size: Number(file.size ?? 0) })
    if (why) { await skip(why); continue }
    const photoId = newId('ph')
    const key = objectKey(imp.studioId, ev.id, photoId, file.name)
    try {
      const size = await copyToR2(env, imp.studioId, file, key)
      const webCopy = await webCopyFromThumbnail(env, imp.studioId, file, key)
      const meta = file.imageMediaMetadata
      const stored: StoredFile = {
        photoId, filename: file.name, size, key, width: meta?.width, height: meta?.height, capturedAt: exifTime(meta?.time), driveFileId: file.id, webCopy,
      }
      byAlbum.set(it.albumId, [...(byAlbum.get(it.albumId) ?? []), { item: it, file: stored }])
      already.add(file.id)
      room -= unit
    } catch (e) {
      await env.MEDIA.delete([key, webCopyKey(key)]).catch(() => undefined)
      if (e instanceof DriveBusy || e instanceof DriveRevoked) {
        // Photos copied so far in this message still go in; the rest are retried (or the import fails).
        await tally(env, imp.id, { done: await addCopied(env, imp, ev, byAlbum, uploader), skipped })
        throw e
      }
      await setItem(env, it.id, { status: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : 'Copy failed' })
      failed++
    }
  }
  await tally(env, imp.id, { done: await addCopied(env, imp, ev, byAlbum, uploader), skipped, failed })
  await publishTopics(env, imp.studioId, ['photos', 'albums', 'events', 'usage', 'misc']).catch(() => undefined)
}

const countOf = (m: Map<string, unknown[]>) => [...m.values()].reduce((n, l) => n + l.length, 0)

/** Turns the copied files into photos; returns how many. */
async function addCopied(env: Env, imp: ImportRow, ev: typeof schema.events.$inferSelect, byAlbum: Map<string, { item: ItemRow; file: StoredFile }[]>, uploader: string): Promise<number> {
  const n = countOf(byAlbum)
  for (const [albumId, list] of byAlbum) {
    if (!list.length) continue
    await addPhotos(env, {
      event: ev, albumId, studioId: imp.studioId, quality: imp.quality, uploaderName: uploader,
      options: { source: 'drive', uploadedBy: uploader, watermark: imp.watermark || undefined }, files: list.map((l) => l.file),
    })
    for (const l of list) await setItem(env, l.item.id, { status: 'done', photoId: l.file.photoId })
  }
  if (n) await queuePartnerNotice(env, ev.id, 'photos').catch(() => undefined)
  byAlbum.clear()
  return n
}
