import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, max, ne, sql, type SQL } from 'drizzle-orm'
import { ENHANCE_COST, hash, tone } from '@frameline/shared'
import { getDb, schema, type DB } from '../db/client'
import { albumOut, photoOut, zipOut } from '../db/mappers'
import { toMinor } from '../lib/money'
import { debitWallet } from '../services/billing'
import { BadRequest, Conflict, NotFound, ValidationFailed } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { Album, Photo, ZipRequest } from '../schemas/domain'
import { assertEventVisible, type Membership } from '../services/access'
import { audit } from '../services/audit'
import { albumForMember, eventForMember, recountStatements } from '../services/events'
import { emit } from '../services/realtime'

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
  const rows = await db.select().from(a).where(and(eq(a.eventId, ev.id), isNull(a.deletedAt), afterCursor(a.order, a.id, 'asc', cursor)))
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
  return c.json(albumOut({ ...album, coverPhotoId: null, firstCapture: null, lastCapture: null, deletedAt: null }), 201)
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

photoRoutes.openapi(createRoute({
  method: 'delete', path: '/albums/{id}', tags: ['Albums'], summary: 'Move an album and its photos to the trash', security,
  description: 'Restore it with POST /albums/{id}/restore; after 30 days the daily job deletes it for good.',
  middleware: [requireStudio('editor', 'delete albums')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const album = await albumForMember(db, m, c.req.valid('param').id)
  const at = nowIso()
  const p = schema.photos
  await db.batch([
    db.update(schema.albums).set({ deletedAt: at }).where(eq(schema.albums.id, album.id)),
    // Same stamp as the album, so restoring the album brings back exactly these photos.
    db.update(p).set({ deletedAt: at }).where(and(eq(p.albumId, album.id), isNull(p.deletedAt))),
    ...recountStatements(db, album.eventId),
  ])
  audit(c, 'album.trash', { type: 'album', id: album.id }, { name: album.name })
  emit(c, m.studioId, 'albums', 'events', 'photos')
  return c.body(null, 204)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/albums/{id}/restore', tags: ['Albums'], summary: 'Restore an album from the trash', security,
  description: 'Brings back the album and the photos that were trashed with it.',
  middleware: [requireStudio('editor', 'restore albums'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader },
  responses: { 200: json(Album), ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const album = await albumForMember(db, m, c.req.valid('param').id, { includeDeleted: true })
  if (!album.deletedAt) throw new Conflict('This album isn’t in the trash.', 'not_deleted')
  const p = schema.photos
  await db.batch([
    db.update(schema.albums).set({ deletedAt: null }).where(eq(schema.albums.id, album.id)),
    db.update(p).set({ deletedAt: null }).where(and(eq(p.albumId, album.id), eq(p.deletedAt, album.deletedAt))),
    ...recountStatements(db, album.eventId),
  ])
  audit(c, 'album.restore', { type: 'album', id: album.id })
  emit(c, m.studioId, 'albums', 'events', 'photos')
  const [fresh] = await db.select().from(schema.albums).where(eq(schema.albums.id, album.id)).limit(1)
  return c.json(albumOut(fresh), 200)
})

// ── Photos ─────────────────────────────────────────────────────────────────
type PhotoFilterQuery = { albumId?: string; filter?: 'all' | 'people' | 'favourites' | 'hidden'; personId?: string }

/** Shared WHERE for the photo list and the id list. No albumId = every regular album (guest uploads excluded). Trash is never included. */
export function photoFilter(eventId: string, q: PhotoFilterQuery): SQL {
  const p = schema.photos
  const conds: (SQL | undefined)[] = [eq(p.eventId, eventId), isNull(p.deletedAt)]
  if (q.albumId) conds.push(eq(p.albumId, q.albumId))
  else conds.push(sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${eventId} AND kind = 'album' AND deleted_at IS NULL)`)
  if (q.filter === 'hidden') conds.push(eq(p.hidden, true))
  else if (q.filter === 'favourites') conds.push(gt(p.favourites, 0))
  else if (q.filter === 'people') conds.push(ne(p.faces, '[]' as never))
  if (q.personId) conds.push(sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${q.personId})`)
  return and(...conds)!
}

export type PhotoSortKey = 'capture' | 'newest' | 'name' | 'sequence'
export const sortColumn = (sort?: PhotoSortKey) => sort === 'name' ? schema.photos.filename : sort === 'sequence' ? schema.photos.index : schema.photos.capturedAt
/** 'newest' is capture time descending; every other sort is ascending. */
export const sortDir = (sort?: PhotoSortKey): 'asc' | 'desc' => (sort === 'newest' ? 'desc' : 'asc')
export const PhotoSortEnum = z.enum(['capture', 'newest', 'name', 'sequence']).openapi({ description: 'capture = oldest first, newest = latest capture first, name = file name, sequence = upload order.' })
const PhotoQuery = PageQuery.extend({
  albumId: z.string().max(128).optional().openapi({ description: 'Omit for all regular albums (guest uploads excluded).' }),
  sort: PhotoSortEnum.default('capture'),
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
  const base = photoFilter(ev.id, q)
  const sortCol = sortColumn(q.sort)
  const dir = sortDir(q.sort)
  const order = dir === 'desc' ? [desc(sortCol), desc(p.id)] : [asc(sortCol), asc(p.id)]
  const keyOf = (r: typeof p.$inferSelect): [string | number, string] => [q.sort === 'name' ? r.filename : q.sort === 'sequence' ? r.index : r.capturedAt, r.id]

  const [{ total }] = await db.select({ total: count() }).from(p).where(base)
  let query = db.select().from(p).where(and(base, afterCursor(sortCol, p.id, dir, q.cursor))).orderBy(...order).limit(q.limit + 1)
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
  const [row] = await getDb(c.env.DB).select().from(schema.photos).where(and(eq(schema.photos.id, id), eq(schema.photos.studioId, m.studioId), isNull(schema.photos.deletedAt))).limit(1)
  if (!row) throw new NotFound('Photo', id)
  assertEventVisible(m, row.eventId)
  return c.json(photoOut(row, c.env.PUBLIC_MEDIA_BASE), 200)
})

const Ids = z.array(z.string().min(1).max(128)).min(1).max(500)

/** The caller's photos among `ids` (trash excluded unless `trashed`: then only trashed ones). */
async function photosOwned(db: DB, m: Membership, ids: string[], opts: { trashed?: boolean } = {}) {
  const p = schema.photos
  const found: { id: string; eventId: string; albumId: string; deletedAt: string | null }[] = []
  for (const part of chunk([...new Set(ids)])) {
    found.push(...await db.select({ id: p.id, eventId: p.eventId, albumId: p.albumId, deletedAt: p.deletedAt }).from(p)
      .where(and(eq(p.studioId, m.studioId), inArray(p.id, part), opts.trashed ? isNotNull(p.deletedAt) : isNull(p.deletedAt))))
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
  method: 'post', path: '/photos/bulk-delete', tags: ['Photos'], summary: 'Move photos to the trash', security,
  description: 'Trashed photos disappear from lists and galleries. Restore them with POST /photos/restore; after 30 days the daily job deletes them with their files and face data.',
  middleware: [requireStudio('editor', 'delete photos'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ ids: Ids })) },
  responses: { 200: json(z.object({ deleted: z.number().int() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const found = await photosOwned(db, m, c.req.valid('json').ids)
  const at = nowIso()
  const p = schema.photos
  for (const part of chunk(found.map((f) => f.id))) await db.update(p).set({ deletedAt: at }).where(and(inArray(p.id, part), isNull(p.deletedAt))).run()
  for (const e of new Set(found.map((f) => f.eventId))) await db.batch(recountStatements(db, e))
  audit(c, 'photos.trash', undefined, { count: found.length })
  emit(c, m.studioId, 'photos', 'albums', 'events')
  return c.json({ deleted: found.length }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/photos/restore', tags: ['Photos'], summary: 'Restore photos from the trash', security,
  description: 'Ids that aren’t in the trash are ignored. A photo whose album is also in the trash brings that album back.',
  middleware: [requireStudio('editor', 'restore photos'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ ids: Ids })) },
  responses: { 200: json(z.object({ restored: z.number().int() })), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const found = await photosOwned(db, m, c.req.valid('json').ids, { trashed: true })
  const p = schema.photos
  for (const part of chunk(found.map((f) => f.id))) await db.update(p).set({ deletedAt: null }).where(inArray(p.id, part)).run()
  const albumIds = [...new Set(found.map((f) => f.albumId))]
  for (const part of chunk(albumIds)) await db.update(schema.albums).set({ deletedAt: null }).where(and(inArray(schema.albums.id, part), isNotNull(schema.albums.deletedAt))).run()
  for (const e of new Set(found.map((f) => f.eventId))) await db.batch(recountStatements(db, e))
  audit(c, 'photos.restore', undefined, { count: found.length })
  emit(c, m.studioId, 'photos', 'albums', 'events')
  return c.json({ restored: found.length }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/photos/rotate', tags: ['Photos'], summary: 'Turn photos clockwise', security,
  description: '`degrees` is a multiple of 90 (−90 turns left). Stored as `rotation` (0/90/180/270); renditions and downloads follow it.',
  middleware: [requireStudio('editor', 'edit photos'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ ids: Ids, degrees: z.number().int().min(-270).max(270).refine((d) => d % 90 === 0 && d !== 0, 'Turn by 90, 180 or 270 degrees (negative turns left)') })) },
  responses: { 200: json(z.object({ updated: z.number().int() })), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { ids, degrees } = c.req.valid('json')
  const found = await photosOwned(db, m, ids)
  const p = schema.photos
  for (const part of chunk(found.map((f) => f.id))) {
    await db.update(p).set({ rotation: sql`(((${p.rotation} + ${degrees}) % 360) + 360) % 360` }).where(inArray(p.id, part)).run()
  }
  emit(c, m.studioId, 'photos')
  return c.json({ updated: found.length }, 200)
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
  const [photo] = await db.select().from(schema.photos).where(and(eq(schema.photos.id, photoId), eq(schema.photos.eventId, ev.id), isNull(schema.photos.deletedAt))).limit(1)
  if (!photo) throw new NotFound('Photo', photoId)
  if (scope === 'event') {
    await db.update(schema.events).set({ coverPhotoId: photo.id, coverTones: [photo.tone, ev.coverTones[1], ev.coverTones[2]] }).where(eq(schema.events.id, ev.id)).run()
  } else {
    await db.update(schema.albums).set({ coverPhotoId: photo.id }).where(eq(schema.albums.id, photo.albumId)).run()
  }
  emit(c, m.studioId, 'events', 'albums')
  return c.body(null, 204)
})


const MAX_IDS = 20_000

photoRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/photo-ids', tags: ['Photos'], summary: 'Every matching photo id (select-all, viewer navigation)', security,
  description: `Same filters and sort as the photo list, ids only, up to ${MAX_IDS}.`,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam, query: PhotoQuery.omit({ limit: true, cursor: true, offset: true }) },
  responses: { 200: json(z.object({ ids: z.array(z.string()), truncated: z.boolean() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const q = c.req.valid('query')
  const p = schema.photos
  const sortCol = sortColumn(q.sort)
  const order = sortDir(q.sort) === 'desc' ? [desc(sortCol), desc(p.id)] : [asc(sortCol), asc(p.id)]
  const rows = await db.select({ id: p.id }).from(p).where(photoFilter(ev.id, q)).orderBy(...order).limit(MAX_IDS + 1)
  return c.json({ ids: rows.slice(0, MAX_IDS).map((r) => r.id), truncated: rows.length > MAX_IDS }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/photos/copy', tags: ['Photos'], summary: 'Copy photos into another album of the same event', security,
  description: 'Copies share the original file (no extra storage, no extra photo credits).',
  middleware: [requireStudio('editor', 'copy photos'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ ids: Ids, albumId: z.string().max(128) })) },
  responses: { 201: json(z.object({ items: z.array(Photo) }), 'Copied'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { ids, albumId } = c.req.valid('json')
  const target = await albumForMember(db, m, albumId)
  const found = await photosOwned(db, m, ids)
  if (found.some((f) => f.eventId !== target.eventId)) {
    throw new ValidationFailed([{ field: 'albumId', in: 'body', message: 'Photos can only be copied to an album of the same event', code: 'cross_event_copy' }])
  }
  const p = schema.photos
  const [{ top }] = await db.select({ top: max(p.index) }).from(p).where(eq(p.albumId, target.id))
  const sources: (typeof p.$inferSelect)[] = []
  for (const part of chunk(found.map((f) => f.id))) sources.push(...await db.select().from(p).where(inArray(p.id, part)))
  const order = new Map(ids.map((id, i) => [id, i]))
  sources.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  const now = nowIso()
  const copies = sources.map((src, i) => ({ ...src, id: newId('ph'), albumId: target.id, index: (top ?? 0) + i + 1, favourites: 0, downloads: 0, views: 0, createdAt: now }))
  const faceRows = copies.flatMap((cp, i) => sources[i].faces.map((f) => ({ id: newId('fc'), photoId: cp.id, eventId: cp.eventId, personId: f.personId, box: f.box, vectorId: null })))
  if (copies.length) {
    const [first, ...rest] = recountStatements(db, target.eventId)
    await db.batch([...copies.map((r) => db.insert(p).values(r)), ...faceRows.map((f) => db.insert(schema.faces).values(f)), first, ...rest] as unknown as [typeof first])
  }
  emit(c, m.studioId, 'photos', 'albums', 'events')
  return c.json({ items: copies.map((r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE)) }, 201)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/photos/review', tags: ['Photos'], summary: 'Approve or reject guest uploads (or send them back to review)', security,
  description: '`approved` shows them to guests, `rejected` keeps them out of the gallery for good, `pending` sends them back to review (Undo).',
  middleware: [requireStudio('editor', 'review guest uploads')] as const,
  request: { body: body(z.object({ ids: Ids, status: z.enum(['approved', 'pending', 'rejected']) })) },
  responses: { 200: json(z.object({ updated: z.number().int() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { ids, status } = c.req.valid('json')
  const found = await photosOwned(db, m, ids)
  for (const part of chunk(found.map((f) => f.id))) await db.update(schema.photos).set({ reviewStatus: status }).where(inArray(schema.photos.id, part)).run()
  audit(c, `photos.review_${status}`, undefined, { count: found.length })
  emit(c, m.studioId, 'photos', 'albums')
  return c.json({ updated: found.length }, 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/photos/{id}/enhance', tags: ['Photos'], summary: 'AI-enhance a photo', security,
  description: `Takes ₹${ENHANCE_COST} from the wallet (ledger \`credits-used\`, 402 \`insufficient_credits\` when the wallet is short). \`saveAs: new\` adds an enhanced copy next to the original; \`replace\` re-renders the photo in place. The processor applies the preset/prompt (simulated in dev).`,
  middleware: [requireStudio('editor', 'enhance photos'), idempotent] as const,
  request: {
    params: IdParam, headers: IdempotencyHeader,
    body: body(z.object({ preset: z.string().max(40).optional(), prompt: z.string().max(500).optional(), saveAs: z.enum(['new', 'replace']) })
      .refine((b) => b.preset || b.prompt, { message: 'Pick a preset or describe the edit', path: ['preset'] })),
  },
  responses: { 200: json(Photo), ...problems(401, 402, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const id = c.req.valid('param').id
  const o = c.req.valid('json')
  const p = schema.photos
  const [src] = await db.select().from(p).where(and(eq(p.id, id), eq(p.studioId, m.studioId), isNull(p.deletedAt))).limit(1)
  if (!src) throw new NotFound('Photo', id)
  const label = o.prompt ? `“${o.prompt.slice(0, 40)}”` : o.preset!
  await debitWallet(db, m.studioId, toMinor(ENHANCE_COST), `AI enhance · ${src.filename} (${label})`)
  const shifted = tone(hash(`${id}:${label}`))
  let resultId = id
  if (o.saveAs === 'new') {
    const [{ top }] = await db.select({ top: max(p.index) }).from(p).where(eq(p.albumId, src.albumId))
    resultId = newId('ph')
    await db.insert(p).values({
      ...src, id: resultId, index: (top ?? 0) + 1, filename: src.filename.replace(/(\.[^.]+)?$/, '-enhanced$1'), tone: shifted,
      favourites: 0, downloads: 0, views: 0, enhancedFrom: id, status: 'processing', createdAt: nowIso(),
    }).run()
    await db.batch(recountStatements(db, src.eventId))
  } else {
    await db.update(p).set({ tone: shifted, enhancedFrom: id, status: 'processing' }).where(eq(p.id, id)).run()
  }
  await c.env.PHOTO_QUEUE.send({ kind: 'process-photo', photoId: resultId, eventId: src.eventId, studioId: m.studioId, key: src.r2Key, quality: src.quality, enhance: { preset: o.preset, prompt: o.prompt } })
  audit(c, 'photos.enhance', { type: 'photo', id }, { saveAs: o.saveAs, label })
  emit(c, m.studioId, 'photos', 'albums', 'usage', 'misc')
  const [out] = await db.select().from(p).where(eq(p.id, resultId)).limit(1)
  return c.json(photoOut(out, c.env.PUBLIC_MEDIA_BASE), 200)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/faces/reindex', tags: ['People'], summary: 'Re-run face recognition for an event', security,
  middleware: [requireStudio('editor', 'reindex faces')] as const,
  request: { params: IdParam },
  responses: { 202: json(z.object({ queued: z.number().int() }), 'Queued'), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const p = schema.photos
  const rows = await db.select({ id: p.id, key: p.r2Key, quality: p.quality }).from(p).where(and(eq(p.eventId, ev.id), eq(p.status, 'ready'), isNull(p.deletedAt), isNotNull(p.r2Key)))
  // Face finding progress (event stats) counts these as pending until the processor is done with them.
  for (const part of chunk(rows.map((r) => r.id))) await db.update(p).set({ facesIndexedAt: null }).where(inArray(p.id, part)).run()
  const jobs = rows.map((r) => ({ body: { kind: 'process-photo' as const, photoId: r.id, eventId: ev.id, studioId: m.studioId, key: r.key, quality: r.quality, reindex: true } }))
  for (let i = 0; i < jobs.length; i += 100) await c.env.PHOTO_QUEUE.sendBatch(jobs.slice(i, i + 100))
  audit(c, 'faces.reindex', { type: 'event', id: ev.id }, { queued: jobs.length })
  emit(c, m.studioId, 'photos')
  return c.json({ queued: jobs.length }, 202)
})

photoRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/zips', tags: ['Photos'], summary: 'Email a ZIP of an event, album or selection', security,
  middleware: [requireStudio('editor', 'export photos'), idempotent] as const,
  request: {
    params: IdParam, headers: IdempotencyHeader,
    body: body(z.object({ email: z.email().max(254), albumId: z.string().max(128).optional(), photoIds: z.array(z.string().max(128)).max(5000).optional() })),
  },
  responses: { 202: json(ZipRequest, 'Queued'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const input = c.req.valid('json')
  let photoCount = input.photoIds?.length ?? 0
  if (!input.photoIds) {
    const [{ n }] = await db.select({ n: count() }).from(schema.photos).where(photoFilter(ev.id, { albumId: input.albumId }))
    photoCount = n
  }
  const row = {
    id: newId('zip'), studioId: m.studioId, eventId: ev.id, albumId: input.albumId ?? null, photoIds: input.photoIds ?? null, email: input.email,
    photoCount, status: 'queued' as const, requestedAt: nowIso(), readyAt: null, url: null,
  }
  await db.insert(schema.zipRequests).values(row).run()
  await c.env.PHOTO_QUEUE.send({ kind: 'build-zip', zipId: row.id, studioId: m.studioId })
  emit(c, m.studioId, 'misc')
  return c.json(zipOut(row), 202)
})

photoRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/zips', tags: ['Photos'], summary: 'ZIP requests for an event', security,
  middleware: [requireStudio('editor', 'export photos')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(ZipRequest, 'ZipPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.zipRequests
  const rows = await db.select().from(t).where(and(eq(t.eventId, ev.id), afterCursor(t.requestedAt, t.id, 'desc', cursor))).orderBy(desc(t.requestedAt), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.requestedAt, r.id], zipOut), 200)
})
