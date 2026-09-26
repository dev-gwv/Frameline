import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { STORE_COMMISSION, hash } from '@frameline/shared'
import type { AppEnv, GuestClaims } from '../env'
import { getDb, schema } from '../db/client'
import { albumOut, enquiryOut, filmOut, orderOut, photoOut, publicStudioOut, studioOut } from '../db/mappers'
import { sha256Hex, timingSafeEqual } from '../lib/crypto'
import { AppError, Forbidden, NotFound, RateLimited, ServiceUnavailable, Unauthorized, ValidationFailed } from '../lib/errors'
import { background, clientIp } from '../lib/http'
import { newId, nowIso } from '../lib/ids'
import { signJwt } from '../lib/jwt'
import { toMajor } from '../lib/money'
import { IdempotencyHeader, NoContent, body, createRouter, json, problems } from '../lib/openapi'
import { afterCursor, encodeCursor } from '../lib/pagination'
import { guestFromRequest } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { limits, storeFor } from '../middleware/rate-limit'
import { Enquiry, GuestLinkPayload, GuestSession, Order, Photo, PublicEvent, StudioProfile } from '../schemas/domain'
import { addLedger } from '../services/billing'
import { resolveLink } from '../services/guest-links'
import { emit } from '../services/realtime'
import { vectorIndex } from '../services/vectors'
import { chunk } from './photos'

/**
 * Guest-facing API. Guest tokens (JWT aud=guest) come from POST …/pin, …/register or a VIP link and carry
 * { sub: eventId, sid: studioId, gid?: guestId, all?: true }. Rules:
 * - access 'link': no token needed; 'link-pin': a token for this event; 'registered': a token with a guest id
 * - face privacy on: browsing every photo needs `all` (typed PIN or VIP "all"); otherwise only your matched person
 */
export const publicRoutes = createRouter()
publicRoutes.use('*', limits.publicGallery)

const GUEST_TTL_SEC = 12 * 3600
const PIN_MAX_TRIES = 5
const PIN_LOCK_SEC = 900

const ShortIdParam = z.object({ shortId: z.string().regex(/^[0-9A-Fa-f]{7}$/, 'Gallery codes are 7 characters').openapi({ param: { name: 'shortId', in: 'path' }, example: '6402F9F' }) })
const CodeParam = z.object({ code: z.string().min(3).max(64).openapi({ param: { name: 'code', in: 'path' }, example: 'FA-KCGWHY' }) })

type EventRow = typeof schema.events.$inferSelect
type StudioRow = typeof schema.studios.$inferSelect

async function eventByShortId(c: Context<AppEnv>, shortId: string): Promise<{ e: EventRow; s: StudioRow }> {
  const [row] = await getDb(c.env.DB).select({ e: schema.events, s: schema.studios }).from(schema.events)
    .innerJoin(schema.studios, eq(schema.studios.id, schema.events.studioId))
    .where(eq(schema.events.shortId, shortId.toUpperCase())).limit(1)
  if (!row) throw new NotFound('Gallery', shortId.toUpperCase())
  return row
}

const blockedReason = (e: EventRow): z.infer<typeof PublicEvent>['blocked'] =>
  e.settings.disabled ? 'disabled' : e.status === 'archived' ? 'archived' : Date.parse(e.expiresAt) < Date.now() ? 'expired' : e.status === 'draft' && e.photoCount === 0 ? 'empty' : undefined

/** An open gallery (not blocked) or a problem explaining why not. */
async function openEvent(c: Context<AppEnv>, shortId: string) {
  const row = await eventByShortId(c, shortId)
  const blocked = blockedReason(row.e)
  if (blocked) throw new Forbidden(`This gallery is ${blocked === 'empty' ? 'not ready yet' : blocked}.`, `gallery_${blocked}`)
  return row
}

/** Checks the event's access rule against the (optional) guest token. */
async function guestAccess(c: Context<AppEnv>, e: EventRow): Promise<GuestClaims | null> {
  const g = await guestFromRequest(c)
  if (g && g.eventId !== e.id) throw new Forbidden('This gallery token belongs to a different event.', 'wrong_event')
  if (e.settings.access === 'link-pin' && !g) throw new Unauthorized('Enter the gallery PIN first.', 'pin_required')
  if (e.settings.access === 'registered' && !g?.guestId) throw new Unauthorized('Register with your name and email first.', 'registration_required')
  if (g) c.set('guest', g)
  return g
}

async function issueGuestSession(c: Context<AppEnv>, e: EventRow, opts: { guestId?: string; seeAll: boolean }) {
  const token = await signJwt(c.env.JWT_SECRET, { sub: e.id, aud: 'guest', sid: e.studioId, ...(opts.guestId ? { gid: opts.guestId } : {}), ...(opts.seeAll ? { all: true } : {}) }, GUEST_TTL_SEC)
  return { token, expiresIn: GUEST_TTL_SEC, eventId: e.id, shortId: e.shortId, ...(opts.guestId ? { guestId: opts.guestId } : {}), seeAll: opts.seeAll }
}

const visible = (p = schema.photos): SQL => and(eq(p.hidden, false), eq(p.status, 'ready'), or(isNull(p.reviewStatus), eq(p.reviewStatus, 'approved')))!

// ── Event landing ──────────────────────────────────────────────────────────
publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}', tags: ['Public gallery'], summary: 'Gallery landing: event, albums, films, studio branding',
  description: 'Always answers for a known code; `blocked` explains galleries that are turned off, archived, expired or still empty. The PIN is never included.',
  request: { params: ShortIdParam, query: z.object({ platform: z.enum(['web', 'android', 'ios']).default('web') }) },
  responses: { 200: json(PublicEvent), ...problems(404) },
}), async (c) => {
  const { e, s } = await eventByShortId(c, c.req.valid('param').shortId)
  const db = getDb(c.env.DB)
  const platform = c.req.valid('query').platform
  background(c, db.run(sql`UPDATE events SET visits = json_set(visits, ${'$.' + platform}, coalesce(json_extract(visits, ${'$.' + platform}), 0) + 1) WHERE id = ${e.id}`))
  const albums = await db.select().from(schema.albums).where(and(eq(schema.albums.eventId, e.id), sql`${schema.albums.kind} != 'store'`)).orderBy(asc(schema.albums.order))
  const films = await db.select().from(schema.films).where(eq(schema.films.eventId, e.id)).orderBy(asc(schema.films.createdAt))
  let coverUrl: string | undefined
  if (e.coverPhotoId) {
    const [cp] = await db.select().from(schema.photos).where(eq(schema.photos.id, e.coverPhotoId)).limit(1)
    if (cp) coverUrl = photoOut(cp, c.env.PUBLIC_MEDIA_BASE).url
  }
  const { pin: _pin, ...settings } = e.settings
  const blocked = blockedReason(e)
  return c.json({
    id: e.id, shortId: e.shortId, name: e.name, type: e.type as z.infer<typeof PublicEvent>['type'], date: e.date, ...(e.endDate ? { endDate: e.endDate } : {}),
    city: e.city, status: e.status, photoCount: e.photoCount, expiresAt: e.expiresAt, coverTones: e.coverTones,
    ...(e.coverPhotoId ? { coverPhotoId: e.coverPhotoId } : {}), ...(coverUrl ? { coverUrl } : {}), highlights: e.highlights,
    settings, albums: albums.map(albumOut), films: films.map(filmOut), studio: publicStudioOut(s), ...(blocked ? { blocked } : {}),
  }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/pin', tags: ['Public gallery'], summary: 'Check the gallery PIN and get a guest token',
  description: `${PIN_MAX_TRIES} wrong PINs lock this gallery for ${PIN_LOCK_SEC / 60} minutes (per device IP). A typed PIN lets the guest browse every photo.`,
  request: { params: ShortIdParam, body: body(z.object({ pin: z.string().trim().min(1).max(10) })) },
  responses: { 200: json(GuestSession), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const existing = await guestFromRequest(c).catch(() => null)
  const guestId = existing?.eventId === e.id ? existing.guestId : undefined
  if (e.settings.access !== 'link-pin') return c.json(await issueGuestSession(c, e, { guestId, seeAll: true }), 200)
  const key = `pin-fail:${clientIp(c)}:${e.id}`
  const store = storeFor(c.env, { windowSec: PIN_LOCK_SEC })
  const lock = await c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(key)).peek(PIN_MAX_TRIES, PIN_LOCK_SEC * 1000)
  if (!lock.success) throw new RateLimited(lock.reset, 'Too many wrong PINs. Try again in 15 minutes, or ask the photographer.', 'pin_locked')
  if (!timingSafeEqual(c.req.valid('json').pin, e.settings.pin)) {
    const d = await store.hit(key, PIN_MAX_TRIES, PIN_LOCK_SEC)
    const left = Math.max(0, d.remaining)
    if (left === 0) throw new RateLimited(d.reset, 'Too many wrong PINs. Try again in 15 minutes, or ask the photographer.', 'pin_locked')
    throw new Unauthorized(`That PIN is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'invalid_pin', { attemptsRemaining: left })
  }
  return c.json(await issueGuestSession(c, e, { guestId, seeAll: true }), 200)
})

const GuestOut = z.object({
  id: z.string(), eventId: z.string(), name: z.string(), email: z.string(), phone: z.string(), role: z.enum(['guest', 'host', 'client']),
  favourites: z.array(z.string()), lastActive: z.string(), registeredAt: z.string(),
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/register', tags: ['Public gallery'], summary: 'Register as a guest (appears in the studio’s Guests list)',
  description: 'Send the PIN session token (if any) so a typed PIN keeps its "see all" right.',
  request: { params: ShortIdParam, body: body(z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254), phone: z.string().max(40).optional() })) },
  responses: { 200: json(GuestSession.extend({ guest: GuestOut })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const prior = await guestFromRequest(c).catch(() => null)
  if (prior && prior.eventId !== e.id) throw new Forbidden('This gallery token belongs to a different event.', 'wrong_event')
  if (e.settings.access === 'link-pin' && !prior) throw new Unauthorized('Enter the gallery PIN first.', 'pin_required')
  const input = c.req.valid('json')
  const db = getDb(c.env.DB)
  const email = input.email.toLowerCase()
  const now = nowIso()
  let [g] = await db.select().from(schema.guests).where(and(eq(schema.guests.eventId, e.id), eq(schema.guests.email, email))).limit(1)
  if (g) {
    g = { ...g, name: input.name, phone: input.phone ?? g.phone, lastActive: now }
    await db.update(schema.guests).set({ name: g.name, phone: g.phone, lastActive: now }).where(eq(schema.guests.id, g.id)).run()
  } else {
    g = { id: newId('g'), eventId: e.id, name: input.name, email, phone: input.phone ?? '', role: 'guest', favourites: [], lastActive: now, registeredAt: now }
    await db.batch([
      db.insert(schema.guests).values(g),
      db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'registration', title: `${input.name} registered`, detail: e.name, at: now }),
    ])
    emit(c, e.studioId, 'guests', 'activity')
  }
  const seeAll = prior?.all === true || !e.settings.facePrivacy || !e.settings.faceSearch
  return c.json({ ...(await issueGuestSession(c, e, { guestId: g.id, seeAll })), guest: g }, 200)
})

// ── Photos, faces, favourites, downloads ────────────────────────────────────
const PublicPhotoQuery = z.object({
  albumId: z.string().max(128).optional(),
  personId: z.string().max(128).optional(),
  sort: z.enum(['capture', 'name', 'sequence']).default('capture'),
  highlights: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
  cursor: z.string().max(512).optional(),
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}/photos', tags: ['Public gallery'], summary: 'Browse gallery photos',
  description: 'Hidden, processing and pending-review photos are never included. With face privacy on, browsing everything needs a "see all" session; otherwise pass `personId` from face search.',
  request: { params: ShortIdParam, query: PublicPhotoQuery },
  responses: { 200: json(z.object({ items: z.array(Photo), total: z.number().int(), nextCursor: z.string().nullable() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const g = await guestAccess(c, e)
  const q = c.req.valid('query')
  if (e.settings.facePrivacy && e.settings.faceSearch && !q.personId && g?.all !== true) {
    throw new Forbidden('This gallery shows each guest only their own photos. Take a selfie to find yours.', 'face_privacy')
  }
  const db = getDb(c.env.DB)
  const p = schema.photos
  const where = and(
    eq(p.eventId, e.id), visible(p),
    q.albumId ? eq(p.albumId, q.albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${e.id} AND kind = 'album')`,
    q.personId ? sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${q.personId})` : undefined,
  )
  const [{ total }] = await db.select({ total: count() }).from(p).where(where)
  if (q.highlights) {
    const rows = await db.select().from(p).where(where).orderBy(desc(p.favourites), asc(p.id)).limit(q.limit).offset(q.offset ?? 0)
    return c.json({ items: rows.map((r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE)), total, nextCursor: null }, 200)
  }
  const sortCol = q.sort === 'name' ? p.filename : q.sort === 'sequence' ? p.index : p.capturedAt
  let query = db.select().from(p).where(and(where, afterCursor(sortCol, p.id, 'asc', q.cursor))).orderBy(asc(sortCol), asc(p.id)).limit(q.limit + 1)
  if (q.offset !== undefined && !q.cursor) query = query.offset(q.offset) as typeof query
  const rows = await query
  const more = rows.length > q.limit
  const items = rows.slice(0, q.limit)
  const last = items[items.length - 1]
  const lastKey = last ? (q.sort === 'name' ? last.filename : q.sort === 'sequence' ? last.index : last.capturedAt) : ''
  return c.json({ items: items.map((r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE)), total, nextCursor: more && last ? encodeCursor(lastKey, last.id) : null }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/faces/search', tags: ['Public gallery'], summary: 'Find my photos (selfie search)',
  description: 'With Vectorize configured and an `embedding`, queries the event’s namespace and returns the best-matching person. In development without Vectorize, matches deterministically from `key` (same rule as the mock).',
  request: {
    params: ShortIdParam,
    body: body(z.object({ key: z.string().min(1).max(512), embedding: z.array(z.number().finite()).min(64).max(2048).optional(), minScore: z.number().min(0).max(1).default(0.5) })),
  },
  responses: { 200: json(z.object({ personId: z.string().nullable(), photoIds: z.array(z.string()) })), ...problems(401, 403, 404, 422, 503) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  await guestAccess(c, e)
  if (!e.settings.faceSearch) throw new Forbidden('Face search is turned off for this gallery.', 'face_search_disabled')
  const { key, embedding, minScore } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const index = vectorIndex(c.env)
  let personId: string | null = null
  let photoIds: string[] = []
  if (index && embedding) {
    let result: VectorizeMatches
    try {
      result = await index.query(embedding, { topK: 100, namespace: e.id, returnMetadata: 'none', returnValues: false })
    } catch (err) {
      if (/dimension/i.test(String(err))) throw new ValidationFailed([{ field: 'embedding', in: 'body', message: 'Embedding has the wrong number of dimensions for this index', code: 'dimension_mismatch' }])
      throw new ServiceUnavailable('Face search is not available right now.', 'face_search_unavailable')
    }
    const ids = result.matches.filter((mt) => mt.score >= minScore).map((mt) => mt.id)
    const faces: { photoId: string; personId: string | null }[] = []
    for (const part of chunk(ids)) faces.push(...await db.select({ photoId: schema.faces.photoId, personId: schema.faces.personId }).from(schema.faces).where(and(eq(schema.faces.eventId, e.id), inArray(schema.faces.vectorId, part))))
    const votes = new Map<string, number>()
    for (const f of faces) if (f.personId) votes.set(f.personId, (votes.get(f.personId) ?? 0) + 1)
    personId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    photoIds = [...new Set(faces.map((f) => f.photoId))]
  } else if (c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test') {
    const people = await db.select({ id: schema.people.id, name: schema.people.name }).from(schema.people).where(eq(schema.people.eventId, e.id)).orderBy(asc(schema.people.id))
    const unnamed = people.filter((p) => !p.name)
    const pool = unnamed.length ? unnamed : people
    if (pool.length) personId = pool[hash(key) % pool.length].id
  } else {
    throw new ServiceUnavailable('Face search is not available right now.', 'face_search_unavailable')
  }
  const p = schema.photos
  const albumsSql = sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${e.id} AND kind = 'album')`
  if (personId) {
    const rows = await db.select({ id: p.id }).from(p).where(and(eq(p.eventId, e.id), visible(p), albumsSql, sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${personId})`)).orderBy(asc(p.capturedAt))
    photoIds = rows.map((r) => r.id)
  } else if (!photoIds.length && (c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test')) {
    const rows = await db.select({ id: p.id }).from(p).where(and(eq(p.eventId, e.id), visible(p), albumsSql)).orderBy(asc(p.capturedAt))
    photoIds = rows.filter((r) => hash(`${r.id}:${key}`) % 8 === 0).map((r) => r.id)
  }
  if (photoIds.length) {
    background(c, db.batch([
      db.update(schema.events).set({ faceMatches: sql`${schema.events.faceMatches} + 1` }).where(eq(schema.events.id, e.id)),
      db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'face', title: `A guest found ${photoIds.length} photos of themselves`, detail: e.name, at: nowIso() }),
    ]))
    emit(c, e.studioId, 'activity', 'events')
  }
  return c.json({ personId, photoIds }, 200)
})

async function visiblePhoto(c: Context<AppEnv>, photoId: string) {
  const [row] = await getDb(c.env.DB).select({ p: schema.photos, e: schema.events }).from(schema.photos)
    .innerJoin(schema.events, eq(schema.events.id, schema.photos.eventId))
    .where(and(eq(schema.photos.id, photoId), visible())).limit(1)
  if (!row || blockedReason(row.e)) throw new NotFound('Photo', photoId)
  return row
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/photos/{photoId}/favourite', tags: ['Public gallery'], summary: 'Favourite or unfavourite a photo',
  description: 'Registered guests’ favourites show in the studio’s Guests list; the photo’s favourite count always updates.',
  request: { params: z.object({ photoId: z.string().max(128).openapi({ param: { name: 'photoId', in: 'path' } }) }), body: body(z.object({ on: z.boolean() })) },
  responses: { 200: json(z.object({ favourites: z.number().int() })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { p, e } = await visiblePhoto(c, c.req.valid('param').photoId)
  const g = await guestAccess(c, e)
  const { on } = c.req.valid('json')
  const db = getDb(c.env.DB)
  let delta = on ? 1 : -1
  if (g?.guestId) {
    const [guest] = await db.select().from(schema.guests).where(eq(schema.guests.id, g.guestId)).limit(1)
    if (guest) {
      const had = guest.favourites.includes(p.id)
      delta = on === had ? 0 : on ? 1 : -1
      const favourites = on ? (had ? guest.favourites : [...guest.favourites, p.id]) : guest.favourites.filter((id) => id !== p.id)
      await db.update(schema.guests).set({ favourites, lastActive: nowIso() }).where(eq(schema.guests.id, guest.id)).run()
    }
  }
  if (delta) await db.update(schema.photos).set({ favourites: sql`max(0, ${schema.photos.favourites} + ${delta})` }).where(eq(schema.photos.id, p.id)).run()
  const [after] = await db.select({ f: schema.photos.favourites }).from(schema.photos).where(eq(schema.photos.id, p.id)).limit(1)
  emit(c, e.studioId, 'photos', 'guests')
  return c.json({ favourites: after?.f ?? 0 }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/downloads', tags: ['Public gallery'], summary: 'Count downloads',
  request: { body: body(z.object({ photoIds: z.array(z.string().max(128)).min(1).max(500) })) },
  responses: { 204: NoContent, ...problems(422) },
}), async (c) => {
  const db = getDb(c.env.DB)
  const p = schema.photos
  const studios = new Set<string>()
  for (const part of chunk([...new Set(c.req.valid('json').photoIds)])) {
    await db.update(p).set({ downloads: sql`${p.downloads} + 1` }).where(and(inArray(p.id, part), visible(p))).run()
    for (const r of await db.select({ s: p.studioId }).from(p).where(inArray(p.id, part))) studios.add(r.s)
  }
  for (const s of studios) emit(c, s, 'photos')
  return c.body(null, 204)
})

// ── Enquiries, orders ──────────────────────────────────────────────────────
const EnquiryBody = z.object({
  name: z.string().trim().min(1).max(120), phone: z.string().max(40).default(''), email: z.email().max(254).or(z.literal('')).default(''),
  message: z.string().trim().min(1).max(4000), source: z.string().max(120).optional(),
}).refine((b) => b.phone || b.email, { message: 'Leave a phone number or an email so the studio can reply', path: ['email'] })

async function insertEnquiry(c: Context<AppEnv>, studioId: string, input: z.infer<typeof EnquiryBody>, source: string, eventId?: string) {
  const db = getDb(c.env.DB)
  const row = { id: newId('enq'), studioId, name: input.name, phone: input.phone, email: input.email, message: input.message, source, note: null, at: nowIso(), status: 'new' as const, eventId: eventId ?? null }
  await db.batch([
    db.insert(schema.enquiries).values(row),
    db.insert(schema.activity).values({ id: newId('act'), studioId, kind: 'enquiry', title: `New enquiry from ${input.name}`, detail: source, at: row.at }),
  ])
  emit(c, studioId, 'misc', 'activity')
  return enquiryOut(row)
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/enquiries', tags: ['Public gallery'], summary: 'Send an enquiry from a gallery',
  request: { params: ShortIdParam, body: body(EnquiryBody) },
  responses: { 201: json(Enquiry, 'Sent'), ...problems(403, 404, 422) },
}), async (c) => {
  const { e } = await eventByShortId(c, c.req.valid('param').shortId)
  if (!e.settings.allowEnquiries) throw new Forbidden('This gallery doesn’t take enquiries.', 'enquiries_disabled')
  const input = c.req.valid('json')
  return c.json(await insertEnquiry(c, e.studioId, input, input.source ?? `${e.name} gallery`, e.id), 201)
})

async function studioByCode(c: Context<AppEnv>, code: string) {
  const v = code.trim()
  const [s] = await getDb(c.env.DB).select().from(schema.studios)
    .where(or(eq(schema.studios.followCode, v.toUpperCase()), eq(schema.studios.handle, v.toLowerCase()))).limit(1)
  if (!s) throw new NotFound('Studio', code)
  return s
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/studios/{code}/enquiries', tags: ['Public gallery'], summary: 'Send an enquiry to a studio (handle or follow code)',
  request: { params: CodeParam, body: body(EnquiryBody) },
  responses: { 201: json(Enquiry, 'Sent'), ...problems(404, 422) },
}), async (c) => {
  const s = await studioByCode(c, c.req.valid('param').code)
  const input = c.req.valid('json')
  return c.json(await insertEnquiry(c, s.id, input, input.source ?? 'Studio profile'), 201)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/orders', tags: ['Public gallery'], summary: 'Buy photos or prints',
  description: 'Prices come from the studio’s price list. With Razorpay keys the order is `pending` and includes `checkout` for Razorpay Checkout (capture webhook TODO); without keys payment is simulated and the order is `paid`, adding the studio’s share (minus Frameline’s commission) to the ledger. Supports `Idempotency-Key`.',
  middleware: [idempotent] as const,
  request: {
    params: ShortIdParam, headers: IdempotencyHeader,
    body: body(z.object({
      items: z.array(z.object({ priceId: z.string().max(40), photoIds: z.array(z.string().max(128)).max(500), quantity: z.number().int().min(1).max(100).optional() })).min(1).max(20),
      method: z.enum(['upi', 'card', 'netbanking', 'international']),
      buyer: z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254), phone: z.string().max(40).optional() }),
    })),
  },
  responses: { 201: json(Order, 'Order created'), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  await guestAccess(c, e)
  if (!e.settings.storeEnabled) throw new AppError(409, 'store_disabled', 'Store disabled', 'This gallery isn’t selling photos.')
  const input = c.req.valid('json')
  const db = getDb(c.env.DB)
  const priceRows = await db.select().from(schema.prices).where(eq(schema.prices.studioId, e.studioId))
  let paidPaise = 0
  const labels: string[] = []
  const photoIds = new Set<string>()
  input.items.forEach((item, i) => {
    const price = priceRows.find((p) => p.id === item.priceId)
    if (!price) throw new ValidationFailed([{ field: `items.${i}.priceId`, in: 'body', message: `Unknown price ${item.priceId}`, code: 'unknown_price' }])
    const qty = item.priceId === 'all' ? 1 : Math.max(1, item.quantity ?? item.photoIds.length)
    paidPaise += price.pricePaise * qty
    labels.push(item.priceId === 'all' ? price.label : `${price.label}${qty > 1 ? ` ×${qty}` : ''}`)
    item.photoIds.forEach((id) => photoIds.add(id))
  })
  const ids = [...photoIds]
  for (const part of chunk(ids)) {
    const found = await db.select({ id: schema.photos.id }).from(schema.photos).where(and(eq(schema.photos.eventId, e.id), inArray(schema.photos.id, part), visible()))
    if (found.length !== part.length) throw new ValidationFailed([{ field: 'items', in: 'body', message: 'Some photos aren’t in this gallery', code: 'unknown_photo' }])
  }
  const [{ top }] = await db.select({ top: sql<number>`coalesce(max(${schema.orders.number}), 1000)` }).from(schema.orders).where(eq(schema.orders.studioId, e.studioId))
  const number = Number(top) + 1
  const sharePaise = Math.round(paidPaise * (1 - STORE_COMMISSION))
  const id = newId('ord')
  let status: 'paid' | 'pending' | 'paid-direct' = input.method === 'international' ? 'paid-direct' : 'paid'
  let checkout: z.infer<typeof Order>['checkout']
  if (c.env.RAZORPAY_KEY_ID && c.env.RAZORPAY_KEY_SECRET && input.method !== 'international') {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: paidPaise, currency: 'INR', receipt: id, notes: { eventId: e.id, studioId: e.studioId } }),
    })
    if (!res.ok) throw new ServiceUnavailable('Payments are unavailable right now. Try again in a minute.', 'payment_provider_error')
    const rz = (await res.json()) as { id: string }
    status = 'pending'
    checkout = { provider: 'razorpay', orderId: rz.id, keyId: c.env.RAZORPAY_KEY_ID, amount: toMajor(paidPaise), currency: 'INR' }
  }
  const row = {
    id, studioId: e.studioId, number, buyer: input.buyer.name, eventId: e.id, eventName: e.name, items: labels.join(', '), paidPaise, currency: 'INR' as const,
    sharePaise, status, providerRef: checkout?.orderId ?? null, at: nowIso(), photoIds: ids, buyerEmail: input.buyer.email.toLowerCase(), method: input.method,
  }
  await db.insert(schema.orders).values(row).run()
  if (status !== 'pending') {
    await addLedger(db, e.studioId, 'sale', `Order #${number} · ${e.name}`, sharePaise, true)
    await db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'order', title: `Order #${number} · ₹${toMajor(paidPaise).toLocaleString('en-IN')}`, detail: e.name, at: row.at }).run()
  }
  emit(c, e.studioId, 'misc', 'activity')
  return c.json({ ...orderOut(row), ...(checkout ? { checkout } : {}) }, 201)
})

// ── Studio profile ─────────────────────────────────────────────────────────
publicRoutes.openapi(createRoute({
  method: 'get', path: '/studios/{code}', tags: ['Public gallery'], summary: 'Studio profile (follow code or handle)',
  request: { params: CodeParam },
  responses: { 200: json(StudioProfile), ...problems(404) },
}), async (c) => {
  const s = await studioByCode(c, c.req.valid('param').code)
  const full = studioOut(s)
  const db = getDb(c.env.DB)
  const ids = full.app.featuredEventIds.slice(0, 24)
  const rows = ids.length ? await db.select().from(schema.events).where(and(eq(schema.events.studioId, s.id), inArray(schema.events.id, ids))) : []
  const featured = ids.map((id) => rows.find((r) => r.id === id)).filter((e): e is EventRow => !!e && !blockedReason(e) && (full.app.showPrivate || e.settings.access === 'link'))
    .map((e) => ({ id: e.id, shortId: e.shortId, name: e.name, type: e.type as z.infer<typeof PublicEvent>['type'], date: e.date, city: e.city, coverTones: e.coverTones, photoCount: e.photoCount, ...(e.coverPhotoId ? { coverPhotoId: e.coverPhotoId } : {}) }))
  return c.json({
    studio: {
      ...publicStudioOut(s), ...(full.about ? { about: full.about } : {}), ...(full.coverUrl ? { coverUrl: full.coverUrl } : {}), followers: full.followers,
      services: full.app.showServices ? full.services : [], testimonials: full.testimonials, faq: full.app.showFaq ? full.faq : [],
      socialLinks: full.socialLinks, portfolioLinks: full.portfolioLinks,
    },
    featured,
  }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/studios/{code}/follow', tags: ['Public gallery'], summary: 'Follow a studio',
  description: 'Counted once per registered guest (or per device IP + browser when anonymous).',
  request: { params: CodeParam },
  responses: { 200: json(z.object({ followers: z.number().int() })), ...problems(404) },
}), async (c) => {
  const s = await studioByCode(c, c.req.valid('param').code)
  const g = await guestFromRequest(c).catch(() => null)
  const followerKey = g?.guestId ?? `anon:${await sha256Hex(`${clientIp(c)}|${c.req.header('user-agent') ?? ''}`)}`
  const db = getDb(c.env.DB)
  const res = await db.insert(schema.studioFollows).values({ studioId: s.id, followerKey, at: nowIso() }).onConflictDoNothing().run()
  if (res.meta.changes) await db.update(schema.studios).set({ followers: sql`${schema.studios.followers} + 1` }).where(eq(schema.studios.id, s.id)).run()
  const [after] = await db.select({ f: schema.studios.followers }).from(schema.studios).where(eq(schema.studios.id, s.id)).limit(1)
  if (res.meta.changes) emit(c, s.id, 'studio')
  return c.json({ followers: after?.f ?? 0 }, 200)
})

// ── Personal links, ZIP manifests, access requests ─────────────────────────
publicRoutes.openapi(createRoute({
  method: 'get', path: '/links/{code}', tags: ['Public gallery'], summary: 'Resolve a personal link code',
  description: 'Signed codes return their stored payload; VIP links with an embedded PIN or "see all" also return a guest session. Unsigned legacy tokens resolve without VIP rights.',
  request: { params: z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{4,2048}$/).openapi({ param: { name: 'code', in: 'path' } }) }) },
  responses: { 200: json(z.object({ kind: z.enum(['s', 'v']), payload: GuestLinkPayload, session: GuestSession.optional() })), ...problems(404) },
}), async (c) => {
  const link = await resolveLink(c.env, c.req.valid('param').code)
  if (!link) throw new NotFound('Link')
  const { e } = await eventByShortId(c, link.payload.e)
  const vip = link.signed && link.kind === 'v' ? link.payload.vip : undefined
  const session = vip?.pin || vip?.all ? await issueGuestSession(c, e, { seeAll: !!vip.all || !e.settings.facePrivacy || !e.settings.faceSearch }) : undefined
  return c.json({ kind: link.kind, payload: link.payload, ...(session ? { session } : {}) }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/zips/{id}', tags: ['Public gallery'], summary: 'Download links for a ready ZIP request',
  request: { params: z.object({ id: z.string().max(64).openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: json(z.object({ eventName: z.string(), photos: z.array(z.object({ id: z.string(), filename: z.string(), url: z.string().nullable() })) })), ...problems(404) },
}), async (c) => {
  const db = getDb(c.env.DB)
  const [z0] = await db.select().from(schema.zipRequests).where(eq(schema.zipRequests.id, c.req.valid('param').id)).limit(1)
  if (!z0 || z0.status !== 'ready' || Date.parse(z0.readyAt ?? z0.requestedAt) < Date.now() - 7 * 86_400_000) throw new NotFound('Download')
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, z0.eventId)).limit(1)
  const p = schema.photos
  const where = z0.photoIds?.length ? inArray(p.id, z0.photoIds.slice(0, 90)) : and(eq(p.eventId, z0.eventId), z0.albumId ? eq(p.albumId, z0.albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${z0.eventId} AND kind = 'album')`)
  const rows = await db.select().from(p).where(and(where, eq(p.status, 'ready'))).orderBy(asc(p.capturedAt)).limit(5000)
  return c.json({ eventName: ev?.name ?? '', photos: rows.map((r) => ({ id: r.id, filename: r.filename, url: photoOut(r, c.env.PUBLIC_MEDIA_BASE).url ?? null })) }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/access-requests', tags: ['Public gallery'], summary: 'Ask the photographer for access',
  request: { params: ShortIdParam, body: body(z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254), note: z.string().max(1000).default('') })) },
  responses: { 202: json(z.object({ received: z.literal(true) }), 'Request received'), ...problems(404, 422) },
}), async (c) => {
  const { e } = await eventByShortId(c, c.req.valid('param').shortId)
  const input = c.req.valid('json')
  await getDb(c.env.DB).insert(schema.accessRequests).values({ id: newId('ar'), eventId: e.id, name: input.name, email: input.email.toLowerCase(), note: input.note, status: 'pending', createdAt: nowIso() }).run()
  emit(c, e.studioId, 'guests')
  return c.json({ received: true as const }, 202)
})

