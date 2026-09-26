import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { PRESETS, defaultSettings, hash, tone } from '@frameline/shared'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { accessRequestOut, eventOut, filmOut, guestOut, personOut } from '../db/mappers'
import { Conflict, NotFound } from '../lib/errors'
import { newId, newShortId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import {
  AccessRequest, EventPatch, EventSettingsPatch, EventStatus, Film, Guest, NewEventInput, Person, PhotoEvent,
} from '../schemas/domain'
import { audit } from '../services/audit'
import { eventForMember, newPin } from '../services/events'
import { background } from '../lib/http'
import { emit } from '../services/realtime'
import { vectorIndex } from '../services/vectors'

export const eventRoutes = createRouter()

// ── Events ─────────────────────────────────────────────────────────────────
eventRoutes.openapi(createRoute({
  method: 'get', path: '/events', tags: ['Events'], summary: 'List events (newest first)', security,
  description: 'Uploaders only see events they are assigned to.',
  middleware: [requireStudio('uploader')] as const,
  request: { query: PageQuery.extend({ status: EventStatus.optional() }) },
  responses: { 200: json(pageOf(PhotoEvent, 'EventPage')), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor, status } = c.req.valid('query')
  const e = schema.events
  if (m.role === 'uploader' && m.eventIds.length === 0) return c.json({ items: [], nextCursor: null }, 200)
  const rows = await getDb(c.env.DB).select().from(e).where(and(
    eq(e.studioId, m.studioId),
    status ? eq(e.status, status) : undefined,
    m.role === 'uploader' ? inArray(e.id, m.eventIds) : undefined,
    afterCursor(e.createdAt, e.id, 'desc', cursor),
  )).orderBy(desc(e.createdAt), desc(e.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], eventOut), 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events', tags: ['Events'], summary: 'Create an event from a preset', security,
  middleware: [requireStudio('editor', 'create events'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(NewEventInput) },
  responses: { 201: json(PhotoEvent, 'Created'), ...problems(401, 403, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const input = c.req.valid('json')
  const db = getDb(c.env.DB)
  const id = newId('ev')
  const t = hash(id)
  const date = new Date(input.date)
  const now = nowIso()
  let shortId = newShortId()
  for (let i = 0; i < 5; i++) {
    const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.shortId, shortId)).limit(1)
    if (!taken) break
    shortId = newShortId()
  }
  const row: typeof schema.events.$inferInsert = {
    id, studioId: m.studioId, shortId, name: input.name, type: input.type, date: date.toISOString(), city: input.city,
    status: 'draft', photoCount: 0, photoLimit: 2000, visits: { web: 0, android: 0, ios: 0 }, faceMatches: 0,
    expiresAt: new Date(date.getTime() + 365 * 86_400_000).toISOString(), createdAt: now,
    coverTones: [tone(t), tone(t + 3), tone(t + 7)],
    settings: defaultSettings({ ...PRESETS[input.preset].settings, guestUploadLimit: input.guestUploadLimit, pin: newPin() }),
    hosts: input.host ? [{ id: newId('h'), name: input.host.email.split('@')[0], email: input.host.email, phone: input.host.phone, role: 'client' }] : [],
    highlights: true, plan: 'subscription',
  }
  await db.batch([
    db.insert(schema.events).values(row),
    db.insert(schema.albums).values({ id: `${id}_guest`, eventId: id, studioId: m.studioId, name: 'Guest uploads', order: 99, photoCount: 0, kind: 'guest', createdAt: now }),
  ])
  audit(c, 'event.create', { type: 'event', id }, { name: input.name, preset: input.preset })
  emit(c, m.studioId, 'events', 'albums')
  return c.json(eventOut(await eventForMember(db, m, id)), 201)
})

eventRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}', tags: ['Events'], summary: 'Get an event by id or short id', security,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam },
  responses: { 200: json(PhotoEvent), ...problems(401, 403, 404) },
}), async (c) => c.json(eventOut(await eventForMember(getDb(c.env.DB), membershipOf(c), c.req.valid('param').id)), 200))

eventRoutes.openapi(createRoute({
  method: 'patch', path: '/events/{id}', tags: ['Events'], summary: 'Update event details', security,
  middleware: [requireStudio('editor', 'edit events')] as const,
  request: { params: IdParam, body: body(EventPatch) },
  responses: { 200: json(PhotoEvent), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const patch = c.req.valid('json')
  const norm = { ...patch }
  for (const k of ['date', 'endDate', 'expiresAt'] as const) if (norm[k]) norm[k] = new Date(norm[k]!).toISOString()
  if (Object.keys(norm).length) await db.update(schema.events).set(norm).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.update', { type: 'event', id: ev.id }, { fields: Object.keys(patch) })
  emit(c, m.studioId, 'events')
  return c.json(eventOut(await eventForMember(db, m, ev.id)), 200)
})

eventRoutes.openapi(createRoute({
  method: 'patch', path: '/events/{id}/settings', tags: ['Events'], summary: 'Update guest-facing event settings', security,
  middleware: [requireStudio('editor', 'change event settings')] as const,
  request: { params: IdParam, body: body(EventSettingsPatch) },
  responses: { 200: json(PhotoEvent), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const patch = c.req.valid('json')
  await db.update(schema.events).set({ settings: { ...ev.settings, ...patch } }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.settings', { type: 'event', id: ev.id }, { patch })
  emit(c, m.studioId, 'events')
  return c.json(eventOut(await eventForMember(db, m, ev.id)), 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/pin/reset', tags: ['Events'], summary: 'Generate a new gallery PIN', security,
  middleware: [requireStudio('editor', 'reset the PIN')] as const,
  request: { params: IdParam },
  responses: { 200: json(z.object({ pin: z.string() })), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const pin = newPin()
  await db.update(schema.events).set({ settings: { ...ev.settings, pin } }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.pin_reset', { type: 'event', id: ev.id })
  emit(c, m.studioId, 'events')
  return c.json({ pin }, 200)
})

/** Deletes an event's R2 objects and face vectors after the DB rows are gone. */
async function purgeEventStorage(env: Env, studioId: string, eventId: string, vectorIds: string[]) {
  const prefix = `studios/${studioId}/events/${eventId}/`
  let cursor: string | undefined
  do {
    const page = await env.MEDIA.list({ prefix, cursor, limit: 1000 })
    if (page.objects.length) await env.MEDIA.delete(page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  const faces = vectorIndex(env)
  if (faces && vectorIds.length) {
    for (let i = 0; i < vectorIds.length; i += 1000) await faces.deleteByIds(vectorIds.slice(i, i + 1000)).catch(() => undefined)
  }
}

eventRoutes.openapi(createRoute({
  method: 'delete', path: '/events/{id}', tags: ['Events'], summary: 'Delete an event and everything in it', security,
  middleware: [requireStudio('editor', 'delete events')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const vectors = await db.select({ v: schema.faces.vectorId }).from(schema.faces).where(and(eq(schema.faces.eventId, ev.id), isNotNull(schema.faces.vectorId)))
  await db.batch([
    db.delete(schema.cameras).where(eq(schema.cameras.eventId, ev.id)),
    db.delete(schema.smartQrs).where(eq(schema.smartQrs.eventId, ev.id)),
    db.delete(schema.events).where(eq(schema.events.id, ev.id)),
  ])
  background(c, purgeEventStorage(c.env, m.studioId, ev.id, vectors.map((r) => r.v!).filter(Boolean)))
  audit(c, 'event.delete', { type: 'event', id: ev.id }, { name: ev.name })
  emit(c, m.studioId, 'events', 'albums', 'photos', 'misc')
  return c.body(null, 204)
})

// ── People, films, guests, access requests ─────────────────────────────────
eventRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/people', tags: ['People'], summary: 'People recognised in an event', security,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(Person, 'PersonPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const p = schema.people
  const rows = await db.select().from(p).where(and(eq(p.eventId, ev.id), afterCursor(p.photoCount, p.id, 'desc', cursor)))
    .orderBy(desc(p.photoCount), desc(p.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.photoCount, r.id], personOut), 200)
})

eventRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/films', tags: ['Films'], summary: 'Films linked to an event', security,
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(Film, 'FilmPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const f = schema.films
  const rows = await db.select().from(f).where(and(eq(f.eventId, ev.id), afterCursor(f.createdAt, f.id, 'asc', cursor)))
    .orderBy(asc(f.createdAt), asc(f.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], filmOut), 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/films', tags: ['Films'], summary: 'Add a film link', security,
  middleware: [requireStudio('editor', 'add films'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader, body: body(z.object({ name: z.string().trim().min(1).max(160), url: z.url().max(2048) })) },
  responses: { 201: json(Film, 'Created'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { name, url } = c.req.valid('json')
  const film = { id: newId('film'), eventId: ev.id, name, url, createdAt: nowIso() }
  await db.insert(schema.films).values(film).run()
  emit(c, m.studioId, 'misc')
  return c.json(filmOut(film), 201)
})

eventRoutes.openapi(createRoute({
  method: 'delete', path: '/films/{id}', tags: ['Films'], summary: 'Remove a film link', security,
  middleware: [requireStudio('editor', 'remove films')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const [film] = await db.select().from(schema.films).where(eq(schema.films.id, c.req.valid('param').id)).limit(1)
  if (!film) throw new NotFound('Film', c.req.valid('param').id)
  await eventForMember(db, m, film.eventId)
  await db.delete(schema.films).where(eq(schema.films.id, film.id)).run()
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

eventRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/guests', tags: ['Guests'], summary: 'Registered guests (most recently active first)', security,
  middleware: [requireStudio('editor', 'view guests')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(Guest, 'GuestPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const g = schema.guests
  const rows = await db.select().from(g).where(and(eq(g.eventId, ev.id), afterCursor(g.lastActive, g.id, 'desc', cursor)))
    .orderBy(desc(g.lastActive), desc(g.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.lastActive, r.id], guestOut), 200)
})

eventRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/access-requests', tags: ['Guests'], summary: 'Pending access requests', security,
  middleware: [requireStudio('editor', 'view access requests')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(AccessRequest, 'AccessRequestPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const a = schema.accessRequests
  const rows = await db.select().from(a).where(and(eq(a.eventId, ev.id), eq(a.status, 'pending'), afterCursor(a.createdAt, a.id, 'desc', cursor)))
    .orderBy(desc(a.createdAt), desc(a.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], accessRequestOut), 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/access-requests/{id}/resolve', tags: ['Guests'], summary: 'Approve or decline an access request', security,
  description: 'Approving adds the requester as a guest of the event.',
  middleware: [requireStudio('editor', 'resolve access requests')] as const,
  request: { params: IdParam, body: body(z.object({ approve: z.boolean() })) },
  responses: { 204: NoContent, ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { approve } = c.req.valid('json')
  const a = schema.accessRequests
  const [req] = await db.select().from(a).where(eq(a.id, c.req.valid('param').id)).limit(1)
  if (!req) throw new NotFound('Access request', c.req.valid('param').id)
  await eventForMember(db, m, req.eventId)
  if (req.status !== 'pending') throw new Conflict('This request was already resolved.', 'already_resolved')
  const now = nowIso()
  await db.batch([
    db.update(a).set({ status: approve ? 'approved' : 'declined', resolvedAt: now, resolvedBy: c.get('user')?.id ?? null }).where(eq(a.id, req.id)),
    ...(approve ? [db.insert(schema.guests).values({ id: newId('g'), eventId: req.eventId, name: req.name, email: req.email, phone: '', role: 'guest', favourites: [], lastActive: now, registeredAt: now })] : []),
  ])
  audit(c, approve ? 'access.approved' : 'access.declined', { type: 'access_request', id: req.id })
  emit(c, m.studioId, 'guests')
  return c.body(null, 204)
})
