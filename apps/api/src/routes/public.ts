import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { mediaUrl } from '../db/mappers'
import { timingSafeEqual } from '../lib/crypto'
import { Forbidden, NotFound, ServiceUnavailable, Unauthorized, ValidationFailed } from '../lib/errors'
import { background } from '../lib/http'
import { newId, nowIso } from '../lib/ids'
import { signJwt } from '../lib/jwt'
import { body, createRouter, json, problems } from '../lib/openapi'
import { PageQuery, afterCursor, toPage } from '../lib/pagination'
import { guestFromRequest } from '../middleware/auth'
import { limits } from '../middleware/rate-limit'
import { Album, Tone } from '../schemas/domain'
import { chunk } from './photos'
import { emit } from '../services/realtime'
import { vectorIndex } from '../services/vectors'

export const publicRoutes = createRouter()
publicRoutes.use('*', limits.publicGallery)

const GUEST_TTL_SEC = 12 * 3600
const ShortIdParam = z.object({ shortId: z.string().regex(/^[0-9A-Fa-f]{7}$/, 'Gallery codes are 7 characters').openapi({ param: { name: 'shortId', in: 'path' }, example: '6402F9F' }) })

const PublicEvent = z.object({
  shortId: z.string(), name: z.string(), type: z.string(), date: z.string(), city: z.string(), coverTones: z.array(Tone),
  studio: z.object({ name: z.string(), handle: z.string(), brandColor: z.string(), logoUrl: z.string().optional() }),
  access: z.enum(['link', 'link-pin', 'registered']), requiresPin: z.boolean(), requiresRegistration: z.boolean(),
  faceSearch: z.boolean(), facePrivacy: z.boolean(), downloads: z.enum(['all', 'own', 'none']), guestUploads: z.boolean(), storeEnabled: z.boolean(),
}).openapi('PublicEvent')

const PublicPhoto = z.object({
  id: z.string(), albumId: z.string(), capturedAt: z.string(), tone: Tone, url: z.string().optional(), width: z.number().int(), height: z.number().int(),
}).openapi('PublicPhoto')

async function publicEvent(c: Context<AppEnv>, shortId: string) {
  const db = getDb(c.env.DB)
  const [row] = await db.select({ e: schema.events, s: schema.studios }).from(schema.events)
    .innerJoin(schema.studios, eq(schema.studios.id, schema.events.studioId))
    .where(eq(schema.events.shortId, shortId.toUpperCase())).limit(1)
  if (!row || row.e.settings.disabled || row.e.status === 'draft' || row.e.status === 'archived') throw new NotFound('Gallery', shortId.toUpperCase())
  return row
}

/** Requires a guest token issued for this event. */
async function guestFor(c: Context<AppEnv>, eventId: string) {
  const g = await guestFromRequest(c)
  if (!g) throw new Unauthorized('Open the gallery first (POST …/access) to get a guest token.', 'guest_token_required')
  if (g.eventId !== eventId) throw new Forbidden('This gallery token belongs to a different event.', 'wrong_event')
  c.set('guest', g)
  return g
}

const publicPhoto = (r: typeof schema.photos.$inferSelect, base?: string) => ({
  id: r.id, albumId: r.albumId, capturedAt: r.capturedAt, tone: r.tone,
  url: r.url ?? (r.r2Key ? mediaUrl(r.r2Key, base) : undefined), width: r.exif.width, height: r.exif.height,
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}', tags: ['Public gallery'], summary: 'Gallery landing info',
  request: { params: ShortIdParam, query: z.object({ platform: z.enum(['web', 'android', 'ios']).default('web') }) },
  responses: { 200: json(PublicEvent), ...problems(404) },
}), async (c) => {
  const { e, s } = await publicEvent(c, c.req.valid('param').shortId)
  const platform = c.req.valid('query').platform
  background(c, getDb(c.env.DB).run(sql`UPDATE events SET visits = json_set(visits, ${'$.' + platform}, coalesce(json_extract(visits, ${'$.' + platform}), 0) + 1) WHERE id = ${e.id}`))
  const st = e.settings
  return c.json({
    shortId: e.shortId, name: e.name, type: e.type, date: e.date, city: e.city, coverTones: e.coverTones,
    studio: { name: s.name, handle: s.handle, brandColor: s.brandColor, ...(s.logoUrl ? { logoUrl: s.logoUrl } : {}) },
    access: st.access, requiresPin: st.access === 'link-pin', requiresRegistration: st.requireRegistration || st.access === 'registered',
    faceSearch: st.faceSearch, facePrivacy: st.facePrivacy, downloads: st.downloads, guestUploads: st.guestUploads, storeEnabled: st.storeEnabled,
  }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/access', tags: ['Public gallery'], summary: 'Enter the gallery (PIN / registration) and get a guest token',
  description: 'PIN attempts are limited to 10 per 15 minutes per IP per gallery.',
  middleware: [limits.pin] as const,
  request: {
    params: ShortIdParam,
    body: body(z.object({
      pin: z.string().max(10).optional(), name: z.string().trim().min(1).max(120).optional(),
      email: z.email().max(254).optional(), phone: z.string().max(40).optional(),
    })),
  },
  responses: {
    200: json(z.object({ guestToken: z.string(), expiresIn: z.number().int(), guestId: z.string().nullable() }).openapi('GuestSession')),
    ...problems(401, 404, 422),
  },
}), async (c) => {
  const { e } = await publicEvent(c, c.req.valid('param').shortId)
  const input = c.req.valid('json')
  const st = e.settings
  if (st.access === 'link-pin' && !(input.pin && timingSafeEqual(input.pin, st.pin))) {
    throw new Unauthorized('That PIN is wrong. Check the invite message or ask the photographer.', 'invalid_pin')
  }
  let guestId: string | null = null
  if (st.requireRegistration || st.access === 'registered') {
    const errors = [
      ...(!input.name ? [{ field: 'name', in: 'body' as const, message: 'Enter your name', code: 'required' }] : []),
      ...(!input.email ? [{ field: 'email', in: 'body' as const, message: 'Enter your email', code: 'required' }] : []),
    ]
    if (errors.length) throw new ValidationFailed(errors, 'This gallery asks guests to register with their name and email.')
  }
  if (input.name && input.email) {
    const db = getDb(c.env.DB)
    const email = input.email.toLowerCase()
    const [existing] = await db.select().from(schema.guests).where(and(eq(schema.guests.eventId, e.id), eq(schema.guests.email, email))).limit(1)
    const now = nowIso()
    if (existing) {
      guestId = existing.id
      await db.update(schema.guests).set({ lastActive: now, name: input.name, ...(input.phone ? { phone: input.phone } : {}) }).where(eq(schema.guests.id, existing.id)).run()
    } else {
      guestId = newId('g')
      await db.batch([
        db.insert(schema.guests).values({ id: guestId, eventId: e.id, name: input.name, email, phone: input.phone ?? '', role: 'guest', favourites: [], lastActive: now, registeredAt: now }),
        db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'registration', title: `${input.name} registered`, detail: e.name, at: now }),
      ])
      emit(c, e.studioId, 'guests', 'activity')
    }
  }
  const guestToken = await signJwt(c.env.JWT_SECRET, { sub: e.id, aud: 'guest', sid: e.studioId, ...(guestId ? { gid: guestId } : {}) }, GUEST_TTL_SEC)
  return c.json({ guestToken, expiresIn: GUEST_TTL_SEC, guestId }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}/albums', tags: ['Public gallery'], summary: 'Albums visible to guests',
  request: { params: ShortIdParam },
  responses: { 200: json(z.object({ items: z.array(Album), nextCursor: z.null() })), ...problems(401, 403, 404) },
}), async (c) => {
  const { e } = await publicEvent(c, c.req.valid('param').shortId)
  await guestFor(c, e.id)
  const rows = await getDb(c.env.DB).select().from(schema.albums).where(and(eq(schema.albums.eventId, e.id), eq(schema.albums.kind, 'album'))).orderBy(asc(schema.albums.order))
  return c.json({ items: rows.map((a) => ({ id: a.id, eventId: a.eventId, name: a.name, order: a.order, photoCount: a.photoCount, kind: a.kind })), nextCursor: null }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'get', path: '/events/{shortId}/photos', tags: ['Public gallery'], summary: 'Browse gallery photos',
  description: 'Unavailable when face privacy is on (guests only see their own photos via selfie search).',
  request: { params: ShortIdParam, query: PageQuery.extend({ albumId: z.string().max(128).optional() }) },
  responses: { 200: json(z.object({ items: z.array(PublicPhoto), nextCursor: z.string().nullable() })), ...problems(401, 403, 404) },
}), async (c) => {
  const { e } = await publicEvent(c, c.req.valid('param').shortId)
  await guestFor(c, e.id)
  if (e.settings.facePrivacy) throw new Forbidden('This gallery shows each guest only their own photos. Take a selfie to find yours.', 'face_privacy')
  const { limit, cursor, albumId } = c.req.valid('query')
  const p = schema.photos
  const rows = await getDb(c.env.DB).select().from(p).where(and(
    eq(p.eventId, e.id), eq(p.hidden, false), eq(p.status, 'ready'),
    albumId ? eq(p.albumId, albumId) : sql`${p.albumId} IN (SELECT id FROM albums WHERE event_id = ${e.id} AND kind = 'album')`,
    afterCursor(p.capturedAt, p.id, 'asc', cursor),
  )).orderBy(asc(p.capturedAt), asc(p.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.capturedAt, r.id], (r) => publicPhoto(r, c.env.PUBLIC_MEDIA_BASE)), 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/selfie', tags: ['Public gallery'], summary: 'Find my photos (face search)',
  description: 'Accepts a face embedding (512-d from the processor’s InsightFace model; in dev you may pass any vector matching the index). Queries Vectorize in the event’s namespace.',
  request: {
    params: ShortIdParam,
    body: body(z.object({
      embedding: z.array(z.number().finite()).min(64).max(2048),
      minScore: z.number().min(0).max(1).default(0.5),
    })),
  },
  responses: { 200: json(z.object({ matches: z.number().int(), items: z.array(PublicPhoto) })), ...problems(401, 403, 404, 422, 503) },
}), async (c) => {
  const { e } = await publicEvent(c, c.req.valid('param').shortId)
  await guestFor(c, e.id)
  if (!e.settings.faceSearch) throw new Forbidden('Face search is turned off for this gallery.', 'face_search_disabled')
  const faces = vectorIndex(c.env)
  if (!faces) throw new ServiceUnavailable('Face search is not available right now.', 'face_search_unavailable')
  const { embedding, minScore } = c.req.valid('json')
  let result: VectorizeMatches
  try {
    result = await faces.query(embedding, { topK: 100, namespace: e.id, returnMetadata: 'none', returnValues: false })
  } catch (err) {
    const msg = String(err)
    if (/dimension/i.test(msg)) throw new ValidationFailed([{ field: 'embedding', in: 'body', message: 'Embedding has the wrong number of dimensions for this index', code: 'dimension_mismatch' }])
    console.error(JSON.stringify({ level: 'error', msg: 'vectorize query failed', error: msg }))
    throw new ServiceUnavailable('Face search is not available right now.', 'face_search_unavailable')
  }
  const vectorIds = result.matches.filter((mt) => mt.score >= minScore).map((mt) => mt.id)
  const db = getDb(c.env.DB)
  const photoIds = new Set<string>()
  for (const part of chunk(vectorIds)) {
    for (const f of await db.select({ photoId: schema.faces.photoId }).from(schema.faces).where(and(eq(schema.faces.eventId, e.id), inArray(schema.faces.vectorId, part)))) photoIds.add(f.photoId)
  }
  const photos: (typeof schema.photos.$inferSelect)[] = []
  for (const part of chunk([...photoIds])) {
    photos.push(...await db.select().from(schema.photos).where(and(inArray(schema.photos.id, part), eq(schema.photos.hidden, false), eq(schema.photos.status, 'ready'))))
  }
  photos.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  if (photos.length) {
    const now = nowIso()
    background(c, db.batch([
      db.update(schema.events).set({ faceMatches: sql`${schema.events.faceMatches} + 1` }).where(eq(schema.events.id, e.id)),
      db.insert(schema.activity).values({ id: newId('act'), studioId: e.studioId, kind: 'face', title: `A guest found ${photos.length} photos of themselves`, detail: e.name, at: now }),
    ]))
    emit(c, e.studioId, 'activity', 'events')
  }
  return c.json({ matches: photos.length, items: photos.map((r) => publicPhoto(r, c.env.PUBLIC_MEDIA_BASE)) }, 200)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/events/{shortId}/access-requests', tags: ['Public gallery'], summary: 'Ask the photographer for access',
  request: { params: ShortIdParam, body: body(z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254), note: z.string().max(1000).default('') })) },
  responses: { 202: json(z.object({ received: z.literal(true) }), 'Request received'), ...problems(404, 422) },
}), async (c) => {
  const { e } = await publicEvent(c, c.req.valid('param').shortId)
  const input = c.req.valid('json')
  await getDb(c.env.DB).insert(schema.accessRequests).values({ id: newId('ar'), eventId: e.id, name: input.name, email: input.email.toLowerCase(), note: input.note, status: 'pending', createdAt: nowIso() }).run()
  emit(c, e.studioId, 'guests')
  return c.json({ received: true as const }, 202)
})

publicRoutes.openapi(createRoute({
  method: 'post', path: '/studios/{handle}/enquiries', tags: ['Public gallery'], summary: 'Send an enquiry to a studio',
  request: {
    params: z.object({ handle: z.string().regex(/^[a-z0-9-]{3,40}$/).openapi({ param: { name: 'handle', in: 'path' }, example: 'northlight' }) }),
    body: body(z.object({
      name: z.string().trim().min(1).max(120), phone: z.string().max(40).default(''), email: z.email().max(254).or(z.literal('')).default(''),
      message: z.string().trim().min(1).max(4000), source: z.string().max(120).default('Website'),
    }).refine((b) => b.phone || b.email, { message: 'Leave a phone number or an email so the studio can reply', path: ['email'] })),
  },
  responses: { 201: json(z.object({ id: z.string() }), 'Sent'), ...problems(404, 422) },
}), async (c) => {
  const db = getDb(c.env.DB)
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.handle, c.req.valid('param').handle)).limit(1)
  if (!studio) throw new NotFound('Studio', c.req.valid('param').handle)
  const input = c.req.valid('json')
  const id = newId('enq')
  const now = nowIso()
  await db.batch([
    db.insert(schema.enquiries).values({ id, studioId: studio.id, ...input, at: now }),
    db.insert(schema.activity).values({ id: newId('act'), studioId: studio.id, kind: 'enquiry', title: `New enquiry from ${input.name}`, detail: input.source, at: now }),
  ])
  emit(c, studio.id, 'misc', 'activity')
  return c.json({ id }, 201)
})

