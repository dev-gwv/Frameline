import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { BASE_RENEWAL, PACKS, PRESETS, RENEWAL_CREDIT_DISCOUNT, TRASH_DAYS, defaultSettings, hash, selfieHasNoFace, tone, withSettingsDefaults, type EventHost as Host } from '@frameline/shared'
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
  AccessRequest, EventPatch, EventSettingsPatch, EventStats, EventStatus, FaceSearchInput, FaceSearchResult, Film, Guest, GuestLinkPayload, NewEventInput, Person, PhotoEvent, Purchase,
} from '../schemas/domain'
import { getMailer } from '../services/mailer'
import { debitWallet, recordPurchase } from '../services/billing'
import { matchFaces } from '../services/faces'
import { purchaseOut } from '../db/mappers'
import { sql } from 'drizzle-orm'
import { createSignedLink } from '../services/guest-links'
import { toMinor } from '../lib/money'
import { audit } from '../services/audit'
import { eventForMember, newPin } from '../services/events'
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
    isNull(e.deletedAt),
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
    hosts: input.host ? [{ id: newId('h'), name: input.host.email.split('@')[0], email: input.host.email, phone: input.host.phone, role: 'client', access: 'full', status: 'invited', invitedAt: now }] : [],
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
  responses: { 200: json(PhotoEvent), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const patch = c.req.valid('json')
  if (patch.shortId && patch.shortId !== ev.shortId) {
    const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.shortId, patch.shortId)).limit(1)
    if (taken) throw new Conflict(`The gallery code ${patch.shortId} is already used. Try another.`, 'short_id_taken')
  }
  const norm = { ...patch }
  for (const k of ['date', 'endDate', 'expiresAt'] as const) if (norm[k]) norm[k] = new Date(norm[k]!).toISOString()
  let invited: Host[] = []
  if (patch.hosts) {
    // Clients may add/remove hosts and change `access`; `status` and `invitedAt` stay server-owned.
    const before = new Map(ev.hosts.map((h) => [h.id, h]))
    const now = nowIso()
    norm.hosts = patch.hosts.map((h) => {
      const old = before.get(h.id)
      if (old) return { ...h, access: h.access ?? old.access ?? 'full', status: old.status ?? 'invited', invitedAt: old.invitedAt }
      const fresh = { ...h, access: h.access ?? 'full', status: 'invited' as const, invitedAt: now }
      invited.push(fresh)
      return fresh
    })
  }
  if (Object.keys(norm).length) await db.update(schema.events).set(norm).where(eq(schema.events.id, ev.id)).run()
  if (invited.length) await inviteHosts(c.env, ev, invited).catch(() => undefined)
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
  await db.update(schema.events).set({ settings: withSettingsDefaults({ ...withSettingsDefaults(ev.settings), ...patch }) }).where(eq(schema.events.id, ev.id)).run()
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
  await db.update(schema.events).set({ settings: { ...withSettingsDefaults(ev.settings), pin } }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.pin_reset', { type: 'event', id: ev.id })
  emit(c, m.studioId, 'events')
  return c.json({ pin }, 200)
})

/** Tells new hosts about the event: email when there is one, else a (simulated) SMS/WhatsApp log line. */
async function inviteHosts(env: Env, ev: typeof schema.events.$inferSelect, hosts: Host[]) {
  const link = `${env.GALLERY_URL.replace(/\/$/, '')}/${ev.shortId.toLowerCase()}`
  for (const h of hosts) {
    const what = h.access === 'upload' ? 'upload photos to' : 'help run'
    const text = `You've been added as a host so you can ${what} ${ev.name} on Frameline. Open ${link} with this ${h.email ? 'email' : 'number'} to accept.`
    if (h.email) await getMailer(env).send({ to: h.email, subject: `You're a host for ${ev.name}`, text })
    else console.log(JSON.stringify({ level: 'info', msg: 'host invite (simulated SMS/WhatsApp — not sent)', to: h.phone, text }))
  }
}

/** Hard-deletes a trashed event: rows (cascade), cameras, QR codes, R2 files and face vectors. */
export async function purgeEvent(env: Env, studioId: string, eventId: string) {
  const db = getDb(env.DB)
  const vectors = await db.select({ v: schema.faces.vectorId }).from(schema.faces).where(and(eq(schema.faces.eventId, eventId), isNotNull(schema.faces.vectorId)))
  await db.batch([
    db.delete(schema.cameras).where(eq(schema.cameras.eventId, eventId)),
    db.delete(schema.smartQrs).where(eq(schema.smartQrs.eventId, eventId)),
    db.delete(schema.events).where(eq(schema.events.id, eventId)),
  ])
  await purgeEventStorage(env, studioId, eventId, vectors.map((r) => r.v!).filter(Boolean))
}

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
  method: 'delete', path: '/events/{id}', tags: ['Events'], summary: 'Move an event to the trash (or delete a trashed one for good)', security,
  description: 'The event disappears from lists and its gallery closes. Restore it within 30 days; after that a daily job deletes it with its photos, files and face data. `?permanent=true` on an event that is already in the trash deletes it for good now ("Delete forever"); 409 `not_in_trash` otherwise.',
  middleware: [requireStudio('editor', 'delete events')] as const,
  request: { params: IdParam, query: z.object({ permanent: z.enum(['true', 'false', '1', '0']).optional().transform((v) => v === 'true' || v === '1') }) },
  responses: { 204: NoContent, ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { permanent } = c.req.valid('query')
  if (permanent) {
    const trashed = await eventForMember(db, m, c.req.valid('param').id, { includeDeleted: true })
    if (!trashed.deletedAt) throw new Conflict('Move the event to the trash first; only trashed events can be deleted for good.', 'not_in_trash')
    await purgeEvent(c.env, m.studioId, trashed.id)
    audit(c, 'event.purge', { type: 'event', id: trashed.id }, { name: trashed.name })
    emit(c, m.studioId, 'events', 'misc')
    return c.body(null, 204)
  }
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  await db.update(schema.events).set({ deletedAt: nowIso() }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.trash', { type: 'event', id: ev.id }, { name: ev.name })
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
  const rows = await db.select().from(g).where(and(eq(g.eventId, ev.id), isNull(g.removedAt), afterCursor(g.lastActive, g.id, 'desc', cursor)))
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
  const guestId = approve ? newId('g') : null
  await db.batch([
    db.update(a).set({ status: approve ? 'approved' : 'declined', resolvedAt: now, resolvedBy: c.get('user')?.id ?? null, guestId }).where(eq(a.id, req.id)),
    ...(approve ? [db.insert(schema.guests).values({ id: guestId!, eventId: req.eventId, name: req.name, email: req.email, phone: '', role: 'guest', favourites: [], lastActive: now, registeredAt: now })] : []),
  ])
  audit(c, approve ? 'access.approved' : 'access.declined', { type: 'access_request', id: req.id })
  emit(c, m.studioId, 'guests')
  return c.body(null, 204)
})

eventRoutes.openapi(createRoute({
  method: 'patch', path: '/films/{id}', tags: ['Films'], summary: 'Rename a film or change its link', security,
  middleware: [requireStudio('editor', 'edit films')] as const,
  request: { params: IdParam, body: body(z.object({ name: z.string().trim().min(1).max(160), url: z.url().max(2048) }).partial().strict()) },
  responses: { 200: json(Film), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const id = c.req.valid('param').id
  const [film] = await db.select().from(schema.films).where(eq(schema.films.id, id)).limit(1)
  if (!film) throw new NotFound('Film', id)
  await eventForMember(db, m, film.eventId)
  const patch = c.req.valid('json')
  if (Object.keys(patch).length) await db.update(schema.films).set(patch).where(eq(schema.films.id, id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(filmOut({ ...film, ...patch }), 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/access-requests/{id}/reopen', tags: ['Guests'], summary: 'Undo approving or declining an access request', security,
  description: 'The request is pending again; a guest added by approving it is removed.',
  middleware: [requireStudio('editor', 'resolve access requests'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader },
  responses: { 200: json(AccessRequest), ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const a = schema.accessRequests
  const [req] = await db.select().from(a).where(eq(a.id, c.req.valid('param').id)).limit(1)
  if (!req) throw new NotFound('Access request', c.req.valid('param').id)
  await eventForMember(db, m, req.eventId)
  if (req.status === 'pending') throw new Conflict('This request is still waiting for a decision.', 'not_resolved')
  await db.batch([
    db.update(a).set({ status: 'pending', resolvedAt: null, resolvedBy: null, guestId: null }).where(eq(a.id, req.id)),
    ...(req.guestId ? [db.delete(schema.guests).where(eq(schema.guests.id, req.guestId))] : []),
  ])
  audit(c, 'access.reopened', { type: 'access_request', id: req.id })
  emit(c, m.studioId, 'guests')
  return c.json(accessRequestOut(req), 200)
})

async function guestForMember(db: ReturnType<typeof getDb>, m: Parameters<typeof eventForMember>[1], id: string) {
  const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, id)).limit(1)
  if (!g) throw new NotFound('Guest', id)
  await eventForMember(db, m, g.eventId)
  return g
}

eventRoutes.openapi(createRoute({
  method: 'delete', path: '/guests/{id}', tags: ['Guests'], summary: 'Remove a guest’s access', security,
  description: 'They drop out of the Guests list and their gallery session stops working (403 `guest_removed`). Undo with POST /guests/{id}/restore.',
  middleware: [requireStudio('editor', 'manage guests')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const g = await guestForMember(db, m, c.req.valid('param').id)
  if (!g.removedAt) await db.update(schema.guests).set({ removedAt: nowIso() }).where(eq(schema.guests.id, g.id)).run()
  audit(c, 'guest.removed', { type: 'guest', id: g.id })
  emit(c, m.studioId, 'guests')
  return c.body(null, 204)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/guests/{id}/restore', tags: ['Guests'], summary: 'Give a removed guest their access back', security,
  middleware: [requireStudio('editor', 'manage guests'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader },
  responses: { 200: json(Guest), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const g = await guestForMember(db, m, c.req.valid('param').id)
  await db.update(schema.guests).set({ removedAt: null }).where(eq(schema.guests.id, g.id)).run()
  audit(c, 'guest.restored', { type: 'guest', id: g.id })
  emit(c, m.studioId, 'guests')
  return c.json(guestOut({ ...g, removedAt: null }), 200)
})

eventRoutes.openapi(createRoute({
  method: 'get', path: '/events/{id}/stats', tags: ['Events'], summary: 'Event totals: visits, views, downloads, favourites, face finding', security,
  description: '`faces` is face finding progress: `ready` of `total` photos are searchable, `pending` are still being scanned (new uploads, or after a re-index).',
  middleware: [requireStudio('uploader')] as const,
  request: { params: IdParam },
  responses: { 200: json(EventStats), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const [t] = await db.all<{ photos: number; views: number; downloads: number; favourites: number; processing: number; total: number; ready: number }>(sql`
    SELECT
      coalesce(sum(CASE WHEN a.kind = 'album' THEN 1 ELSE 0 END), 0) AS photos,
      coalesce(sum(p.views), 0) AS views, coalesce(sum(p.downloads), 0) AS downloads, coalesce(sum(p.favourites), 0) AS favourites,
      coalesce(sum(CASE WHEN p.status = 'processing' THEN 1 ELSE 0 END), 0) AS processing,
      coalesce(sum(CASE WHEN a.kind = 'album' THEN 1 ELSE 0 END), 0) AS total,
      coalesce(sum(CASE WHEN a.kind = 'album' AND p.status = 'ready' AND p.faces_indexed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS ready
    FROM photos p JOIN albums a ON a.id = p.album_id
    WHERE p.event_id = ${ev.id} AND p.deleted_at IS NULL AND a.deleted_at IS NULL`)
  const [{ n: guests }] = await db.select({ n: count() }).from(schema.guests).where(and(eq(schema.guests.eventId, ev.id), isNull(schema.guests.removedAt)))
  const num = (v: unknown) => Number(v ?? 0)
  return c.json({
    eventId: ev.id, visits: ev.visits.web + ev.visits.android + ev.visits.ios, photoViews: num(t?.views), downloads: num(t?.downloads), favourites: num(t?.favourites),
    guests, faceSearches: ev.faceMatches, photos: num(t?.photos), processing: num(t?.processing),
    faces: { ready: num(t?.ready), total: num(t?.total), pending: Math.max(0, num(t?.total) - num(t?.ready)) }, asOf: nowIso(),
  }, 200)
})

// ── Renewals & personal links ──────────────────────────────────────────────
eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/renew', tags: ['Events'], summary: 'Renew an event for another year — owner', security,
  description: `Base price ₹${BASE_RENEWAL}. Paying from the wallet (\`payWith: credits\`) costs half. Card capture is simulated until Razorpay keys are configured.`,
  middleware: [requireStudio('owner', 'renew events'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader, body: body(z.object({ payWith: z.enum(['credits', 'card']) })) },
  responses: { 200: json(z.object({ event: PhotoEvent, charged: z.number(), payWith: z.enum(['credits', 'card']) })), ...problems(401, 402, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { payWith } = c.req.valid('json')
  const charged = payWith === 'credits' ? BASE_RENEWAL * (1 - RENEWAL_CREDIT_DISCOUNT) : BASE_RENEWAL
  if (payWith === 'credits') await debitWallet(db, m.studioId, toMinor(charged), `Renewal · ${ev.name} (+1 year)`)
  await recordPurchase(db, m.studioId, { description: `Event renewal · ${ev.name}`, kind: 'renewal', amountPaise: toMinor(charged), method: payWith === 'credits' ? 'credits' : 'card' })
  const expiresAt = new Date(Math.max(Date.now(), Date.parse(ev.expiresAt)) + 365 * 86_400_000).toISOString()
  await db.update(schema.events).set({ expiresAt, ...(ev.status === 'expiring' || ev.status === 'archived' ? { status: 'live' as const } : {}) }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.renewed', { type: 'event', id: ev.id }, { payWith, charged })
  emit(c, m.studioId, 'events', 'usage', 'misc')
  return c.json({ event: eventOut(await eventForMember(db, m, ev.id)), charged, payWith }, 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/renewal-link', tags: ['Events'], summary: 'Create a renewal payment link for the client', security,
  description: 'Price = base renewal × the studio’s renewal multiplier. The client pays on the gallery site (checkout TODO with Razorpay).',
  middleware: [requireStudio('editor', 'create renewal links')] as const,
  request: { params: IdParam },
  responses: { 201: json(z.object({ url: z.string(), price: z.number(), expiresAt: z.string() }), 'Created'), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const [st] = await db.select({ mult: schema.studios.renewalMultiplier }).from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  const price = BASE_RENEWAL * (st?.mult ?? 1)
  const row = { id: newId('rl'), studioId: m.studioId, eventId: ev.id, pricePaise: toMinor(price), createdAt: nowIso(), expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }
  await db.insert(schema.renewalLinks).values(row).run()
  return c.json({ url: `${c.env.GALLERY_URL.replace(/\/$/, '')}/renew/${row.id}`, price, expiresAt: row.expiresAt }, 201)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/guest-links', tags: ['Events'], summary: 'Create a signed personal link (/s/ or /v/)', security,
  middleware: [requireStudio('editor', 'create personal links')] as const,
  request: { params: IdParam, body: body(GuestLinkPayload.omit({ e: true })) },
  responses: {
    201: json(z.object({ code: z.string(), kind: z.enum(['s', 'v']), path: z.string(), url: z.string(), payload: GuestLinkPayload }), 'Created'),
    ...problems(401, 403, 404, 422),
  },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const input = c.req.valid('json')
  if (input.album) {
    const [a] = await db.select({ id: schema.albums.id }).from(schema.albums).where(and(eq(schema.albums.id, input.album), eq(schema.albums.eventId, ev.id))).limit(1)
    if (!a) throw new NotFound('Album', input.album)
  }
  const link = await createSignedLink(c.env, m.studioId, ev.id, { ...input, e: ev.shortId }, c.get('user')?.id)
  const path = `/${link.kind}/${link.code}`
  audit(c, 'event.guest_link', { type: 'event', id: ev.id }, { kind: link.kind })
  return c.json({ ...link, path, url: `${c.env.GALLERY_URL.replace(/\/$/, '')}${path}` }, 201)
})

// ── Trash, packs, studio-side face match ───────────────────────────────────
export { TRASH_DAYS }

eventRoutes.openapi(createRoute({
  method: 'get', path: '/trash/events', tags: ['Events'], summary: 'Events in the trash (deleted in the last 30 days)', security,
  middleware: [requireStudio('editor', 'view the trash')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(PhotoEvent, 'TrashPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const e = schema.events
  const rows = await getDb(c.env.DB).select().from(e).where(and(eq(e.studioId, m.studioId), isNotNull(e.deletedAt), afterCursor(e.createdAt, e.id, 'desc', cursor)))
    .orderBy(desc(e.createdAt), desc(e.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], eventOut), 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/restore', tags: ['Events'], summary: 'Restore an event from the trash', security,
  middleware: [requireStudio('editor', 'restore events')] as const,
  request: { params: IdParam },
  responses: { 200: json(PhotoEvent), ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id, { includeDeleted: true })
  if (!ev.deletedAt) throw new Conflict('This event isn’t in the trash.', 'not_deleted')
  await db.update(schema.events).set({ deletedAt: null }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'event.restore', { type: 'event', id: ev.id })
  emit(c, m.studioId, 'events', 'albums', 'photos')
  return c.json(eventOut(await eventForMember(db, m, ev.id)), 200)
})

/** Daily job: permanently delete events that have been in the trash longer than TRASH_DAYS. */
export async function purgeTrash(env: Env, now = Date.now()): Promise<number> {
  const cutoff = new Date(now - TRASH_DAYS * 86_400_000).toISOString()
  const due = await getDb(env.DB).select({ id: schema.events.id, studioId: schema.events.studioId }).from(schema.events)
    .where(and(isNotNull(schema.events.deletedAt), lt(schema.events.deletedAt, cutoff))).limit(50)
  for (const e of due) await purgeEvent(env, e.studioId, e.id)
  return due.length
}

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/packs', tags: ['Billing'], summary: 'Buy a photo pack for one event — owner', security,
  description: `Raises the event’s photo limit and records a 'pack' purchase. Packs: ${PACKS.map((p) => `${p.photos} photos ₹${p.price}`).join(', ')}.`,
  middleware: [requireStudio('owner', 'buy packs'), idempotent] as const,
  request: {
    params: IdParam, headers: IdempotencyHeader,
    body: body(z.object({ photos: z.number().int().refine((n) => PACKS.some((p) => p.photos === n), `Packs come in ${PACKS.map((p) => p.photos).join(', ')} photos`), payWith: z.enum(['credits', 'card']) })),
  },
  responses: { 200: json(z.object({ event: PhotoEvent, charged: z.number(), purchase: Purchase })), ...problems(401, 402, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const ev = await eventForMember(db, m, c.req.valid('param').id)
  const { photos, payWith } = c.req.valid('json')
  const pack = PACKS.find((p) => p.photos === photos)!
  const label = `${pack.photos.toLocaleString('en-IN')}-photo pack · ${ev.name}`
  if (payWith === 'credits') await debitWallet(db, m.studioId, toMinor(pack.price), label)
  const purchase = await recordPurchase(db, m.studioId, { description: label, kind: 'pack', amountPaise: toMinor(pack.price), method: payWith === 'credits' ? 'credits' : 'card' })
  await db.update(schema.events).set({ photoLimit: sql`${schema.events.photoLimit} + ${pack.photos}` }).where(eq(schema.events.id, ev.id)).run()
  audit(c, 'billing.pack', { type: 'event', id: ev.id }, { photos, payWith })
  emit(c, m.studioId, 'events', 'usage', 'misc')
  return c.json({ event: eventOut(await eventForMember(db, m, ev.id)), charged: pack.price, purchase: purchaseOut(purchase) }, 200)
})

eventRoutes.openapi(createRoute({
  method: 'post', path: '/events/{id}/faces/match', tags: ['People'], summary: 'Find the person in a photo (for face personal links)', security,
  description: 'Same matching as the guest selfie search, without a guest token. `faceFound: false` (reason `no_face`) when the client reports no face or the image is too small.',
  middleware: [requireStudio('editor', 'create personal links')] as const,
  request: { params: IdParam, body: body(FaceSearchInput) },
  responses: { 200: json(FaceSearchResult), ...problems(401, 403, 404, 422, 503) },
}), async (c) => {
  const m = membershipOf(c)
  const ev = await eventForMember(getDb(c.env.DB), m, c.req.valid('param').id)
  const input = c.req.valid('json')
  if (selfieHasNoFace(input)) return c.json({ faceFound: false, reason: 'no_face' as const, personId: null, photoIds: [] }, 200)
  return c.json({ faceFound: true, ...(await matchFaces(c.env, ev.id, input.key, input.embedding, input.minScore)) }, 200)
})
