import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import type { DriveImport, DriveItem } from '@frameline/shared'
import type { AppEnv, Env } from '../env'
import { getDb, schema } from '../db/client'
import { AppError, NotFound, ValidationFailed } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { audit } from './audit'
import { FOLDER_MIME, DriveFileMissing, accessToken, assertDriveConfigured, drivePickerOn, getFile, listChildren, requireConnection, type DriveFile } from './drive'
import { importOut, notImportable, queueImport } from './drive-import'
import { emit } from './realtime'

/**
 * The Drive import's two steps, shared by the admin app's routes (routes/drive.ts) and Studio AutoPilot's
 * (routes/integrations.ts), so a studio importing from either place gets the same albums, checks and limits.
 */

export const MAX_IMPORT_ITEMS = 5000
const MAX_EXPAND_FILES = 5000
const MAX_FOLDER_DEPTH = 3

type EventRow = typeof schema.events.$inferSelect

export interface ImportRequest {
  name: string
  quality: 'web' | 'original'
  watermark: boolean
  items: { fileId: string; name: string; size: number; mimeType: string; albumId?: string; albumName?: string }[]
}

/** What Google's file picker needs in the browser: a short-lived drive.file token, the Picker's key, the project number. */
export async function pickerConfig(env: Env, studioId: string) {
  if (!drivePickerOn(env)) assertDriveConfigured(env)
  if (!env.GOOGLE_PICKER_API_KEY) throw new AppError(501, 'not_configured', 'Not configured', 'Choosing files from Google Drive isn’t set up on this server (GOOGLE_PICKER_API_KEY).')
  const t = await accessToken(env, studioId)
  return { accessToken: t.token, expiresAt: t.expiresAt, apiKey: env.GOOGLE_PICKER_API_KEY, ...(env.GOOGLE_PROJECT_NUMBER ? { appId: env.GOOGLE_PROJECT_NUMBER } : {}) }
}

const itemOf = (f: DriveFile, folderPath?: string): DriveItem => {
  const size = Number(f.size ?? 0)
  const reason = f.trashed ? 'In the Drive trash' : notImportable({ mimeType: f.mimeType, size })
  return { id: f.id, name: f.name, mimeType: f.mimeType, size, ...(folderPath ? { folderPath } : {}), importable: !reason, ...(reason ? { reason } : {}) }
}

/**
 * What picked Drive items hold: each file, and every file inside each folder down to three levels with its folder
 * path. A folder Google won't let us list (drive.file) comes back in `closedFolders`.
 */
export async function expandPicked(env: Env, studioId: string, ids: string[]) {
  await requireConnection(env, studioId)
  const items: DriveItem[] = []
  const closedFolders: { id: string; name: string }[] = []
  const seen = new Set<string>()
  const walk = async (folder: DriveFile, path: string, depth: number) => {
    const children = await listChildren(env, studioId, folder.id, MAX_EXPAND_FILES - items.length)
    if (!children.length && depth === 0) { closedFolders.push({ id: folder.id, name: folder.name }); return }
    for (const ch of children) {
      if (items.length >= MAX_EXPAND_FILES) return
      if (ch.mimeType === FOLDER_MIME) { if (depth < MAX_FOLDER_DEPTH) await walk(ch, `${path}/${ch.name}`, depth + 1); continue }
      if (seen.has(ch.id)) continue
      seen.add(ch.id)
      items.push(itemOf(ch, path))
    }
  }
  for (const id of ids) {
    if (items.length >= MAX_EXPAND_FILES) break
    let f: DriveFile
    try { f = await getFile(env, studioId, id) } catch (e) { if (e instanceof DriveFileMissing) continue; throw e }
    if (f.mimeType === FOLDER_MIME) await walk(f, f.name, 0)
    else if (!seen.has(f.id)) { seen.add(f.id); items.push(itemOf(f)) }
  }
  return { items, closedFolders }
}

/**
 * Starts copying picked files into an event: makes any new albums (an album of that name is reused), checks the plan
 * and the event have room, and queues the copy. A file already in the event, or listed twice, comes in once.
 */
export async function startImport(c: Context<AppEnv>, ev: EventRow, userId: string, input: ImportRequest): Promise<DriveImport> {
  const db = getDb(c.env.DB)
  const studioId = ev.studioId
  await requireConnection(c.env, studioId)

  const albums = await db.select().from(schema.albums).where(and(eq(schema.albums.eventId, ev.id), isNull(schema.albums.deletedAt)))
  const byId = new Map(albums.filter((a) => a.kind === 'album').map((a) => [a.id, a]))
  const byName = new Map(albums.filter((a) => a.kind === 'album').map((a) => [a.name.toLowerCase(), a.id]))
  const badAlbum = input.items.find((i) => i.albumId && !byId.has(i.albumId))
  if (badAlbum) throw new ValidationFailed([{ field: 'items.albumId', in: 'body', message: `Album ${badAlbum.albumId} isn’t in this event`, code: 'unknown_album' }])

  const unique = [...new Map(input.items.map((i) => [i.fileId, i])).values()]
  const have = new Set<string>()
  for (let i = 0; i < unique.length; i += 90) {
    const part = unique.slice(i, i + 90).map((u) => u.fileId)
    for (const r of await db.select({ f: schema.photos.driveFileId }).from(schema.photos).where(and(eq(schema.photos.eventId, ev.id), isNull(schema.photos.deletedAt), sql`${schema.photos.driveFileId} IN (SELECT value FROM json_each(${JSON.stringify(part)}))`))) if (r.f) have.add(r.f)
  }
  const wanted = unique.filter((i) => !have.has(i.fileId) && !notImportable({ mimeType: i.mimeType, size: i.size }))
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId)).limit(1)
  const cost = wanted.length * (input.quality === 'original' ? 2 : 1)
  if (cost && studio.photosUsed + cost > studio.photosLimit) {
    throw new AppError(402, 'quota_exceeded', 'Photo quota exceeded', `This import needs room for ${cost} photos but your plan has ${Math.max(0, studio.photosLimit - studio.photosUsed)} left. Add a photo pack or upgrade, or import fewer photos.`)
  }
  if (ev.photoCount + wanted.length > ev.photoLimit) {
    const left = Math.max(0, ev.photoLimit - ev.photoCount)
    throw new AppError(402, 'event_limit_reached', 'Event photo limit reached', `${ev.name} has room for ${left} more ${left === 1 ? 'photo' : 'photos'}. Add a photo pack to this event, or import fewer photos.`)
  }

  const now = nowIso()
  let created = 0
  const top = albums.filter((a) => a.kind === 'album').reduce((n, a) => Math.max(n, a.order), 0)
  for (const name of new Set(wanted.filter((i) => i.albumName).map((i) => i.albumName!))) {
    if (byName.has(name.toLowerCase())) continue
    const id = newId('al')
    await db.insert(schema.albums).values({ id, eventId: ev.id, studioId, name, order: top + ++created, photoCount: 0, kind: 'album', createdAt: now }).run()
    byName.set(name.toLowerCase(), id)
  }

  const importId = newId('di')
  const skippedItems = unique.length - wanted.length + (input.items.length - unique.length)
  await db.insert(schema.driveImports).values({
    id: importId, studioId, eventId: ev.id, userId, name: input.name, quality: input.quality, watermark: input.watermark,
    status: wanted.length ? 'running' : 'done', total: input.items.length, skipped: skippedItems, albumsCreated: created, createdAt: now,
    ...(wanted.length ? {} : { finishedAt: now }),
  }).run()
  const rows = wanted.map((i) => ({
    id: newId('dii'), importId, fileId: i.fileId, name: i.name, size: i.size, mimeType: i.mimeType,
    albumId: i.albumId ?? byName.get(i.albumName!.toLowerCase())!, status: 'waiting' as const,
  }))
  for (let i = 0; i < rows.length; i += 50) await db.batch(rows.slice(i, i + 50).map((r) => db.insert(schema.driveImportItems).values(r)) as [never, ...never[]])
  await queueImport(c.env, { id: importId, studioId }, rows.map((r) => r.id))
  audit(c, 'drive.import', { type: 'event', id: ev.id }, { files: wanted.length, skipped: skippedItems, albumsCreated: created }, userId)
  emit(c, studioId, 'albums', 'misc')
  const [imp] = await db.select().from(schema.driveImports).where(eq(schema.driveImports.id, importId)).limit(1)
  return importOut(imp)
}

/**
 * Stops a running import of the studio's: photos already copied stay, the rest are skipped. `allow` refuses an
 * import of an event the caller may not see (it throws).
 */
export async function stopImport(c: Context<AppEnv>, studioId: string, importId: string, allow: (eventId: string) => void): Promise<DriveImport> {
  const db = getDb(c.env.DB)
  const t = schema.driveImports
  const [imp] = await db.select().from(t).where(and(eq(t.id, importId), eq(t.studioId, studioId))).limit(1)
  if (!imp) throw new NotFound('Import', importId)
  allow(imp.eventId)
  if (imp.status === 'running') {
    const items = schema.driveImportItems
    const waiting = await db.select({ id: items.id }).from(items).where(and(eq(items.importId, imp.id), eq(items.status, 'waiting')))
    await db.batch([
      db.update(items).set({ status: 'skipped', error: 'Import stopped' }).where(and(eq(items.importId, imp.id), eq(items.status, 'waiting'))),
      db.update(t).set({ status: 'cancelled', finishedAt: nowIso(), skipped: sql`${t.skipped} + ${waiting.length}` }).where(eq(t.id, imp.id)),
    ])
    emit(c, studioId, 'misc')
  }
  const [out] = await db.select().from(t).where(eq(t.id, imp.id)).limit(1)
  return importOut(out)
}
