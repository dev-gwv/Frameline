import { createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import type { DriveItem, DriveStatus } from '@frameline/shared'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { eventOut } from '../db/mappers'
import { AppError, BadRequest, NotFound, ValidationFailed } from '../lib/errors'
import { randomToken, toBase64Url } from '../lib/crypto'
import { newId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { membershipOf, requireStudio, userOf } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { PhotoEvent } from '../schemas/domain'
import { assertEventVisible } from '../services/access'
import { audit } from '../services/audit'
import {
  DRIVE_SCOPE, FOLDER_MIME, accessToken, assertDriveConfigured, driveConfigured, drivePickerOn, getConnection, getFile, listChildren,
  requireConnection, revokeAtGoogle, sealToken, DriveFileMissing, type DriveFile,
} from '../services/drive'
import { importOut, notImportable, queueImport } from '../services/drive-import'
import { eventForMember } from '../services/events'
import { emit } from '../services/realtime'

/**
 * Google Drive (docs/GOOGLE_DRIVE_PLAN.md): connect a studio's Drive (scope drive.file only), import picked files,
 * and keep an event's originals in that Drive.
 */
export const driveRoutes = createRouter()

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'
const MAX_IMPORT_ITEMS = 5000
const MAX_EXPAND_FILES = 5000
const MAX_FOLDER_DEPTH = 3

const callbackUrl = (c: Context<AppEnv>) => `${(c.env.API_PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '')}/v1/drive/callback`
const settingsUrl = (c: Context<AppEnv>, q: Record<string, string>) => `${c.env.APP_URL.replace(/\/$/, '')}/settings/drive?${new URLSearchParams(q)}`

const DriveStatusSchema = z.object({
  available: z.boolean(), picker: z.boolean(), connected: z.boolean(),
  email: z.string().optional(), status: z.enum(['ok', 'revoked']).optional(), connectedAt: z.string().optional(),
  defaultForNewEvents: z.boolean(), missingFiles: z.number().int(),
}).openapi('DriveStatus')

async function statusOf(c: Context<AppEnv>, studioId: string): Promise<DriveStatus> {
  const conn = driveConfigured(c.env) ? await getConnection(c.env, studioId) : null
  return {
    available: driveConfigured(c.env), picker: drivePickerOn(c.env), connected: !!conn,
    ...(conn ? { email: conn.email, status: conn.status, connectedAt: conn.connectedAt } : {}),
    defaultForNewEvents: conn?.defaultForNewEvents ?? false, missingFiles: conn?.missingFiles ?? 0,
  }
}

driveRoutes.openapi(createRoute({
  method: 'get', path: '/drive', tags: ['Google Drive'], summary: 'The studio’s Google Drive connection',
  security, middleware: [requireStudio('uploader')] as const,
  responses: { 200: json(DriveStatusSchema), ...problems(401, 403) },
}), async (c) => c.json(await statusOf(c, membershipOf(c).studioId), 200))

driveRoutes.openapi(createRoute({
  method: 'post', path: '/drive/connect', tags: ['Google Drive'], summary: 'Start connecting Google Drive (owner)',
  description: 'Returns Google’s consent page for the drive.file scope (files the studio picks, and folders Frameline makes). Open it in the browser; Google comes back to /v1/drive/callback, which returns to the admin app’s Settings → Google Drive.',
  security, middleware: [requireStudio('owner', 'connect Google Drive')] as const,
  responses: { 200: json(z.object({ authorizationUrl: z.string() })), ...problems(401, 403, 501) },
}), async (c) => {
  assertDriveConfigured(c.env)
  const m = membershipOf(c)
  const me = userOf(c)
  const state = randomToken(24)
  const verifier = randomToken(48)
  const challenge = toBase64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  await c.env.KV.put(`drive:oauth:${state}`, JSON.stringify({ verifier, studioId: m.studioId, userId: me.id }), { expirationTtl: 600 })
  const url = new URL(GOOGLE_AUTH)
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(c), response_type: 'code',
    scope: `openid email ${DRIVE_SCOPE}`, state, code_challenge: challenge, code_challenge_method: 'S256',
    // Offline + consent: Google returns a refresh token every time, so a reconnect always replaces a dead one.
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  }).toString()
  return c.json({ authorizationUrl: url.toString() }, 200)
})

driveRoutes.openapi(createRoute({
  method: 'get', path: '/drive/callback', tags: ['Google Drive'], summary: 'Google’s redirect after Drive consent',
  request: { query: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional(), scope: z.string().optional() }) },
  responses: { 302: { description: 'Back to Settings → Google Drive' }, ...problems(400, 501) },
}), async (c) => {
  assertDriveConfigured(c.env)
  const { code, state, error } = c.req.valid('query')
  if (error) return c.redirect(settingsUrl(c, { drive_error: error === 'access_denied' ? 'cancelled' : 'google' }), 302)
  if (!code || !state) throw new BadRequest('Missing code or state.', 'oauth_invalid')
  const stored = await c.env.KV.get<{ verifier: string; studioId: string; userId: string }>(`drive:oauth:${state}`, 'json')
  if (!stored) return c.redirect(settingsUrl(c, { drive_error: 'expired' }), 302)
  await c.env.KV.delete(`drive:oauth:${state}`)
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET!, redirect_uri: callbackUrl(c),
      grant_type: 'authorization_code', code_verifier: stored.verifier,
    }),
  })
  const tokens = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; expires_in?: number }
  if (!tokenRes.ok || !tokens.access_token) return c.redirect(settingsUrl(c, { drive_error: 'google' }), 302)
  // Google's consent screen lets people untick Drive: without it there is nothing to connect.
  if (!tokens.scope?.split(' ').includes(DRIVE_SCOPE)) return c.redirect(settingsUrl(c, { drive_error: 'scope' }), 302)
  if (!tokens.refresh_token) return c.redirect(settingsUrl(c, { drive_error: 'google' }), 302)
  const info = (await (await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json().catch(() => ({}))) as { sub?: string; email?: string }
  if (!info.sub || !info.email) return c.redirect(settingsUrl(c, { drive_error: 'google' }), 302)

  const db = getDb(c.env.DB)
  const t = schema.driveConnections
  const old = await getConnection(c.env, stored.studioId)
  const row = {
    studioId: stored.studioId, googleSub: info.sub, email: info.email, refreshTokenEnc: await sealToken(c.env, tokens.refresh_token), scope: tokens.scope,
    // The same Google account keeps its Frameline folder; another account starts afresh.
    rootFolderId: old?.googleSub === info.sub ? old.rootFolderId : null,
    status: 'ok' as const, connectedBy: stored.userId, connectedAt: nowIso(), missingFiles: 0,
  }
  await db.insert(t).values(row).onConflictDoUpdate({ target: t.studioId, set: row }).run()
  if (old && old.googleSub !== info.sub) {
    // Folders made in the other account's Drive don't exist in this one.
    await db.update(schema.events).set({ driveFolderId: null }).where(eq(schema.events.studioId, stored.studioId)).run()
    await db.update(schema.albums).set({ driveFolderId: null }).where(eq(schema.albums.studioId, stored.studioId)).run()
  }
  await c.env.KV.put(`drive:at:${stored.studioId}`, JSON.stringify({ token: tokens.access_token, expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString() }), { expirationTtl: Math.max(60, (tokens.expires_in ?? 3600) - 300) })
  audit(c, 'drive.connect', { type: 'studio', id: stored.studioId }, { email: info.email }, stored.userId)
  emit(c, stored.studioId, 'studio')
  return c.redirect(settingsUrl(c, { drive: 'connected' }), 302)
})

driveRoutes.openapi(createRoute({
  method: 'patch', path: '/drive', tags: ['Google Drive'], summary: 'Change Google Drive settings (owner)',
  security, middleware: [requireStudio('owner', 'change Google Drive settings')] as const,
  request: { body: body(z.object({ defaultForNewEvents: z.boolean() }).strict()) },
  responses: { 200: json(DriveStatusSchema), ...problems(401, 403, 409, 422, 501) },
}), async (c) => {
  const m = membershipOf(c)
  await requireConnection(c.env, m.studioId)
  await getDb(c.env.DB).update(schema.driveConnections).set(c.req.valid('json')).where(eq(schema.driveConnections.studioId, m.studioId)).run()
  emit(c, m.studioId, 'studio')
  return c.json(await statusOf(c, m.studioId), 200)
})

driveRoutes.openapi(createRoute({
  method: 'delete', path: '/drive', tags: ['Google Drive'], summary: 'Disconnect Google Drive (owner)',
  description: 'Revokes Frameline’s access at Google. Files already in Drive stay there. Events that kept originals in Drive go back to Frameline storage for new uploads; their photos still show (web copies), and full-size downloads give the web copy until Drive is connected again.',
  security, middleware: [requireStudio('owner', 'disconnect Google Drive')] as const,
  responses: { 204: NoContent, ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const conn = await getConnection(c.env, m.studioId)
  if (conn) {
    if (driveConfigured(c.env)) await revokeAtGoogle(c.env, conn)
    const db = getDb(c.env.DB)
    await db.delete(schema.driveConnections).where(eq(schema.driveConnections.studioId, m.studioId)).run()
    await db.update(schema.events).set({ originalsIn: 'frameline' }).where(eq(schema.events.studioId, m.studioId)).run()
    await db.update(schema.driveImports).set({ status: 'cancelled', finishedAt: nowIso() }).where(and(eq(schema.driveImports.studioId, m.studioId), eq(schema.driveImports.status, 'running'))).run()
    audit(c, 'drive.disconnect', { type: 'studio', id: m.studioId })
    emit(c, m.studioId, 'studio', 'events', 'misc')
  }
  return c.body(null, 204)
})

driveRoutes.openapi(createRoute({
  method: 'get', path: '/drive/picker', tags: ['Google Drive'], summary: 'What the Google Picker needs (editors)',
  description: 'A short-lived access token for the connected Drive (drive.file), the Picker’s browser key and the Cloud project number.',
  security, middleware: [requireStudio('editor', 'import from Google Drive')] as const,
  responses: { 200: json(z.object({ accessToken: z.string(), expiresAt: z.string(), apiKey: z.string(), appId: z.string().optional() }).openapi('DrivePickerConfig')), ...problems(401, 403, 409, 501) },
}), async (c) => {
  if (!drivePickerOn(c.env)) assertDriveConfigured(c.env)
  if (!c.env.GOOGLE_PICKER_API_KEY) throw new AppError(501, 'not_configured', 'Not configured', 'Choosing files from Google Drive isn’t set up on this server (GOOGLE_PICKER_API_KEY).')
  const m = membershipOf(c)
  const t = await accessToken(c.env, m.studioId)
  c.header('Cache-Control', 'no-store')
  return c.json({ accessToken: t.token, expiresAt: t.expiresAt, apiKey: c.env.GOOGLE_PICKER_API_KEY, ...(c.env.GOOGLE_PROJECT_NUMBER ? { appId: c.env.GOOGLE_PROJECT_NUMBER } : {}) }, 200)
})

const DriveItemSchema = z.object({
  id: z.string(), name: z.string(), mimeType: z.string(), size: z.number(), folderPath: z.string().optional(), importable: z.boolean(), reason: z.string().optional(),
}).openapi('DriveItem')

const itemOf = (f: DriveFile, folderPath?: string): DriveItem => {
  const size = Number(f.size ?? 0)
  const reason = f.trashed ? 'In the Drive trash' : notImportable({ mimeType: f.mimeType, size })
  return { id: f.id, name: f.name, mimeType: f.mimeType, size, ...(folderPath ? { folderPath } : {}), importable: !reason, ...(reason ? { reason } : {}) }
}

driveRoutes.openapi(createRoute({
  method: 'post', path: '/drive/expand', tags: ['Google Drive'], summary: 'List what picked Drive items hold (editors)',
  description: 'For each picked file: the file. For each picked folder: every file inside, down to three levels, with its folder path (each folder becomes an album). Google may not let Frameline list a picked folder’s contents (scope drive.file); those come back in `closedFolders`, and the studio picks the photos inside instead.',
  security, middleware: [requireStudio('editor', 'import from Google Drive')] as const,
  request: { body: body(z.object({ ids: z.array(z.string().regex(/^[\w-]{10,200}$/)).min(1).max(500) })) },
  responses: { 200: json(z.object({ items: z.array(DriveItemSchema), closedFolders: z.array(z.object({ id: z.string(), name: z.string() })) })), ...problems(401, 403, 409, 422, 501, 503) },
}), async (c) => {
  const m = membershipOf(c)
  await requireConnection(c.env, m.studioId)
  const items: DriveItem[] = []
  const closedFolders: { id: string; name: string }[] = []
  const seen = new Set<string>()
  const walk = async (folder: DriveFile, path: string, depth: number) => {
    const children = await listChildren(c.env, m.studioId, folder.id, MAX_EXPAND_FILES - items.length)
    if (!children.length && depth === 0) { closedFolders.push({ id: folder.id, name: folder.name }); return }
    for (const ch of children) {
      if (items.length >= MAX_EXPAND_FILES) return
      if (ch.mimeType === FOLDER_MIME) { if (depth < MAX_FOLDER_DEPTH) await walk(ch, `${path}/${ch.name}`, depth + 1); continue }
      if (seen.has(ch.id)) continue
      seen.add(ch.id)
      items.push(itemOf(ch, path))
    }
  }
  for (const id of c.req.valid('json').ids) {
    if (items.length >= MAX_EXPAND_FILES) break
    let f: DriveFile
    try { f = await getFile(c.env, m.studioId, id) } catch (e) { if (e instanceof DriveFileMissing) continue; throw e }
    if (f.mimeType === FOLDER_MIME) await walk(f, f.name, 0)
    else if (!seen.has(f.id)) { seen.add(f.id); items.push(itemOf(f)) }
  }
  return c.json({ items, closedFolders }, 200)
})

const DriveImportSchema = z.object({
  id: z.string(), eventId: z.string(), name: z.string(), status: z.enum(['running', 'done', 'failed', 'cancelled']),
  total: z.number().int(), done: z.number().int(), skipped: z.number().int(), failed: z.number().int(), albumsCreated: z.number().int(),
  quality: z.enum(['web', 'original']), watermark: z.boolean(), createdAt: z.string(), finishedAt: z.string().optional(), error: z.string().optional(),
}).openapi('DriveImport')

const ImportInput = z.object({
  name: z.string().trim().min(1).max(200),
  quality: z.enum(['web', 'original']).default('original'),
  watermark: z.boolean().default(false),
  items: z.array(z.object({
    fileId: z.string().regex(/^[\w-]{10,200}$/), name: z.string().trim().min(1).max(255), size: z.number().int().min(0), mimeType: z.string().max(200),
    albumId: z.string().max(128).optional(), albumName: z.string().trim().min(1).max(120).optional(),
  }).refine((i) => !!i.albumId !== !!i.albumName, { message: 'Give each file an albumId or an albumName' })).min(1).max(MAX_IMPORT_ITEMS),
}).openapi('DriveImportInput')

driveRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/drive-imports', tags: ['Google Drive'], summary: 'Import picked Google Drive files (editors)',
  description: 'Makes any new albums (by name; an album of that name is reused), checks the plan and event have room, and copies the files in the background (they count against the plan like uploads; a file already in the event is skipped). Progress: GET …/drive-imports.',
  security, middleware: [requireStudio('editor', 'import from Google Drive'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader, body: body(ImportInput) },
  responses: { 201: json(DriveImportSchema, 'Import started'), ...problems(401, 402, 403, 404, 409, 422, 501) },
}), async (c) => {
  const m = membershipOf(c)
  const me = userOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  await requireConnection(c.env, m.studioId)
  const input = c.req.valid('json')

  // Albums: the given ids must be this event's; names reuse an album of that name or make one.
  const albums = await db.select().from(schema.albums).where(and(eq(schema.albums.eventId, ev.id), isNull(schema.albums.deletedAt)))
  const byId = new Map(albums.filter((a) => a.kind === 'album').map((a) => [a.id, a]))
  const byName = new Map(albums.filter((a) => a.kind === 'album').map((a) => [a.name.toLowerCase(), a.id]))
  const badAlbum = input.items.find((i) => i.albumId && !byId.has(i.albumId))
  if (badAlbum) throw new ValidationFailed([{ field: 'items.albumId', in: 'body', message: `Album ${badAlbum.albumId} isn’t in this event`, code: 'unknown_album' }])

  // A file already in the event, or listed twice, comes in once.
  const unique = [...new Map(input.items.map((i) => [i.fileId, i])).values()]
  const have = new Set<string>()
  for (let i = 0; i < unique.length; i += 90) {
    const part = unique.slice(i, i + 90).map((u) => u.fileId)
    for (const r of await db.select({ f: schema.photos.driveFileId }).from(schema.photos).where(and(eq(schema.photos.eventId, ev.id), isNull(schema.photos.deletedAt), sql`${schema.photos.driveFileId} IN (SELECT value FROM json_each(${JSON.stringify(part)}))`))) if (r.f) have.add(r.f)
  }
  const wanted = unique.filter((i) => !have.has(i.fileId) && !notImportable({ mimeType: i.mimeType, size: i.size }))
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
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
    await db.insert(schema.albums).values({ id, eventId: ev.id, studioId: m.studioId, name, order: top + ++created, photoCount: 0, kind: 'album', createdAt: now }).run()
    byName.set(name.toLowerCase(), id)
  }

  const importId = newId('di')
  const skippedItems = unique.length - wanted.length + (input.items.length - unique.length)
  await db.insert(schema.driveImports).values({
    id: importId, studioId: m.studioId, eventId: ev.id, userId: me.id, name: input.name, quality: input.quality, watermark: input.watermark,
    status: wanted.length ? 'running' : 'done', total: input.items.length, skipped: skippedItems, albumsCreated: created, createdAt: now,
    ...(wanted.length ? {} : { finishedAt: now }),
  }).run()
  const rows = wanted.map((i) => ({
    id: newId('dii'), importId, fileId: i.fileId, name: i.name, size: i.size, mimeType: i.mimeType,
    albumId: i.albumId ?? byName.get(i.albumName!.toLowerCase())!, status: 'waiting' as const,
  }))
  for (let i = 0; i < rows.length; i += 50) await db.batch(rows.slice(i, i + 50).map((r) => db.insert(schema.driveImportItems).values(r)) as [never, ...never[]])
  await queueImport(c.env, { id: importId, studioId: m.studioId }, rows.map((r) => r.id))
  audit(c, 'drive.import', { type: 'event', id: ev.id }, { files: wanted.length, skipped: skippedItems, albumsCreated: created })
  emit(c, m.studioId, 'albums', 'misc')
  const [imp] = await db.select().from(schema.driveImports).where(eq(schema.driveImports.id, importId)).limit(1)
  return c.json(importOut(imp), 201)
})

driveRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/drive-imports', tags: ['Google Drive'], summary: 'The event’s Google Drive imports, newest first',
  security, middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam },
  responses: { 200: json(z.object({ items: z.array(DriveImportSchema) })), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const rows = await db.select().from(schema.driveImports).where(eq(schema.driveImports.eventId, ev.id)).orderBy(desc(schema.driveImports.createdAt)).limit(30)
  return c.json({ items: rows.map(importOut) }, 200)
})

driveRoutes.openapi(createRoute({
  method: 'delete', path: '/drive-imports/{id}', tags: ['Google Drive'], summary: 'Stop an import (editors)',
  description: 'Photos already copied stay; the rest are skipped.',
  security, middleware: [requireStudio('editor', 'import from Google Drive')] as const,
  request: { params: IdParam },
  responses: { 200: json(DriveImportSchema), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const t = schema.driveImports
  const [imp] = await db.select().from(t).where(and(eq(t.id, c.req.valid('param').id), eq(t.studioId, m.studioId))).limit(1)
  if (!imp) throw new NotFound('Import', c.req.valid('param').id)
  assertEventVisible(m, imp.eventId)
  if (imp.status === 'running') {
    const items = schema.driveImportItems
    const waiting = await db.select({ id: items.id }).from(items).where(and(eq(items.importId, imp.id), eq(items.status, 'waiting')))
    await db.batch([
      db.update(items).set({ status: 'skipped', error: 'Import stopped' }).where(and(eq(items.importId, imp.id), eq(items.status, 'waiting'))),
      db.update(t).set({ status: 'cancelled', finishedAt: nowIso(), skipped: sql`${t.skipped} + ${waiting.length}` }).where(eq(t.id, imp.id)),
    ])
    emit(c, m.studioId, 'misc')
  }
  const [out] = await db.select().from(t).where(eq(t.id, imp.id)).limit(1)
  return c.json(importOut(out), 200)
})

driveRoutes.openapi(createRoute({
  method: 'put', path: '/events/{id}/originals', tags: ['Google Drive'], summary: 'Where the event keeps new full-size files (editors)',
  description: '`drive`: new uploads go to the studio’s Google Drive (Frameline / <event> / <album>), with only the 2048 px web copy kept by Frameline. Photos already uploaded stay where they are.',
  security, middleware: [requireStudio('editor', 'change event settings')] as const,
  request: { params: IdParam, body: body(z.object({ in: z.enum(['frameline', 'drive']) }).strict()) },
  responses: { 200: json(PhotoEvent), ...problems(401, 403, 404, 409, 422, 501) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const where = c.req.valid('json').in
  if (where === 'drive') await requireConnection(c.env, m.studioId)
  await db.update(schema.events).set({ originalsIn: where }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.originals', { type: 'event', id: ev.id }, { in: where })
  emit(c, m.studioId, 'events')
  const [row] = await db.select().from(schema.events).where(eq(schema.events.id, ev.id)).limit(1)
  return c.json(eventOut(row), 200)
})

