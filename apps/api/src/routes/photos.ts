import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, count, eq, gt, inArray, max, ne, sql, type SQL } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema, type DB } from '../db/client'
import { albumOut, photoOut } from '../db/mappers'
import { BadRequest, NotFound, ValidationFailed } from '../lib/errors'
import { background } from '../lib/http'
import { newId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { Album, Photo } from '../schemas/domain'
import { assertEventVisible, type Membership } from '../services/access'
import { audit } from '../services/audit'
import { albumForMember, eventForMember, recountStatements } from '../services/events'
import { emit } from '../services/realtime'
import { vectorIndex } from '../services/vectors'

export const photoRoutes = createRouter()

/** D1 allows 100 bound parameters per statement; chunk id lists well below that. */
export const chunk = <T>(xs: T[], n = 80): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

// ── Albums ─────────────────────────────────────────────────────────────────
photoRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/albums', tags: ['Albums'], summary: 'Albums of an event, in display order', security,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(Album, 'AlbumPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const a = schema.albums
  const rows = await db.select().from(a).where(and(eq(a.eventId, ev.id), afterCursor(a.order, a.id, 'asc', cursor)))
    .orderBy(asc(a.order), asc(a.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.order, r.id], albumOut), 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/albums', tags: ['Albums'], summary: 'Create an album', security,
  middleware: [requireStudio('editor', 'create albums'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader, body: body(z.object({ name: z.string().trim().min(1, 'Name the album').max(120) })) },
  responses: { 201: json(Album, 'Created'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const a = schema.albums
  const [{ top }] = await db.select({ top: max(a.order) }).from(a).where(and(eq(a.eventId, ev.id), eq(a.kind, 'album')))
  const album = {
    id: newId(`${ev.id}_al`), eventId: ev.id, studioId: m.studioId, name: c.req.valid('json').name, order: (top ?? -1) + 1,
    photoCount: 0, kind: 'album' as const, createdAt: nowIso(),
  }
  await db.insert(a).values(album).run()
  emit(c, m.studioId, 'albums')
  return c.json(albumOut({ ...album, coverPhotoId: null, firstCapture: null, lastCapture: null }), 201)
})

photoRoutes.openapi(createRoute({
  method: 'put', path: '/events/{id}/albums/order', tags: ['Albums'], summary: 'Reorder albums', security,
  description: 'Send every album id in the new order. Ids not in this event are ignored.',
  middleware: [requireStudio('editor', 'reorder albums')] as const,
  request: { params: IdParam, body: body(z.object({ ids: z.array(z.string().max(128)).min(1).max(200) })) },
  responses: { 204: NoContent, ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { ids } = c.req.valid('json')
  if (new Set(ids).size !== ids.length) throw new ValidationFailed([{ field: 'ids', in: 'body', message: 'Album ids must be unique', code: 'duplicate' }])
  const a = schema.albums
  const stmts = ids.map((id, i) => db.update(a).set({ order: i }).where(and(eq(a.id, id), eq(a.eventId, ev.id))))
  await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
  emit(c, m.studioId, 'albums')
  return c.body(null, 204)
})

photoRoutes.openapi(createRoute({
  method: 'patch', path: '/albums/{id}', tags: ['Albums'], summary: 'Rename an album', security,
  middleware: [requireStudio('editor', 'rename albums')] as const,
  request: { params: IdParam, body: body(z.object({ name: z.string().trim().min(1).max(120) })) },
  responses: { 200: json(Album), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const album = await albumForMember(db, m, c.req.valid('param').id)
  const { name } = c.req.valid('json')
  await db.update(schema.albums).set({ name }).where(eq(schema.albums.id, album.id)).run()
  emit(c, m.studioId, 'albums')
  return c.json(albumOut({ ...album, name }), 200)
})

async function purgeObjects(env: Env, keys: string[], vectorIds: string[]) {
  for (const part of chunk(keys, 1000)) if (part.length) await env.MEDIA.delete(part)
  const faces = vectorIndex(env)
  if (faces) for (const part of chunk(vectorIds, 1000)) if (part.length) await faces.deleteByIds(part).catch(() => undefined)
}

async function deletePhotoRows(c: Parameters<typeof background>[0], db: DB, where: SQL) {
  const p = schema.photos
  const doomed = await db.select({ id: p.id, key: p.r2Key, eventId: p.eventId }).from(p).where(where)
  if (!doomed.length) return new Set<string>()
  const vectorIds: string[] = []
  for (const ids of chunk(doomed.map((d) => d.id))) {
    const f = await db.select({ v: schema.faces.vectorId }).from(schema.faces).where(inArray(schema.faces.photoId, ids))
    vectorIds.push(...f.map((x) => x.v).filter((v): v is string => !!v))
    await db.delete(p).where(inArray(p.id, ids)).run()
  }
  const keys = doomed.flatMap((d) => (d.key ? [d.key] : []))
  background(c, purgeObjects(c.env, keys, vectorIds))
  return new Set(doomed.map((d) => d.eventId))
}

photoRoutes.openapi(createRoute({
  method: 'delete', path: '/albums/{id}', tags: ['Albums'], summary: 'Delete an album and its photos', security,
  middleware: [requireStudio('editor', 'delete albums')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const album = await albumForMember(db, m, c.req.valid('param').id)
  await deletePhotoRows(c, db, eq(schema.photos.albumId, album.id))
  await db.batch([db.delete(schema.albums).where(eq(schema.albums.id, album.id)), ...recountStatements(db, album.eventId)])
  audit(c, 'album.delete', { type: 'album', id: album.id }, { name: album.name })
  emit(c, m.studioId, 'albums', 'events', 'photos')
  return c.body(null, 204)
})

// ── Photos ─────────────────────────────────────────────────────────────────
const PhotoQuery = PageQuery.extend({
  albumId: z.string().max(128).optional().openapi({ description: 'Omit for all regular albums (guest uploads excluded).' }),
  sort: z.enum(['capture', 'name', 'sequence']).default('capture'),
  filter: z.enum(['all', 'people', 'favourites', 'hidden']).default('all'),
  personId: z.string().max(128).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional().openapi({ description: 'Legacy offset paging; prefer `cursor`.' }),
})

const PhotoPage = z.object({
  items: z.array(Photo), nextCursor: z.string().nullable(), total: z.number().int().openapi({ description: 'Matching photos across all pages.' }),
}).openapi('PhotoPage')

photoRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/photos', tags: ['Photos'], summary: 'List photos with sort, filter and cursor paging', security,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam, query: PhotoQuery },
  responses: { 200: json(PhotoPage), ...problems(400, 401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const q = c.req.valid('query')
  const p = schema.photos
  const conds: (SQL | undefined)[] = [eq(p.eventId, ev.id)]
  if (q.albumId) conds.push(eq(p.albumId, q.albumId))
  else conds.push(sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${ev.id} AND kind = 'album')`)
  if (q.filter === 'hidden') conds.push(eq(p.hidden, true))
  else if (q.filter === 'favourites') conds.push(gt(p.favourites, 0))
  else if (q.filter === 'people') conds.push(ne(p.faces, '[]' as never))
  if (q.personId) conds.push(sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${q.personId})`)
  const base = and(...conds)
  const sortCol = q.sort === 'name' ? p.filename : q.sort === 'sequence' ? p.index : p.capturedAt
  const keyOf = (r: typeof p.$inferSelect): [string | number, string] => [q.sort === 'name' ? r.filename : q.sort === 'sequence' ? r.index : r.capturedAt, r.id]

  const [{ total }] = await db.select({ total: count() }).from(p).where(base)
  let query = db.select().from(p).where(and(base, afterCursor(sortCol, p.id, 'asc', q.cursor))).orderBy(asc(sortCol), asc(p.id)).limit(q.limit + 1)
  if (q.offset !== undefined && !q.cursor) query = query.offset(q.offset) as typeof query
  const rows = await query
  const page = toPage(rows, q.limit, keyOf, (r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE))
  return c.json({ ...page, total }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'get', path: '/photos/{id}', tags: ['Photos'], summary: 'Get one photo', security,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam },
  responses: { 200: json(Photo), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const id = c.req.valid('param').id
  const [row] = await getDb(c.env.DB).select().from(schema.photos).where(and(eq(schema.photos.id, id), eq(schema.photos.studioId, m.studioId))).limit(1)
  if (!row) throw new NotFound('Photo', id)
  assertEventVisible(m, row.eventId)
  return c.json(photoOut(row, c.env.PUBLIC_MEDIA_BASE), 200)
})

const Ids = z.array(z.string().min(1).max(128)).min(1).max(500)

async function photosOwned(db: DB, m: Membership, ids: string[]) {
  const p = schema.photos
  const found: { id: string; eventId: string; albumId: string }[] = []
  for (const part of chunk([...new Set(ids)])) {
    found.push(...await db.select({ id: p.id, eventId: p.eventId, albumId: p.albumId }).from(p).where(and(eq(p.studioId, m.studioId), inArray(p.id, part))))
  }
  for (const f of found) assertEventVisible(m, f.eventId)
  return found
}

photoRoutes.openapi(createRoute({
  method: 'patch', path: '/photos', tags: ['Photos'], summary: 'Bulk update photos (hide/show, move to album)', security,
  middleware: [requireStudio('editor', 'edit photos')] as const,
  request: { body: body(z.object({ ids: Ids, patch: z.object({ hidden: z.boolean(), albumId: z.string().max(128) }).partial().strict() })) },
  responses: { 200: json(z.object({ updated: z.number().int() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { ids, patch } = c.req.valid('json')
  if (Object.keys(patch).length === 0) throw new BadRequest('Nothing to change: send `hidden` and/or `albumId`.', 'empty_patch')
  const found = await photosOwned(db, m, ids)
  const events = new Set(found.map((f) => f.eventId))
  if (patch.albumId) {
    const target = await albumForMember(db, m, patch.albumId)
    if (found.some((f) => f.eventId !== target.eventId)) {
      throw new ValidationFailed([{ field: 'patch.albumId', in: 'body', message: 'Photos can only move to an album of the same event', code: 'cross_event_move' }])
    }
  }
  const p = schema.photos
  for (const part of chunk(found.map((f) => f.id))) await db.update(p).set(patch).where(inArray(p.id, part)).run()
  if (patch.albumId) for (const e of events) await db.batch(recountStatements(db, e))
  emit(c, m.studioId, 'photos', 'albums', 'events')
  return c.json({ updated: found.length }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/photos/bulk-delete', tags: ['Photos'], summary: 'Delete photos (and their files and face data)', security,
  middleware: [requireStudio('editor', 'delete photos')] as const,
  request: { body: body(z.object({ ids: Ids })) },
  responses: { 200: json(z.object({ deleted: z.number().int() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const found = await photosOwned(db, m, c.req.valid('json').ids)
  const events = new Set<string>()
  for (const part of chunk(found.map((f) => f.id))) {
    for (const e of await deletePhotoRows(c, db, inArray(schema.photos.id, part))) events.add(e)
  }
  for (const e of events) await db.batch(recountStatements(db, e))
  audit(c, 'photos.delete', undefined, { count: found.length })
  emit(c, m.studioId, 'photos', 'albums', 'events')
  return c.json({ deleted: found.length }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'put', path: '/events/{id}/cover', tags: ['Photos'], summary: 'Set the event or album cover photo', security,
  middleware: [requireStudio('editor', 'set covers')] as const,
  request: { params: IdParam, body: body(z.object({ photoId: z.string().max(128), scope: z.enum(['event', 'album']) })) },
  responses: { 204: NoContent, ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { photoId, scope } = c.req.valid('json')
  const [photo] = await db.select().from(schema.photos).where(and(eq(schema.photos.id, photoId), eq(schema.photos.eventId, ev.id))).limit(1)
  if (!photo) throw new NotFound('Photo', photoId)
  if (scope === 'event') {
    await db.update(schema.events).set({ coverPhotoId: photo.id, coverTones: [photo.tone, ev.coverTones[1], ev.coverTones[2]] }).where(eq(schema.events.id, ev.id)).run()
  } else {
    await db.update(schema.albums).set({ coverPhotoId: photo.id }).where(eq(schema.albums.id, photo.albumId)).run()
  }
  emit(c, m.studioId, 'events', 'albums')
  return c.body(null, 204)
})

