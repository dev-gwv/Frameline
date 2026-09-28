import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { DOWNLOAD_ALL_LIMIT, STORE_COMMISSION, effectivePrices, selfieHasNoFace } from '@frameline/shared'
import type { AppEnv, GuestClaims } from '../env'
import { getDb, schema } from '../db/client'
import { albumOut, enquiryOut, filmOut, hostOut, orderOut, photoOut, priceOut, publicStudioOut, storeSettingsOut, studioOut, watermarkOut, zipOut } from '../db/mappers'
import { sha256Hex, timingSafeEqual } from '../lib/crypto'
import { AppError, Forbidden, NotConfigured, NotFound, RateLimited, ServiceUnavailable, Unauthorized, ValidationFailed } from '../lib/errors'
import { background, clientIp } from '../lib/http'
import { newId, nowIso } from '../lib/ids'
import { signJwt } from '../lib/jwt'
import { toMajor } from '../lib/money'
import { IdempotencyHeader, NoContent, body, createRouter, json, problems } from '../lib/openapi'
import { afterCursor, encodeCursor } from '../lib/pagination'
import { guestFromRequest } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { limits, storeFor } from '../middleware/rate-limit'
import {
  DownloadAllowance, Enquiry, FaceSearchInput, FaceSearchResult, GuestLinkPayload, GuestSession, NotifyRequest, Order, Photo, Price, PublicEvent, PublicEventSummary, PublicStudio,
  PublicWatermark, ShippingAddressInput, StudioProfile, ZipRequest,
} from '../schemas/domain'
import { bumpDaily } from '../services/stats'
import { PhotoSortEnum } from './photos'
import { addLedger } from '../services/billing'
import { matchFaces, visiblePhotos as visible } from '../services/faces'
import { resolveLink } from '../services/guest-links'
import { markOrderPaid, verifyCheckoutSignature } from '../services/orders'
import { emit } from '../services/realtime'
import { chunk } from './photos'
import { UploadFileInput, completeUploadSession, createUploadSession } from './uploads'

/**
 * Guest-facing API. Guest tokens (JWT aud=guest) come from POST …/pin, …/register or a VIP link and carry
 * { sub: eventId, sid: studioId, gid?: guestId, all?: true, vp?: true (PIN embedded in a VIP link) }. Rules:
 * - access 'link': no token needed; 'link-pin': a token for this event; 'registered': a token with a guest id
 * - face privacy on: browsing every photo needs `all` (typed PIN or VIP "all"); otherwise only your matched person
 * Guest identity for follows / "my galleries" / download counts: X-Guest-Device (stable install id), else the guest id.
 */
export const publicRoutes = createRouter()
publicRoutes.use('*', limits.publicGallery)

const GUEST_TTL_SEC = 12 * 3600
const PIN_MAX_TRIES = 5
const PIN_LOCK_SEC = 900

const ShortIdParam = z.object({ shortId: z.string().regex(/^[0-9A-Za-z]{7}$/, 'Gallery codes are 7 characters').openapi({ param: { name: 'shortId', in: 'path' }, example: '6402F9F' }) })
const CodeParam = z.object({ code: z.string().min(3).max(64).openapi({ param: { name: 'code', in: 'path' }, example: 'FA-KCGWHY' }) })
const PhotoIdParam = z.object({ photoId: z.string().max(128).openapi({ param: { name: 'photoId', in: 'path' } }) })

type EventRow = typeof schema.events.$inferSelect
type StudioRow = typeof schema.studios.$inferSelect
type Claims = GuestClaims

async function eventByShortId(c: Context<AppEnv>, shortId: string): Promise<{ e: EventRow; s: StudioRow }> {
  const [row] = await getDb(c.env.DB).select({ e: schema.events, s: schema.studios }).from(schema.events)
    .innerJoin(schema.studios, eq(schema.studios.id, schema.events.studioId))
    .where(and(eq(schema.events.shortId, shortId.toUpperCase()), isNull(schema.events.deletedAt))).limit(1)
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

const readGuest = (c: Context<AppEnv>): Promise<Claims | null> => guestFromRequest(c)

/** Checks the event's access rule against the (optional) guest token. */
async function guestAccess(c: Context<AppEnv>, e: EventRow): Promise<Claims | null> {
  const g = await readGuest(c)
  if (g && g.eventId !== e.id) throw new Forbidden('This gallery token belongs to a different event.', 'wrong_event')
  if (e.settings.access === 'link-pin' && !g) throw new Unauthorized('Enter the gallery PIN first.', 'pin_required')
  if (e.settings.access === 'registered' && !g?.guestId) throw new Unauthorized('Register with your name and email first.', 'registration_required')
  if (g?.guestId) {
    const [row] = await getDb(c.env.DB).select({ removedAt: schema.guests.removedAt }).from(schema.guests).where(eq(schema.guests.id, g.guestId)).limit(1)
    if (row?.removedAt) throw new Forbidden('The photographer removed your access to this gallery. Ask them if you think this is a mistake.', 'guest_removed')
  }
  if (g) c.set('guest', g)
  return g
}

const DEVICE_RE = /^[A-Za-z0-9_-]{8,128}$/
/** Stable guest identity: device id header, else registered guest id, else null. */
function guestIdentity(c: Context<AppEnv>, g?: GuestClaims | null): string | null {
  const device = c.req.header('x-guest-device')
  if (device && DEVICE_RE.test(device)) return `device:${device}`
  return g?.guestId ? `guest:${g.guestId}` : null
}

async function issueGuestSession(c: Context<AppEnv>, e: EventRow, opts: { guestId?: string; seeAll: boolean; vipPin?: boolean }) {
  const token = await signJwt(c.env.JWT_SECRET, {
    sub: e.id, aud: 'guest', sid: e.studioId, ...(opts.guestId ? { gid: opts.guestId } : {}), ...(opts.seeAll ? { all: true } : {}), ...(opts.vipPin ? { vp: true } : {}),
  }, GUEST_TTL_SEC)
  return { token, expiresIn: GUEST_TTL_SEC, eventId: e.id, shortId: e.shortId, ...(opts.guestId ? { guestId: opts.guestId } : {}), seeAll: opts.seeAll }
}

function rememberGallery(c: Context<AppEnv>, e: EventRow, key: string | null) {
  if (!key) return
  background(c, getDb(c.env.DB).insert(schema.guestGalleries).values({ guestKey: key, eventId: e.id, lastOpenedAt: nowIso() })
    .onConflictDoUpdate({ target: [schema.guestGalleries.guestKey, schema.guestGalleries.eventId], set: { lastOpenedAt: nowIso() } }).run())
}

// ── Event landing ──────────────────────────────────────────────────────────
publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}', tags: ['Public gallery'], summary: 'Gallery landing: event, albums, films, studio branding',
  description: 'Always answers for a known code; `blocked` explains galleries that are turned off, archived, expired or still empty. The PIN is never included. Records the gallery in the guest’s "my galleries" when an X-Guest-Device header (or guest token) is sent.',
  request: { params: ShortIdParam, query: z.object({ platform: z.enum(['web', 'android', 'ios']).default('web') }) },
  responses: { 200: json(PublicEvent), ...problems(404) },
}), async (c) => {
  const { e, s } = await eventByShortId(c, c.req.valid('param').shortId)
  const db = getDb(c.env.DB)
  const platform = c.req.valid('query').platform
  background(c, db.run(sql`UPDATE events SET visits = json_set(visits, ${'$.' + platform}, coalesce(json_extract(visits, ${'$.' + platform}), 0) + 1) WHERE id = ${e.id}`))
  background(c, bumpDaily(db, e.studioId, e.id, 'visits'))
  const g = await readGuest(c).catch(() => null)
  rememberGallery(c, e, guestIdentity(c, g?.eventId === e.id ? g : null))
  const albums = await db.select().from(schema.albums).where(and(eq(schema.albums.eventId, e.id), isNull(schema.albums.deletedAt), sql`${schema.albums.kind} != 'store'`)).orderBy(asc(schema.albums.order))
  const films = await db.select().from(schema.films).where(eq(schema.films.eventId, e.id)).orderBy(asc(schema.films.createdAt))
  let coverUrl: string | undefined
  if (e.coverPhotoId) {
    const [cp] = await db.select().from(schema.photos).where(and(eq(schema.photos.id, e.coverPhotoId), isNull(schema.photos.deletedAt))).limit(1)
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

async function checkPin(c: Context<AppEnv>, e: EventRow, pin: string) {
  const key = `pin-fail:${clientIp(c)}:${e.id}`
  const lock = await c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(key)).peek(PIN_MAX_TRIES, PIN_LOCK_SEC * 1000)
  if (!lock.success) throw new RateLimited(lock.reset, 'Too many wrong PINs. Try again in 15 minutes, or ask the photographer.', 'pin_locked')
  if (!timingSafeEqual(pin, e.settings.pin)) {
    const d = await storeFor(c.env, { windowSec: PIN_LOCK_SEC }).hit(key, PIN_MAX_TRIES, PIN_LOCK_SEC)
    const left = Math.max(0, d.remaining)
    if (left === 0) throw new RateLimited(d.reset, 'Too many wrong PINs. Try again in 15 minutes, or ask the photographer.', 'pin_locked')
    throw new Unauthorized(`That PIN is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'invalid_pin', { attemptsRemaining: left })
  }
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/pin', tags: ['Public gallery'], summary: 'Check the gallery PIN and get a guest token',
  description: `${PIN_MAX_TRIES} wrong PINs lock this gallery for ${PIN_LOCK_SEC / 60} minutes (per device IP). A typed PIN lets the guest browse every photo.`,
  request: { params: ShortIdParam, body: body(z.object({ pin: z.string().trim().min(1).max(10) })) },
  responses: { 200: json(GuestSession), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const existing = await readGuest(c).catch(() => null)
  const guestId = existing?.eventId === e.id ? existing.guestId : undefined
  if (e.settings.access === 'link-pin') await checkPin(c, e, c.req.valid('json').pin)
  return c.json(await issueGuestSession(c, e, { guestId, seeAll: true }), 200)
})

const GuestOut = z.object({
  id: z.string(), eventId: z.string(), name: z.string(), email: z.string(), phone: z.string(), role: z.enum(['guest', 'host', 'client']),
  favourites: z.array(z.string()), lastActive: z.string(), registeredAt: z.string(),
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/register', tags: ['Public gallery'], summary: 'Register as a guest (appears in the studio’s Guests list)',
  description: 'Name plus an email or a mobile number (at least one). Returning guests are matched by email, else by phone. Signing up with a host’s email or phone marks that host as accepted. Send the PIN session token (if any) so a typed PIN keeps its "see all" right.',
  request: {
    params: ShortIdParam,
    body: body(z.object({
      name: z.string().trim().min(1).max(120),
      email: z.email().max(254).or(z.literal('')).optional(),
      phone: z.string().trim().max(40).regex(/^(\+?[\d\s()-]{8,20})?$/, 'Enter a mobile number like +91 98450 55012').optional(),
    }).refine((b) => !!(b.email || b.phone), { message: 'Add your email or your mobile number', path: ['email'] })),
  },
  responses: { 200: json(GuestSession.extend({ guest: GuestOut })), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const prior = await readGuest(c).catch(() => null)
  if (prior && prior.eventId !== e.id) throw new Forbidden('This gallery token belongs to a different event.', 'wrong_event')
  if (e.settings.access === 'link-pin' && !prior) throw new Unauthorized('Enter the gallery PIN first.', 'pin_required')
  const input = c.req.valid('json')
  const db = getDb(c.env.DB)
  const email = (input.email ?? '').toLowerCase()
  const phone = (input.phone ?? '').trim()
  const digits = (v: string) => v.replace(/\D/g, '').slice(-10)
  const now = nowIso()
  const gt = schema.guests
  let g: typeof gt.$inferSelect | undefined = email ? (await db.select().from(gt).where(and(eq(gt.eventId, e.id), eq(gt.email, email))).limit(1))[0] : undefined
  if (!g && phone) {
    const same = await db.select().from(gt).where(and(eq(gt.eventId, e.id), sql`${gt.phone} != ''`)).limit(2000)
    g = same.find((x) => digits(x.phone) === digits(phone))
  }
  if (g?.removedAt) throw new Forbidden('The photographer removed your access to this gallery. Ask them if you think this is a mistake.', 'guest_removed')
  if (g) {
    g = { ...g, name: input.name, phone: phone || g.phone, email: email || g.email, lastActive: now }
    await db.update(gt).set({ name: g.name, phone: g.phone, email: g.email, lastActive: now }).where(eq(gt.id, g.id)).run()
  } else {
    g = { id: newId('g'), eventId: e.id, name: input.name, email, phone, role: 'guest', favourites: [], lastActive: now, registeredAt: now, removedAt: null }
    await db.batch([
      db.insert(schema.guests).values(g),
      db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'registration', title: `${input.name} registered`, detail: e.name, at: now }),
    ])
    emit(c, e.studioId, 'guests', 'activity')
  }
  // A host who opens the gallery with the email/phone they were invited with has accepted.
  const hostMatch = (h: typeof e.hosts[number]) => (!!email && h.email.toLowerCase() === email) || (!!phone && !!h.phone && digits(h.phone) === digits(phone))
  if (e.hosts.some((h) => hostMatch(h) && h.status !== 'accepted')) {
    const hosts = e.hosts.map((h) => (hostMatch(h) ? { ...hostOut(h), status: 'accepted' as const } : h))
    await db.update(schema.events).set({ hosts }).where(eq(schema.events.id, e.id)).run()
    emit(c, e.studioId, 'events')
  }
  const seeAll = prior?.all === true || !e.settings.facePrivacy || !e.settings.faceSearch
  rememberGallery(c, e, guestIdentity(c, { eventId: e.id, studioId: e.studioId, guestId: g.id }))
  const { removedAt: _r, ...guest } = g
  return c.json({ ...(await issueGuestSession(c, e, { guestId: g.id, seeAll, vipPin: prior?.vp })), guest }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}/prices', tags: ['Public gallery'], summary: 'The store prices for this gallery',
  description: 'The studio’s price list with this event’s `priceOverrides` applied.',
  request: { params: ShortIdParam },
  responses: { 200: json(z.object({ items: z.array(Price) })), ...problems(401, 403, 404) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  await guestAccess(c, e)
  const rows = await getDb(c.env.DB).select().from(schema.prices).where(eq(schema.prices.studioId, e.studioId)).orderBy(asc(schema.prices.sortOrder))
  return c.json({ items: effectivePrices(rows.map(priceOut), e.settings.priceOverrides) }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}/watermark', tags: ['Public gallery'], summary: 'The watermark guests’ downloads must carry',
  description: '`enabled` is false when the event turns watermarks off. `sale` is the studio’s "For sale" watermark when the event sells photos with `forSaleWatermark` on (omitted otherwise).',
  request: { params: ShortIdParam },
  responses: { 200: json(PublicWatermark), ...problems(401, 403, 404) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  await guestAccess(c, e)
  const db = getDb(c.env.DB)
  const [w] = await db.select().from(schema.watermarks).where(eq(schema.watermarks.studioId, e.studioId)).limit(1)
  if (!w) throw new NotFound('Watermark')
  let sale: ReturnType<typeof storeSettingsOut>['saleWatermark'] | undefined
  if (e.settings.storeEnabled && e.settings.forSaleWatermark !== false) {
    const [st] = await db.select().from(schema.studios).where(eq(schema.studios.id, e.studioId)).limit(1)
    if (st) sale = storeSettingsOut(st).saleWatermark
  }
  return c.json({ enabled: !e.settings.watermarkOff, settings: watermarkOut(w.settings), ...(sale ? { sale } : {}) }, 200)
})

// ── Photos, faces, favourites, downloads ────────────────────────────────────
const PublicPhotoQuery = z.object({
  albumId: z.string().max(128).optional(),
  personId: z.string().max(128).optional(),
  sort: PhotoSortEnum.default('capture'),
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
    q.albumId ? eq(p.albumId, q.albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${e.id} AND kind = 'album' AND deleted_at IS NULL)`,
    q.personId ? sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${q.personId})` : undefined,
  )
  const [{ total }] = await db.select({ total: count() }).from(p).where(where)
  if (q.highlights) {
    const rows = await db.select().from(p).where(where).orderBy(desc(p.favourites), asc(p.id)).limit(q.limit).offset(q.offset ?? 0)
    return c.json({ items: rows.map((r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE)), total, nextCursor: null }, 200)
  }
  const sortCol = q.sort === 'name' ? p.filename : q.sort === 'sequence' ? p.index : p.capturedAt
  const dir = q.sort === 'newest' ? 'desc' : 'asc'
  let query = db.select().from(p).where(and(where, afterCursor(sortCol, p.id, dir, q.cursor))).orderBy(...(dir === 'desc' ? [desc(sortCol), desc(p.id)] : [asc(sortCol), asc(p.id)])).limit(q.limit + 1)
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
  description: 'With Vectorize configured and an `embedding`, queries the event’s namespace and returns the best-matching person. In development without Vectorize, matches deterministically from `key` (same rule as the mock). When the client reports no face (`faces: 0`) or the image is too small, answers `faceFound: false` with `reason: no_face`.',
  request: { params: ShortIdParam, body: body(FaceSearchInput) },
  responses: { 200: json(FaceSearchResult), ...problems(401, 403, 404, 422, 503) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  await guestAccess(c, e)
  if (!e.settings.faceSearch) throw new Forbidden('Face search is turned off for this gallery.', 'face_search_disabled')
  const input = c.req.valid('json')
  if (selfieHasNoFace(input)) return c.json({ faceFound: false, reason: 'no_face' as const, personId: null, photoIds: [] }, 200)
  const result = await matchFaces(c.env, e.id, input.key, input.embedding, input.minScore)
  if (result.photoIds.length) {
    const db = getDb(c.env.DB)
    background(c, bumpDaily(db, e.studioId, e.id, 'faceSearches'))
    background(c, db.batch([
      db.update(schema.events).set({ faceMatches: sql`${schema.events.faceMatches} + 1` }).where(eq(schema.events.id, e.id)),
      db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'face', title: `A guest found ${result.photoIds.length} photos of themselves`, detail: e.name, at: nowIso() }),
    ]))
    emit(c, e.studioId, 'activity', 'events')
  }
  return c.json({ faceFound: true, ...result }, 200)
})

async function visiblePhoto(c: Context<AppEnv>, photoId: string) {
  const [row] = await getDb(c.env.DB).select({ p: schema.photos, e: schema.events }).from(schema.photos)
    .innerJoin(schema.events, eq(schema.events.id, schema.photos.eventId))
    .where(and(eq(schema.photos.id, photoId), visible(), isNull(schema.events.deletedAt))).limit(1)
  if (!row || blockedReason(row.e)) throw new NotFound('Photo', photoId)
  return row
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/photos/{photoId}/favourite', tags: ['Public gallery'], summary: 'Favourite or unfavourite a photo',
  description: 'Registered guests’ favourites show in the studio’s Guests list; the photo’s favourite count always updates.',
  request: { params: PhotoIdParam, body: body(z.object({ on: z.boolean() })) },
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
  method: 'get', path: '/events/{shortId}/me/favourites', tags: ['Public gallery'], summary: 'My favourite photos (registered guests)',
  request: { params: ShortIdParam },
  responses: { 200: json(z.object({ items: z.array(Photo) })), ...problems(401, 403, 404) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const g = await guestAccess(c, e)
  if (!g?.guestId) throw new Unauthorized('Register with your name and email to keep favourites.', 'registration_required')
  const db = getDb(c.env.DB)
  const [guest] = await db.select().from(schema.guests).where(eq(schema.guests.id, g.guestId)).limit(1)
  const ids = guest?.favourites ?? []
  const rows: (typeof schema.photos.$inferSelect)[] = []
  for (const part of chunk(ids)) rows.push(...await db.select().from(schema.photos).where(and(inArray(schema.photos.id, part), eq(schema.photos.eventId, e.id), visible())))
  const order = new Map(ids.map((id, i) => [id, i]))
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  return c.json({ items: rows.map((r) => photoOut(r, c.env.PUBLIC_MEDIA_BASE)) }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/downloads', tags: ['Public gallery'], summary: 'Count downloads',
  request: { body: body(z.object({ photoIds: z.array(z.string().max(128)).min(1).max(500) })) },
  responses: { 204: NoContent, ...problems(422) },
}), async (c) => {
  const db = getDb(c.env.DB)
  const p = schema.photos
  const studios = new Set<string>()
  const perEvent = new Map<string, { studioId: string; n: number }>()
  for (const part of chunk([...new Set(c.req.valid('json').photoIds)])) {
    await db.update(p).set({ downloads: sql`${p.downloads} + 1` }).where(and(inArray(p.id, part), visible(p))).run()
    for (const r of await db.select({ s: p.studioId, e: p.eventId }).from(p).where(and(inArray(p.id, part), visible(p)))) {
      studios.add(r.s)
      const x = perEvent.get(r.e) ?? { studioId: r.s, n: 0 }
      x.n++
      perEvent.set(r.e, x)
    }
  }
  for (const [eventId, x] of perEvent) await bumpDaily(db, x.studioId, eventId, 'downloads', x.n)
  for (const s of studios) emit(c, s, 'photos')
  return c.body(null, 204)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/views', tags: ['Public gallery'], summary: 'Count photo views',
  description: 'Call when a guest opens photos in the viewer (one view per photo per call). Feeds `Photo.views` and the studio’s stats.',
  request: { body: body(z.object({ photoIds: z.array(z.string().max(128)).min(1).max(200) })) },
  responses: { 204: NoContent, ...problems(422) },
}), async (c) => {
  const db = getDb(c.env.DB)
  const p = schema.photos
  const perEvent = new Map<string, { studioId: string; n: number }>()
  for (const part of chunk([...new Set(c.req.valid('json').photoIds)])) {
    const rows = await db.select({ id: p.id, s: p.studioId, e: p.eventId }).from(p).where(and(inArray(p.id, part), visible(p)))
    if (!rows.length) continue
    await db.update(p).set({ views: sql`${p.views} + 1` }).where(inArray(p.id, rows.map((r) => r.id))).run()
    for (const r of rows) {
      const x = perEvent.get(r.e) ?? { studioId: r.s, n: 0 }
      x.n++
      perEvent.set(r.e, x)
    }
  }
  for (const [eventId, x] of perEvent) await bumpDaily(db, x.studioId, eventId, 'photoViews', x.n)
  return c.body(null, 204)
})

// ── Notify me ──────────────────────────────────────────────────────────────
const NotifyBody = z.object({ phone: z.string().trim().regex(/^\+?[\d\s()-]{8,20}$/, 'Enter a mobile number like +91 98450 55012') })
const normPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 10 ? `+91${d}` : `+${d}` }

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/notify', tags: ['Public gallery'], summary: '"Notify me" when the first photos go live',
  description: 'For galleries with no photos yet. When the first photos become visible the API messages this number once (SMS/WhatsApp; simulated as a log line until a provider is configured). 409 `already_live` when there are photos already. Asking again with the same number is fine.',
  middleware: [idempotent] as const,
  request: { params: ShortIdParam, headers: IdempotencyHeader, body: body(NotifyBody) },
  responses: { 201: json(NotifyRequest, 'Subscribed'), ...problems(404, 409, 422) },
}), async (c) => {
  const { e } = await eventByShortId(c, c.req.valid('param').shortId)
  const db = getDb(c.env.DB)
  const [live] = await db.select({ id: schema.photos.id }).from(schema.photos).where(and(eq(schema.photos.eventId, e.id), visible())).limit(1)
  if (live && !blockedReason(e)) throw new AppError(409, 'already_live', 'Photos are here', 'The photos are already in this gallery. Open it to see them.')
  const phone = normPhone(c.req.valid('json').phone)
  const n = schema.notifyRequests
  const createdAt = nowIso()
  await db.insert(n).values({ id: newId('ntf'), eventId: e.id, studioId: e.studioId, phone, createdAt })
    .onConflictDoUpdate({ target: [n.eventId, n.phone], set: { cancelledAt: null, notifiedAt: null, createdAt } }).run()
  return c.json({ eventId: e.id, phone, createdAt }, 201)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/notify/cancel', tags: ['Public gallery'], summary: 'Stop a "Notify me" request',
  middleware: [idempotent] as const,
  request: { params: ShortIdParam, headers: IdempotencyHeader, body: body(NotifyBody) },
  responses: { 204: NoContent, ...problems(404, 422) },
}), async (c) => {
  const { e } = await eventByShortId(c, c.req.valid('param').shortId)
  const n = schema.notifyRequests
  await getDb(c.env.DB).update(n).set({ cancelledAt: nowIso() }).where(and(eq(n.eventId, e.id), eq(n.phone, normPhone(c.req.valid('json').phone)))).run()
  return c.body(null, 204)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/download-pin', tags: ['Public gallery'], summary: 'Unlock "Download all" (PIN + use counter)',
  description: `Checks the event PIN (works on galleries without a PIN gate; VIP links with an embedded PIN may omit it) and uses one of the guest’s ${DOWNLOAD_ALL_LIMIT} "Download all" uses. Counted per X-Guest-Device, else per registered guest, else per IP.`,
  request: { params: ShortIdParam, body: body(z.object({ pin: z.string().trim().min(1).max(10).optional() })) },
  responses: { 200: json(DownloadAllowance), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const g = await guestAccess(c, e)
  if (e.settings.downloads === 'none') throw new Forbidden('Downloads are turned off for this gallery.', 'downloads_disabled')
  const { pin } = c.req.valid('json')
  if (pin) await checkPin(c, e, pin)
  else if (!g?.vp) throw new Unauthorized('Enter the gallery PIN to download everything.', 'pin_required')
  const key = guestIdentity(c, g) ?? `ip:${await sha256Hex(clientIp(c))}`
  const db = getDb(c.env.DB)
  const t = schema.downloadUses
  const res = await db.insert(t).values({ eventId: e.id, guestKey: key, count: 1, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: [t.eventId, t.guestKey], set: { count: sql`${t.count} + 1`, updatedAt: nowIso() }, setWhere: sql`${t.count} < ${DOWNLOAD_ALL_LIMIT}` }).run()
  if (res.meta.changes === 0) {
    throw new AppError(429, 'download_limit', 'Download limit reached', `“Download all” can be used ${DOWNLOAD_ALL_LIMIT} times per guest. Download single photos instead.`, { extensions: { remaining: 0 } })
  }
  const [row] = await db.select({ n: t.count }).from(t).where(and(eq(t.eventId, e.id), eq(t.guestKey, key))).limit(1)
  return c.json({ remaining: Math.max(0, DOWNLOAD_ALL_LIMIT - (row?.n ?? 1)), limit: DOWNLOAD_ALL_LIMIT }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/zips', tags: ['Public gallery'], summary: 'Email a ZIP of photos (follows the download policy)',
  description: '`downloads: none` → 403. `own` → only `photoIds` that show `personId`. `all` → an album, a selection, or everything visible (face privacy needs a "see all" session or a `personId`).',
  middleware: [idempotent] as const,
  request: {
    params: ShortIdParam, headers: IdempotencyHeader,
    body: body(z.object({ email: z.email().max(254), photoIds: z.array(z.string().max(128)).max(500).optional(), albumId: z.string().max(128).optional(), personId: z.string().max(128).optional() })),
  },
  responses: { 202: json(ZipRequest, 'Queued'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const g = await guestAccess(c, e)
  const input = c.req.valid('json')
  const st = e.settings
  if (st.downloads === 'none') throw new Forbidden('Downloads are turned off for this gallery.', 'downloads_disabled')
  const needOwn = st.downloads === 'own' || (st.facePrivacy && st.faceSearch && g?.all !== true)
  if (needOwn && (!input.personId || !input.photoIds?.length)) {
    throw new Forbidden('You can download only the photos you’re in. Find yours with a selfie first.', 'downloads_own_only')
  }
  const db = getDb(c.env.DB)
  const p = schema.photos
  let ids = input.photoIds
  if (ids) {
    const ok: string[] = []
    for (const part of chunk([...new Set(ids)])) {
      ok.push(...(await db.select({ id: p.id }).from(p).where(and(eq(p.eventId, e.id), inArray(p.id, part), visible(p),
        needOwn ? sql`${p.id} IN (SELECT photo_id FROM faces WHERE person_id = ${input.personId!})` : undefined))).map((r) => r.id))
    }
    if (ok.length !== new Set(ids).size) throw new Forbidden('Some of these photos aren’t available for you to download.', 'downloads_own_only')
    ids = ok
  }
  let photoCount = ids?.length ?? 0
  if (!ids) {
    const [{ n }] = await db.select({ n: count() }).from(p).where(and(eq(p.eventId, e.id), visible(p),
      input.albumId ? eq(p.albumId, input.albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${e.id} AND kind = 'album' AND deleted_at IS NULL)`))
    photoCount = n
  }
  const row = {
    id: newId('zip'), studioId: e.studioId, eventId: e.id, albumId: input.albumId ?? null, photoIds: ids ?? null, email: input.email,
    photoCount, status: 'queued' as const, requestedAt: nowIso(), readyAt: null, url: null,
  }
  await db.insert(schema.zipRequests).values(row).run()
  await c.env.PHOTO_QUEUE.send({ kind: 'build-zip', zipId: row.id, studioId: e.studioId })
  emit(c, e.studioId, 'misc')
  return c.json(zipOut(row), 202)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/photos/{photoId}/download', tags: ['Public gallery'], summary: 'Download a web-size rendition (watermarked when required)',
  description: 'Streams `…/renditions/<size>.jpg` written by the image processor. Without processing (dev) there is no rendition: 404 `rendition_unavailable` (use the photo `url` instead). Guest token may be passed as `?token=` for plain links.',
  request: { params: PhotoIdParam, query: z.object({ size: z.enum(['2048', '3072']).default('2048'), token: z.string().max(2048).optional() }) },
  responses: { 200: { description: 'JPEG rendition' }, ...problems(401, 403, 404) },
}), async (c) => {
  const { p, e } = await visiblePhoto(c, c.req.valid('param').photoId)
  await guestAccess(c, e)
  if (e.settings.downloads === 'none') throw new Forbidden('Downloads are turned off for this gallery.', 'downloads_disabled')
  const size = c.req.valid('query').size
  if (size === '3072' && !e.settings.originalDownloads) throw new Forbidden('High-resolution downloads are off for this gallery.', 'originals_disabled')
  const key = p.r2Key ? p.r2Key.replace(/\/[^/]+$/, `/renditions/${size}.jpg`) : null
  const obj = key && c.env.PROCESSOR_URL ? await c.env.MEDIA.get(key) : null
  if (!obj) throw new AppError(404, 'rendition_unavailable', 'Not found', 'No download rendition exists for this photo yet. Use the photo URL instead.')
  // HEAD (clients checking the link exists) must not count as a download.
  if (c.req.method !== 'HEAD') {
    background(c, getDb(c.env.DB).update(schema.photos).set({ downloads: sql`${schema.photos.downloads} + 1` }).where(eq(schema.photos.id, p.id)).run())
    background(c, bumpDaily(getDb(c.env.DB), e.studioId, e.id, 'downloads'))
  }
  return new Response(c.req.method === 'HEAD' ? null : obj.body, {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${p.filename.replace(/"/g, '')}"`, 'Cache-Control': 'private, max-age=3600' },
  })
})

// ── Guest uploads ──────────────────────────────────────────────────────────
async function guestUploadTarget(c: Context<AppEnv>, shortId: string) {
  const { e } = await openEvent(c, shortId)
  const g = await guestAccess(c, e)
  if (!e.settings.guestUploads) throw new Forbidden('This gallery doesn’t take guest uploads.', 'guest_uploads_disabled')
  const [album] = await getDb(c.env.DB).select().from(schema.albums).where(and(eq(schema.albums.eventId, e.id), eq(schema.albums.kind, 'guest'), isNull(schema.albums.deletedAt))).limit(1)
  if (!album) throw new AppError(409, 'no_guest_album', 'Conflict', 'This gallery has no guest uploads album.')
  return { e, g, album }
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/uploads', tags: ['Public gallery'], summary: 'Guest upload: start (same multipart flow as the studio)',
  description: 'Needs settings.guestUploads. Photos go to the "Guest uploads" album, are counted against guestUploadLimit, are watermarked when watermarkGuestUploads is on, and wait for review when reviewGuestUploads is on.',
  middleware: [idempotent] as const,
  request: {
    params: ShortIdParam, headers: IdempotencyHeader,
    body: body(z.object({ files: z.array(UploadFileInput).min(1).max(50), uploadedBy: z.string().trim().min(1).max(120).optional(), albumId: z.string().max(128).optional() }).passthrough()),
  },
  responses: { 201: json(z.object({ uploadId: z.string(), mode: z.enum(['s3', 'proxy']), partSize: z.number(), expiresAt: z.string(), files: z.array(z.object({ photoId: z.string(), filename: z.string(), key: z.string().nullable(), parts: z.array(z.object({ partNumber: z.number(), url: z.string() })) })) }), 'Upload started'), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const { e, g, album } = await guestUploadTarget(c, c.req.valid('param').shortId)
  const input = c.req.valid('json')
  const [{ n }] = await getDb(c.env.DB).select({ n: count() }).from(schema.photos).where(and(eq(schema.photos.albumId, album.id), isNull(schema.photos.deletedAt)))
  const room = Math.max(0, e.settings.guestUploadLimit - n)
  if (input.files.length > room) {
    throw new AppError(409, 'guest_upload_limit', 'Upload limit reached', `This gallery takes ${e.settings.guestUploadLimit} guest photos and has room for ${room} more.`, { extensions: { remaining: room } })
  }
  let uploadedBy = input.uploadedBy
  if (!uploadedBy && g?.guestId) uploadedBy = (await getDb(c.env.DB).select({ n: schema.guests.name }).from(schema.guests).where(eq(schema.guests.id, g.guestId)).limit(1))[0]?.n
  const session = await createUploadSession(c, {
    studioId: e.studioId, eventId: e.id, albumId: album.id, userId: `guest:${g?.guestId ?? 'anon'}`, quality: 'web',
    files: input.files.map((f) => ({ ...f, url: undefined })),
    options: { source: 'guest', uploadedBy: uploadedBy ?? 'Guest', watermark: e.settings.watermarkGuestUploads },
  })
  return c.json(session, 201)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/uploads/{uploadId}/complete', tags: ['Public gallery'], summary: 'Guest upload: finish',
  middleware: [idempotent] as const,
  request: {
    params: ShortIdParam.extend({ uploadId: z.string().max(64).openapi({ param: { name: 'uploadId', in: 'path' } }) }), headers: IdempotencyHeader,
    body: body(z.object({ files: z.array(z.object({ photoId: z.string().max(64), parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).max(10_000).default([]) })).min(1).max(50) })),
  },
  responses: { 201: json(z.object({ items: z.array(Photo) }), 'Photos created'), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const { e, g, album } = await guestUploadTarget(c, c.req.valid('param').shortId)
  const [up] = await getDb(c.env.DB).select().from(schema.uploads).where(and(eq(schema.uploads.id, c.req.valid('param').uploadId), eq(schema.uploads.albumId, album.id))).limit(1)
  if (!up || up.userId !== `guest:${g?.guestId ?? 'anon'}`) throw new NotFound('Upload', c.req.valid('param').uploadId)
  const items = await completeUploadSession(c, { event: e, upload: up, files: c.req.valid('json').files, uploaderName: 'Guest' })
  if (items.length) {
    await getDb(c.env.DB).insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'guest-upload', title: `${items.length} guest upload${items.length === 1 ? '' : 's'}${e.settings.reviewGuestUploads ? ' to review' : ''}`, detail: e.name, at: nowIso() }).run()
    emit(c, e.studioId, 'activity')
  }
  return c.json({ items }, 201)
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
  description: 'Prices come from the studio’s price list; print items need `shipping`. With Razorpay keys the order is `pending` and includes `checkout` for Razorpay Checkout — then call POST /v1/public/orders/:id/confirm (or let the webhook confirm it). Without keys payment is simulated and the order is `paid`. Supports `Idempotency-Key`.',
  middleware: [idempotent] as const,
  request: {
    params: ShortIdParam, headers: IdempotencyHeader,
    body: body(z.object({
      items: z.array(z.object({ priceId: z.string().max(40), photoIds: z.array(z.string().max(128)).max(500), quantity: z.number().int().min(1).max(100).optional() })).min(1).max(20),
      method: z.enum(['upi', 'card', 'netbanking', 'international']),
      buyer: z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254), phone: z.string().max(40).optional() }),
      shipping: ShippingAddressInput.optional(),
    })),
  },
  responses: { 201: json(Order, 'Order created'), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const g = await guestAccess(c, e)
  if (!e.settings.storeEnabled) throw new AppError(409, 'store_disabled', 'Store disabled', 'This gallery isn’t selling photos.')
  const input = c.req.valid('json')
  if (input.items.some((i) => i.priceId.startsWith('print')) && !input.shipping) {
    throw new ValidationFailed([{ field: 'shipping', in: 'body', message: 'Add a delivery address for prints', code: 'required' }])
  }
  const db = getDb(c.env.DB)
  const overrides = e.settings.priceOverrides ?? {}
  const priceRows = (await db.select().from(schema.prices).where(eq(schema.prices.studioId, e.studioId)))
    .map((r) => (typeof overrides[r.id] === 'number' ? { ...r, pricePaise: Math.round(overrides[r.id] * 100) } : r))
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
    guestId: g?.guestId ?? null, shipping: input.shipping ?? null, remindedAt: null, reminderCount: 0, refundedAt: null, refundReason: null, trackingNumber: null, linkSentAt: null,
  }
  await db.insert(schema.orders).values(row).run()
  if (status !== 'pending') {
    await addLedger(db, e.studioId, 'sale', `Order #${number} · ${e.name}`, sharePaise, true)
    await db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'order', title: `Order #${number} · ₹${toMajor(paidPaise).toLocaleString('en-IN')}`, detail: e.name, at: row.at }).run()
  }
  emit(c, e.studioId, 'misc', 'activity')
  return c.json({ ...orderOut(row), ...(checkout ? { checkout } : {}) }, 201)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/orders/{id}/confirm', tags: ['Public gallery'], summary: 'Confirm a Razorpay payment for a pending order',
  description: 'Verifies Razorpay Checkout’s signature (HMAC-SHA256 of `order_id|payment_id` with RAZORPAY_KEY_SECRET), then marks the order paid and books the studio’s share. Idempotent; the webhook does the same server-to-server.',
  request: {
    params: z.object({ id: z.string().max(64).openapi({ param: { name: 'id', in: 'path' } }) }),
    body: body(z.object({ providerOrderId: z.string().max(128), paymentId: z.string().max(128), signature: z.string().max(256) })),
  },
  responses: { 200: json(Order), ...problems(401, 404, 409, 422, 501) },
}), async (c) => {
  if (!c.env.RAZORPAY_KEY_SECRET) throw new NotConfigured('Payments', 'Online payments are not configured (RAZORPAY_KEY_SECRET).')
  const db = getDb(c.env.DB)
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, c.req.valid('param').id)).limit(1)
  if (!order) throw new NotFound('Order', c.req.valid('param').id)
  const input = c.req.valid('json')
  if (order.providerRef && order.providerRef !== input.providerOrderId && order.status === 'pending') throw new AppError(409, 'order_mismatch', 'Conflict', 'This payment belongs to a different order.')
  if (!(await verifyCheckoutSignature(c.env.RAZORPAY_KEY_SECRET, input.providerOrderId, input.paymentId, input.signature))) {
    throw new Unauthorized('The payment signature is invalid.', 'invalid_signature')
  }
  const { order: paid, changed } = await markOrderPaid(db, order)
  if (changed) emit(c, order.studioId, 'misc', 'activity')
  return c.json(orderOut(paid), 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}/me/orders', tags: ['Public gallery'], summary: 'My orders in this gallery',
  description: 'Orders placed with this guest session, or with the registered guest’s email.',
  request: { params: ShortIdParam },
  responses: { 200: json(z.object({ items: z.array(Order) })), ...problems(401, 403, 404) },
}), async (c) => {
  const { e } = await openEvent(c, c.req.valid('param').shortId)
  const g = await guestAccess(c, e)
  if (!g?.guestId) return c.json({ items: [] }, 200)
  const db = getDb(c.env.DB)
  const [guest] = await db.select({ email: schema.guests.email }).from(schema.guests).where(eq(schema.guests.id, g.guestId)).limit(1)
  const o = schema.orders
  const rows = await db.select().from(o).where(and(eq(o.eventId, e.id), or(eq(o.guestId, g.guestId), guest ? eq(o.buyerEmail, guest.email.toLowerCase()) : undefined))).orderBy(desc(o.at)).limit(100)
  return c.json({ items: rows.map(orderOut) }, 200)
})

// ── Studio profile, follows, my galleries ──────────────────────────────────
publicRoutes.openapi(createRoute({
  method: 'get', path: '/studios/{code}', tags: ['Public gallery'], summary: 'Studio profile (follow code or handle)',
  request: { params: CodeParam },
  responses: { 200: json(StudioProfile), ...problems(404) },
}), async (c) => {
  const s = await studioByCode(c, c.req.valid('param').code)
  const full = studioOut(s)
  const db = getDb(c.env.DB)
  const ids = full.app.featuredEventIds.slice(0, 24)
  const rows = ids.length ? await db.select().from(schema.events).where(and(eq(schema.events.studioId, s.id), inArray(schema.events.id, ids), isNull(schema.events.deletedAt))) : []
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

async function followerKey(c: Context<AppEnv>) {
  const g = await readGuest(c).catch(() => null)
  return guestIdentity(c, g) ?? `anon:${await sha256Hex(`${clientIp(c)}|${c.req.header('user-agent') ?? ''}`)}`
}

publicRoutes.openapi(createRoute({
  method: 'post', path: '/studios/{code}/follow', tags: ['Public gallery'], summary: 'Follow a studio',
  description: 'Counted once per X-Guest-Device (else per registered guest, else per IP + browser).',
  request: { params: CodeParam },
  responses: { 200: json(z.object({ followers: z.number().int() })), ...problems(404) },
}), async (c) => {
  const s = await studioByCode(c, c.req.valid('param').code)
  const key = await followerKey(c)
  const db = getDb(c.env.DB)
  const res = await db.insert(schema.studioFollows).values({ studioId: s.id, followerKey: key, at: nowIso() }).onConflictDoNothing().run()
  if (res.meta.changes) await db.update(schema.studios).set({ followers: sql`${schema.studios.followers} + 1` }).where(eq(schema.studios.id, s.id)).run()
  const [after] = await db.select({ f: schema.studios.followers }).from(schema.studios).where(eq(schema.studios.id, s.id)).limit(1)
  if (res.meta.changes) emit(c, s.id, 'studio')
  return c.json({ followers: after?.f ?? 0 }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'delete', path: '/studios/{code}/follow', tags: ['Public gallery'], summary: 'Unfollow a studio',
  request: { params: CodeParam },
  responses: { 200: json(z.object({ followers: z.number().int() })), ...problems(404) },
}), async (c) => {
  const s = await studioByCode(c, c.req.valid('param').code)
  const key = await followerKey(c)
  const db = getDb(c.env.DB)
  const res = await db.delete(schema.studioFollows).where(and(eq(schema.studioFollows.studioId, s.id), eq(schema.studioFollows.followerKey, key))).run()
  if (res.meta.changes) await db.update(schema.studios).set({ followers: sql`max(0, ${schema.studios.followers} - 1)` }).where(eq(schema.studios.id, s.id)).run()
  const [after] = await db.select({ f: schema.studios.followers }).from(schema.studios).where(eq(schema.studios.id, s.id)).limit(1)
  if (res.meta.changes) emit(c, s.id, 'studio')
  return c.json({ followers: after?.f ?? 0 }, 200)
})

async function requireIdentity(c: Context<AppEnv>) {
  const key = guestIdentity(c, await readGuest(c).catch(() => null))
  if (!key) throw new Unauthorized('Send an X-Guest-Device id (or a registered guest token) to see your lists.', 'guest_identity_required')
  return key
}

publicRoutes.openapi(createRoute({
  method: 'get', path: '/me/follows', tags: ['Public gallery'], summary: 'Studios this guest follows',
  request: {},
  responses: { 200: json(z.object({ items: z.array(PublicStudio) })), ...problems(401) },
}), async (c) => {
  const key = await requireIdentity(c)
  const rows = await getDb(c.env.DB).select({ s: schema.studios }).from(schema.studioFollows)
    .innerJoin(schema.studios, eq(schema.studios.id, schema.studioFollows.studioId))
    .where(eq(schema.studioFollows.followerKey, key)).orderBy(desc(schema.studioFollows.at)).limit(200)
  return c.json({ items: rows.map((r) => publicStudioOut(r.s)) }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/me/galleries', tags: ['Public gallery'], summary: 'Galleries this guest opened (newest first)',
  request: {},
  responses: { 200: json(z.object({ items: z.array(PublicEventSummary) })), ...problems(401) },
}), async (c) => {
  const key = await requireIdentity(c)
  const rows = await getDb(c.env.DB).select({ e: schema.events, s: schema.studios, at: schema.guestGalleries.lastOpenedAt }).from(schema.guestGalleries)
    .innerJoin(schema.events, eq(schema.events.id, schema.guestGalleries.eventId))
    .innerJoin(schema.studios, eq(schema.studios.id, schema.events.studioId))
    .where(and(eq(schema.guestGalleries.guestKey, key), isNull(schema.events.deletedAt))).orderBy(desc(schema.guestGalleries.lastOpenedAt)).limit(100)
  return c.json({
    items: rows.map(({ e, s, at }) => ({
      id: e.id, shortId: e.shortId, name: e.name, type: e.type as z.infer<typeof PublicEvent>['type'], date: e.date, city: e.city,
      coverTones: e.coverTones, photoCount: e.photoCount, studioName: s.name, lastOpenedAt: at,
    })),
  }, 200)
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
  const session = vip?.pin || vip?.all ? await issueGuestSession(c, e, { seeAll: !!vip.all || !e.settings.facePrivacy || !e.settings.faceSearch, vipPin: !!vip.pin }) : undefined
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
  const rows: (typeof p.$inferSelect)[] = []
  if (z0.photoIds?.length) {
    for (const part of chunk(z0.photoIds)) rows.push(...await db.select().from(p).where(and(inArray(p.id, part), eq(p.status, 'ready'), isNull(p.deletedAt))))
  } else {
    rows.push(...await db.select().from(p).where(and(eq(p.eventId, z0.eventId), eq(p.status, 'ready'), isNull(p.deletedAt),
      z0.albumId ? eq(p.albumId, z0.albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${z0.eventId} AND kind = 'album' AND deleted_at IS NULL)`)).orderBy(asc(p.capturedAt)).limit(5000))
  }
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
