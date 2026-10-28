import { eq, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { AppError, NotConfigured } from '../lib/errors'
import { seal, unseal } from '../lib/seal'

/**
 * Google Drive for one studio (docs/GOOGLE_DRIVE_PLAN.md). Only the `drive.file` scope: files the studio picks in
 * the Google Picker, and files and folders Frameline makes. The refresh token is sealed in D1; access tokens are
 * cached in KV until about 5 minutes before they run out.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
/** Fields every file read asks for. */
export const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,parents,trashed,thumbnailLink,imageMediaMetadata(width,height,time)'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  md5Checksum?: string
  parents?: string[]
  trashed?: boolean
  thumbnailLink?: string
  imageMediaMetadata?: { width?: number; height?: number; time?: string }
}

/** Google OAuth client + the sealing key. Without them nothing Drive-related is offered. */
export const driveConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DRIVE_TOKEN_KEY)
/** Importing also needs the Picker's browser key. */
export const drivePickerOn = (env: Env) => driveConfigured(env) && !!env.GOOGLE_PICKER_API_KEY

export function assertDriveConfigured(env: Env) {
  if (!driveConfigured(env)) throw new NotConfigured('Google Drive', 'Google Drive is not set up on this server (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and DRIVE_TOKEN_KEY).')
}

/** Google refused the stored token: access was removed in the Google account, or the password changed. */
export class DriveRevoked extends AppError {
  constructor() { super(409, 'drive_revoked', 'Reconnect Google Drive', 'Google Drive is no longer connected. Reconnect it in Settings → Google Drive.') }
}
export class DriveNotConnected extends AppError {
  constructor() { super(409, 'drive_not_connected', 'Connect Google Drive', 'Connect Google Drive first, in Settings → Google Drive.') }
}
export class DriveFull extends AppError {
  constructor() { super(409, 'drive_full', 'Google Drive is full', 'The connected Google Drive has no space left. Free some space or buy more Google storage, then try again.') }
}
export class DriveFileMissing extends AppError {
  constructor(id: string) { super(404, 'drive_file_missing', 'Not found', `The Google Drive file ${id} is gone, or Frameline may no longer open it.`) }
}
/** Rate limit or a Google outage: try again later (the queue retries with backoff). */
export class DriveBusy extends AppError {
  constructor(detail = 'Google Drive is busy. Try again in a minute.') { super(503, 'drive_busy', 'Service unavailable', detail) }
}

type Connection = typeof schema.driveConnections.$inferSelect

export async function getConnection(env: Env, studioId: string): Promise<Connection | null> {
  const [row] = await getDb(env.DB).select().from(schema.driveConnections).where(eq(schema.driveConnections.studioId, studioId)).limit(1)
  return row ?? null
}

export async function requireConnection(env: Env, studioId: string): Promise<Connection> {
  assertDriveConfigured(env)
  const conn = await getConnection(env, studioId)
  if (!conn) throw new DriveNotConnected()
  if (conn.status === 'revoked') throw new DriveRevoked()
  return conn
}

export const sealToken = (env: Env, token: string) => seal(env.DRIVE_TOKEN_KEY!, token)

const tokenCacheKey = (studioId: string) => `drive:at:${studioId}`

export async function markRevoked(env: Env, studioId: string) {
  await getDb(env.DB).update(schema.driveConnections).set({ status: 'revoked' }).where(eq(schema.driveConnections.studioId, studioId)).run()
  await env.KV.delete(tokenCacheKey(studioId))
}

/** A current access token for the studio's Drive (cached), refreshing it when needed. */
export async function accessToken(env: Env, studioId: string, opts: { fresh?: boolean } = {}): Promise<{ token: string; expiresAt: string }> {
  if (!opts.fresh) {
    const cached = await env.KV.get<{ token: string; expiresAt: string }>(tokenCacheKey(studioId), 'json')
    if (cached && Date.parse(cached.expiresAt) - Date.now() > 60_000) return cached
  }
  const conn = await requireConnection(env, studioId)
  const refreshToken = await unseal(env.DRIVE_TOKEN_KEY!, conn.refreshTokenEnc)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  }).catch(() => null)
  if (!res) throw new DriveBusy()
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !body.access_token) {
    if (body.error === 'invalid_grant' || body.error === 'unauthorized_client') {
      await markRevoked(env, studioId)
      throw new DriveRevoked()
    }
    throw new DriveBusy('Google didn’t give a Drive token. Try again in a minute.')
  }
  const life = Math.max(120, body.expires_in ?? 3600)
  const out = { token: body.access_token, expiresAt: new Date(Date.now() + life * 1000).toISOString() }
  await env.KV.put(tokenCacheKey(studioId), JSON.stringify(out), { expirationTtl: Math.max(60, life - 300) })
  return out
}

/** Turns a Drive API error into one of ours. */
async function driveError(res: Response, fileId?: string): Promise<AppError> {
  const text = await res.text().catch(() => '')
  let reason = ''
  try { reason = (JSON.parse(text) as { error?: { errors?: { reason?: string }[] } }).error?.errors?.[0]?.reason ?? '' } catch { /* not JSON */ }
  if (reason === 'storageQuotaExceeded' || (reason === 'quotaExceeded' && /storage/i.test(text))) return new DriveFull()
  if (res.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded' || res.status >= 500) return new DriveBusy()
  if (res.status === 404 || reason === 'notFound' || reason === 'appNotAuthorizedToFile' || reason === 'insufficientFilePermissions') return new DriveFileMissing(fileId ?? '?')
  console.error(JSON.stringify({ level: 'error', msg: 'drive api error', status: res.status, body: text.slice(0, 500) }))
  return new AppError(502, 'drive_error', 'Bad gateway', 'Google Drive didn’t accept the request. Try again.')
}

/** An authenticated Drive call; a 401 gets one retry with a fresh token, a second one marks the connection revoked. */
export async function driveFetch(env: Env, studioId: string, url: string, init: RequestInit = {}, fileId?: string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await accessToken(env, studioId, { fresh: attempt > 0 })
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(url, { ...init, headers }).catch(() => null)
    if (!res) throw new DriveBusy()
    if (res.status === 401) {
      if (attempt === 0) continue
      await markRevoked(env, studioId)
      throw new DriveRevoked()
    }
    if (!res.ok && res.status !== 308) throw await driveError(res, fileId)
    return res
  }
  throw new DriveRevoked()
}

export async function getFile(env: Env, studioId: string, fileId: string): Promise<DriveFile> {
  const res = await driveFetch(env, studioId, `${API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`, {}, fileId)
  return (await res.json()) as DriveFile
}

/** The file's bytes, streamed. */
export async function downloadFile(env: Env, studioId: string, fileId: string, init: { range?: string } = {}): Promise<Response> {
  return driveFetch(env, studioId, `${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, init.range ? { headers: { Range: init.range } } : {}, fileId)
}

/** Every non-trashed child of a folder Frameline may open (with drive.file, only picked or Frameline-made files). */
export async function listChildren(env: Env, studioId: string, folderId: string, max = 10_000): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({
      q: `'${folderId.replace(/'/g, '')}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`, pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await driveFetch(env, studioId, `${API}/files?${q}`, {}, folderId)
    const page = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string }
    out.push(...(page.files ?? []))
    pageToken = page.nextPageToken
  } while (pageToken && out.length < max)
  return out.slice(0, max)
}

export async function createFolder(env: Env, studioId: string, name: string, parentId?: string): Promise<string> {
  const res = await driveFetch(env, studioId, `${API}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.slice(0, 200), mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  })
  return ((await res.json()) as { id: string }).id
}

/** The folder still exists and isn't in the trash. */
async function folderAlive(env: Env, studioId: string, id: string): Promise<boolean> {
  try { const f = await getFile(env, studioId, id); return !f.trashed } catch (e) { if (e instanceof DriveFileMissing) return false; throw e }
}

/** "Frameline" at the top of the studio's Drive (re-made if they deleted it). */
export async function ensureRootFolder(env: Env, studioId: string): Promise<string> {
  const conn = await requireConnection(env, studioId)
  if (conn.rootFolderId && await folderAlive(env, studioId, conn.rootFolderId)) return conn.rootFolderId
  const id = await createFolder(env, studioId, 'Frameline')
  await getDb(env.DB).update(schema.driveConnections).set({ rootFolderId: id }).where(eq(schema.driveConnections.studioId, studioId)).run()
  return id
}

type EventRow = Pick<typeof schema.events.$inferSelect, 'id' | 'studioId' | 'name' | 'date' | 'driveFolderId'>
type AlbumRow = Pick<typeof schema.albums.$inferSelect, 'id' | 'name' | 'driveFolderId'>

/** Frameline / <Event name> (<date>) / <Album>: the folder an album's originals go to, made when first needed. */
export async function ensureAlbumFolder(env: Env, ev: EventRow, album: AlbumRow): Promise<string> {
  const db = getDb(env.DB)
  let eventFolder = ev.driveFolderId
  if (!eventFolder || !(await folderAlive(env, ev.studioId, eventFolder))) {
    const root = await ensureRootFolder(env, ev.studioId)
    eventFolder = await createFolder(env, ev.studioId, `${ev.name} (${ev.date.slice(0, 10)})`, root)
    await db.update(schema.events).set({ driveFolderId: eventFolder }).where(eq(schema.events.id, ev.id)).run()
    ev.driveFolderId = eventFolder
  }
  if (album.driveFolderId && await folderAlive(env, ev.studioId, album.driveFolderId)) {
    const f = await getFile(env, ev.studioId, album.driveFolderId)
    if (f.parents?.includes(eventFolder)) return album.driveFolderId
  }
  const id = await createFolder(env, ev.studioId, album.name, eventFolder)
  await db.update(schema.albums).set({ driveFolderId: id }).where(eq(schema.albums.id, album.id)).run()
  album.driveFolderId = id
  return id
}

/**
 * Opens a resumable upload into `parentId` and returns its session URI. The browser then PUTs the bytes straight to
 * Google. `origin` (the admin app's) is sent so Google answers the browser's PUTs with CORS headers.
 */
export async function startResumableUpload(env: Env, studioId: string, f: { name: string; mimeType: string; size: number; parentId: string; origin?: string }): Promise<string> {
  const res = await driveFetch(env, studioId, `${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent('id,name,size,md5Checksum,parents')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': f.mimeType,
      'X-Upload-Content-Length': String(f.size),
      ...(f.origin ? { Origin: f.origin } : {}),
    },
    body: JSON.stringify({ name: f.name, parents: [f.parentId] }),
  })
  const location = res.headers.get('location')
  if (!location) throw new AppError(502, 'drive_error', 'Bad gateway', 'Google Drive didn’t open the upload. Try again.')
  return location
}

/** Revokes the refresh token at Google (best effort: a token already revoked is fine). */
export async function revokeAtGoogle(env: Env, conn: Connection): Promise<void> {
  try {
    const token = await unseal(env.DRIVE_TOKEN_KEY!, conn.refreshTokenEnc)
    await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) })
  } catch { /* already gone */ }
  await env.KV.delete(tokenCacheKey(conn.studioId))
}

/** Photos and videos Frameline takes from Drive (the same as upload: no RAW, no SVG). */
export const IMPORTABLE = /^image\/(jpeg|png|webp|heic|heif)$/i
export const MAX_IMPORT_FILE_BYTES = 200 * 1024 * 1024

/**
 * Daily spot check: a few Drive originals per connected studio still exist. The count of missing ones shows in
 * Settings → Google Drive, so a studio that tidied its Drive learns that guests now get web copies instead.
 */
export async function checkDriveFiles(env: Env, sample = 25): Promise<void> {
  if (!driveConfigured(env)) return
  const db = getDb(env.DB)
  const conns = await db.select().from(schema.driveConnections).where(eq(schema.driveConnections.status, 'ok'))
  for (const conn of conns) {
    const rows = await db.all<{ id: string; f: string }>(sql`SELECT id, drive_file_id AS f FROM photos
      WHERE studio_id = ${conn.studioId} AND storage = 'drive' AND drive_file_id IS NOT NULL AND deleted_at IS NULL AND copied_from IS NULL
      ORDER BY random() LIMIT ${sample}`)
    let missing = 0
    try {
      for (const r of rows) {
        try { const f = await getFile(env, conn.studioId, r.f); if (f.trashed) missing++ } catch (e) { if (e instanceof DriveFileMissing) missing++; else throw e }
      }
    } catch (e) {
      if (e instanceof DriveRevoked || e instanceof DriveBusy) continue
      throw e
    }
    await db.update(schema.driveConnections).set({ missingFiles: missing, checkedAt: new Date().toISOString() }).where(eq(schema.driveConnections.studioId, conn.studioId)).run()
  }
}
