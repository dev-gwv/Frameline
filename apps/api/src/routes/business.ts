import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { NEEDS_YOU_EXPIRY_DAYS, buildNeedsYou, simulatePayoutCheck, type PayoutCheck as PayoutCheckT } from '@frameline/shared'
import { getMailer } from '../services/mailer'
import { getDb, schema } from '../db/client'
import {
  activityOut, broadcastOut, cameraOut, cameraUploadOut, enquiryOut, ledgerOut, orderOut, priceOut, qrOut, storeSettingsOut, ticketOut,
} from '../db/mappers'
import { Conflict, NotFound, ServiceUnavailable, ValidationFailed } from '../lib/errors'
import { hashPassword, randomInt } from '../lib/crypto'
import { toMajor, toMinor } from '../lib/money'
import { addLedger, payoutBalance, walletOf } from '../services/billing'
import { newId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import {
  AbandonedCart, ActivityItem, Broadcast, Camera, CameraMode, CameraUpload, Enquiry, LedgerEntry, NeedsYouItem, Order, PayoutCheck, Price, WalletBalance, SmartQR, StoreSettings, StoreSettingsPatch, StudioStats, Ticket, TicketPlatform,
} from '../schemas/domain'
import { audit } from '../services/audit'
import { eventForMember } from '../services/events'
import { AppError } from '../lib/errors'
import { emit } from '../services/realtime'

export const businessRoutes = createRouter()

// ── Feeds & money ──────────────────────────────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'get', path: '/activity', tags: ['Business'], summary: 'Studio activity feed', security,
  middleware: [requireStudio('editor', 'view activity')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(ActivityItem, 'ActivityPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.activity
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.at, t.id, 'desc', cursor)))
    .orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], activityOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/orders', tags: ['Business'], summary: 'Store orders (owner)', security,
  middleware: [requireStudio('owner', 'view orders and payouts')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(Order, 'OrderPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.orders
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.at, t.id, 'desc', cursor)))
    .orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], orderOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/ledger', tags: ['Business'], summary: 'Earnings ledger (owner)', security,
  middleware: [requireStudio('owner', 'view payouts')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(LedgerEntry, 'LedgerPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.ledgerEntries
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.at, t.id, 'desc', cursor)))
    .orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], ledgerOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/prices', tags: ['Business'], summary: 'Store price list', security,
  middleware: [requireStudio('editor', 'view prices')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(Price, 'PricePage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.prices
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.sortOrder, t.id, 'asc', cursor)))
    .orderBy(asc(t.sortOrder), asc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.sortOrder, r.id], priceOut), 200)
})

// ── Cameras (FTP) ──────────────────────────────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'get', path: '/cameras', tags: ['Tools'], summary: 'FTP cameras', security,
  middleware: [requireStudio('editor', 'manage cameras')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(Camera, 'CameraPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.cameras
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.createdAt, t.id, 'asc', cursor)))
    .orderBy(asc(t.createdAt), asc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], cameraOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/cameras', tags: ['Tools'], summary: 'Add an FTP camera', security,
  description: 'Creates the camera record, a unique FTP username and a password (returned once, stored hashed). SFTPGo authenticates cameras against these.',
  middleware: [requireStudio('editor', 'manage cameras'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ label: z.string().trim().min(1).max(80), eventId: z.string().max(128), albumId: z.string().max(128), mode: CameraMode })) },
  responses: { 201: json(Camera, 'Created'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const input = c.req.valid('json')
  const ev = await eventForMember(db, m, input.eventId)
  const [album] = await db.select({ id: schema.albums.id }).from(schema.albums).where(and(eq(schema.albums.id, input.albumId), eq(schema.albums.eventId, ev.id))).limit(1)
  if (!album) throw new NotFound('Album', input.albumId)
  const [studio] = await db.select({ handle: schema.studios.handle }).from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  const base = `${studio.handle.replace(/[^a-z0-9]/g, '').slice(0, 4)}_${input.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 14)}`
  let ftpUser = base
  for (let i = 2; i < 50; i++) {
    const [taken] = await db.select({ id: schema.cameras.id }).from(schema.cameras).where(eq(schema.cameras.ftpUser, ftpUser)).limit(1)
    if (!taken) break
    ftpUser = `${base}_${i}`
  }
  const password = cameraPassword()
  const cam = { id: newId('cam'), studioId: m.studioId, label: input.label, eventId: ev.id, albumId: album.id, mode: input.mode, ftpUser, status: 'offline' as const, today: 0, lastFile: null, createdAt: nowIso(), passwordHash: await hashPassword(password), lastUploadAt: null }
  await db.insert(schema.cameras).values(cam).run()
  audit(c, 'camera.create', { type: 'camera', id: cam.id })
  emit(c, m.studioId, 'misc')
  return c.json({ ...cameraOut(cam), password }, 201)
})

// ── Smart QRs ──────────────────────────────────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'get', path: '/qrs', tags: ['Tools'], summary: 'Smart QR codes', security,
  middleware: [requireStudio('editor', 'manage QR codes')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(SmartQR, 'QRPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.smartQrs
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), isNull(t.deletedAt), afterCursor(t.createdAt, t.id, 'asc', cursor)))
    .orderBy(asc(t.createdAt), asc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], qrOut), 200)
})

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'qr'

businessRoutes.openapi(createRoute({
  method: 'post', path: '/qrs', tags: ['Tools'], summary: 'Create a smart QR code', security,
  middleware: [requireStudio('editor', 'manage QR codes'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ name: z.string().trim().min(1).max(80), eventId: z.string().max(128) })) },
  responses: { 201: json(SmartQR, 'Created'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { name, eventId } = c.req.valid('json')
  const ev = await eventForMember(db, m, eventId)
  const base = slugify(name)
  let slug = base
  for (let i = 2; i < 50; i++) {
    const [taken] = await db.select({ id: schema.smartQrs.id }).from(schema.smartQrs).where(and(eq(schema.smartQrs.studioId, m.studioId), eq(schema.smartQrs.slug, slug))).limit(1)
    if (!taken) break
    slug = `${base}-${i}`
  }
  const qr = { id: newId('qr'), studioId: m.studioId, name, slug, eventId: ev.id, target: 'web' as const, scans: 0, color: '#1B1712', createdAt: nowIso(), scheduledEventId: null, scheduledAt: null, dotStyle: null, logoUrl: null, deletedAt: null }
  await db.insert(schema.smartQrs).values(qr).run()
  emit(c, m.studioId, 'misc')
  return c.json(qrOut(qr), 201)
})

businessRoutes.openapi(createRoute({
  method: 'patch', path: '/qrs/{id}', tags: ['Tools'], summary: 'Update a smart QR code', security,
  middleware: [requireStudio('editor', 'manage QR codes')] as const,
  request: {
    params: IdParam,
    body: body(z.object({
      name: z.string().trim().min(1).max(80), slug: z.string().regex(/^[a-z0-9-]{1,32}$/, 'Use lowercase letters, numbers and dashes'),
      eventId: z.string().max(128), target: z.enum(['web', 'app', 'smart']), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      scheduledEventId: z.string().max(128).openapi({ description: 'Event to switch to at scheduledAt; "" clears the schedule.' }),
      scheduledAt: z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Must be an ISO-8601 date'),
      dotStyle: z.enum(['square', 'rounded', 'dots']), logoUrl: z.string().max(4096),
    }).partial().strict()),
  },
  responses: { 200: json(SmartQR), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const id = c.req.valid('param').id
  const patch = c.req.valid('json')
  const t = schema.smartQrs
  const [qr] = await db.select().from(t).where(and(eq(t.id, id), eq(t.studioId, m.studioId))).limit(1)
  if (!qr) throw new NotFound('QR code', id)
  if (patch.eventId) patch.eventId = (await eventForMember(db, m, patch.eventId)).id
  if (patch.scheduledEventId) patch.scheduledEventId = (await eventForMember(db, m, patch.scheduledEventId)).id
  if (patch.slug && patch.slug !== qr.slug) {
    const [taken] = await db.select({ id: t.id }).from(t).where(and(eq(t.studioId, m.studioId), eq(t.slug, patch.slug))).limit(1)
    if (taken) throw new Conflict(`The short link "${patch.slug}" is already used.`, 'slug_taken')
  }
  const set = {
    ...patch,
    ...(patch.scheduledEventId === '' ? { scheduledEventId: null, scheduledAt: null } : {}),
    ...(patch.scheduledAt ? { scheduledAt: new Date(patch.scheduledAt).toISOString() } : patch.scheduledAt === '' ? { scheduledAt: null } : {}),
    ...(patch.logoUrl === '' ? { logoUrl: null } : {}),
  }
  if (Object.keys(set).length) await db.update(t).set(set).where(eq(t.id, id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(qrOut({ ...qr, ...set }), 200)
})

// ── Broadcasts ─────────────────────────────────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'get', path: '/broadcasts', tags: ['Grow'], summary: 'Broadcast messages (newest first)', security,
  middleware: [requireStudio('editor', 'view broadcasts')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(Broadcast, 'BroadcastPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.broadcasts
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), isNull(t.deletedAt), afterCursor(t.createdAt, t.id, 'desc', cursor)))
    .orderBy(desc(t.createdAt), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.createdAt, r.id], broadcastOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/broadcasts', tags: ['Grow'], summary: 'Send or schedule a broadcast', security,
  description: 'Audience is "all" (every follower) or an event id. Delivery (push/email) runs from the queue; without `scheduledAt` it is sent now.',
  middleware: [requireStudio('editor', 'send broadcasts'), idempotent] as const,
  request: {
    headers: IdempotencyHeader,
    body: body(z.object({
      title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(2000), audience: z.string().max(128),
      scheduledAt: z.string().refine((s) => Date.parse(s) > Date.now() - 60_000, 'Schedule a time in the future').optional(),
      imageUrl: z.string().max(4096).optional(),
    })),
  },
  responses: { 201: json(Broadcast, 'Created'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const input = c.req.valid('json')
  if (input.audience !== 'all') input.audience = (await eventForMember(db, m, input.audience)).id
  const now = nowIso()
  const row = {
    id: newId('bc'), studioId: m.studioId, title: input.title, body: input.body, audience: input.audience,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null, sentAt: input.scheduledAt ? null : now, openRate: null, createdAt: now,
    imageUrl: input.imageUrl ?? null, cancelledAt: null, deletedAt: null,
  }
  await db.insert(schema.broadcasts).values(row).run()
  audit(c, 'broadcast.create', { type: 'broadcast', id: row.id }, { audience: row.audience, scheduled: !!row.scheduledAt })
  emit(c, m.studioId, 'misc')
  return c.json(broadcastOut(row), 201)
})

// ── Support tickets ────────────────────────────────────────────────────────
async function withMessages(db: ReturnType<typeof getDb>, rows: (typeof schema.tickets.$inferSelect)[]) {
  const ids = rows.map((r) => r.id)
  const msgs = ids.length ? await db.select().from(schema.ticketMessages).where(inArray(schema.ticketMessages.ticketId, ids.slice(0, 90))).orderBy(asc(schema.ticketMessages.at)) : []
  return rows.map((r) => ticketOut(r, msgs.filter((x) => x.ticketId === r.id)))
}

businessRoutes.openapi(createRoute({
  method: 'get', path: '/tickets', tags: ['Support'], summary: 'Support tickets with messages', security,
  middleware: [requireStudio('uploader')] as const,
  request: { query: PageQuery.extend({ limit: z.coerce.number().int().min(1).max(90).default(50) }) },
  responses: { 200: json(pageOf(Ticket, 'TicketPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.tickets
  const rows = await db.select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.updatedAt, t.id, 'desc', cursor)))
    .orderBy(desc(t.updatedAt), desc(t.id)).limit(limit + 1)
  const page = toPage(rows, limit, (r) => [r.updatedAt, r.id], (r) => r)
  return c.json({ items: await withMessages(db, page.items), nextCursor: page.nextCursor }, 200)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/tickets', tags: ['Support'], summary: 'Open a support ticket', security,
  middleware: [requireStudio('uploader'), idempotent] as const,
  request: {
    headers: IdempotencyHeader,
    body: body(z.object({ subject: z.string().trim().min(1).max(160), eventId: z.string().max(128).optional(), platform: TicketPlatform, body: z.string().trim().min(1).max(5000) })),
  },
  responses: { 201: json(Ticket, 'Created'), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const input = c.req.valid('json')
  const eventId = input.eventId ? (await eventForMember(db, m, input.eventId)).id : null
  const now = nowIso()
  const ticket = { id: newId('tk'), studioId: m.studioId, subject: input.subject, eventId, platform: input.platform, status: 'open' as const, createdBy: c.get('user')?.id ?? null, createdAt: now, updatedAt: now }
  const msg = { id: newId('tm'), ticketId: ticket.id, from: 'me' as const, body: input.body, at: now }
  await db.batch([db.insert(schema.tickets).values(ticket), db.insert(schema.ticketMessages).values(msg)])
  emit(c, m.studioId, 'misc')
  return c.json(ticketOut(ticket, [msg]), 201)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/tickets/{id}/messages', tags: ['Support'], summary: 'Reply to a ticket', security,
  middleware: [requireStudio('uploader'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader, body: body(z.object({ body: z.string().trim().min(1).max(5000) })) },
  responses: { 200: json(Ticket), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const id = c.req.valid('param').id
  const t = schema.tickets
  const [ticket] = await db.select().from(t).where(and(eq(t.id, id), eq(t.studioId, m.studioId))).limit(1)
  if (!ticket) throw new NotFound('Ticket', id)
  const now = nowIso()
  await db.batch([
    db.insert(schema.ticketMessages).values({ id: newId('tm'), ticketId: id, from: 'me', body: c.req.valid('json').body, at: now }),
    db.update(t).set({ status: 'waiting', updatedAt: now }).where(eq(t.id, id)),
  ])
  emit(c, m.studioId, 'misc')
  const [fresh] = await db.select().from(t).where(eq(t.id, id)).limit(1)
  return c.json((await withMessages(db, [fresh]))[0], 200)
})

// ── Enquiries ──────────────────────────────────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'get', path: '/enquiries', tags: ['Grow'], summary: 'Enquiries from your website and galleries', security,
  middleware: [requireStudio('editor', 'view enquiries')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(Enquiry, 'EnquiryPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.enquiries
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.at, t.id, 'desc', cursor)))
    .orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], enquiryOut), 200)
})

// ── Cameras: edit, delete, password, upload log ─────────────────────────────
async function cameraFor(db: ReturnType<typeof getDb>, studioId: string, id: string) {
  const [cam] = await db.select().from(schema.cameras).where(and(eq(schema.cameras.id, id), eq(schema.cameras.studioId, studioId))).limit(1)
  if (!cam) throw new NotFound('Camera', id)
  return cam
}

const cameraPassword = () => { let s = ''; for (let i = 0; i < 12; i++) s += PW_ALPHABET[randomInt(PW_ALPHABET.length)]; return s }
const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

businessRoutes.openapi(createRoute({
  method: 'patch', path: '/cameras/{id}', tags: ['Tools'], summary: 'Edit a camera (label, target event/album, mode)', security,
  middleware: [requireStudio('editor', 'manage cameras')] as const,
  request: { params: IdParam, body: body(z.object({ label: z.string().trim().min(1).max(80), eventId: z.string().max(128), albumId: z.string().max(128), mode: CameraMode }).partial().strict()) },
  responses: { 200: json(Camera), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const cam = await cameraFor(db, m.studioId, c.req.valid('param').id)
  const patch = c.req.valid('json')
  const eventId = patch.eventId ? (await eventForMember(db, m, patch.eventId)).id : cam.eventId
  const albumId = patch.albumId ?? (patch.eventId ? null : cam.albumId)
  if (!albumId) throw new ValidationFailed([{ field: 'albumId', in: 'body', message: 'Pick an album in the new event', code: 'required' }])
  const [album] = await db.select({ id: schema.albums.id }).from(schema.albums).where(and(eq(schema.albums.id, albumId), eq(schema.albums.eventId, eventId))).limit(1)
  if (!album) throw new NotFound('Album', albumId)
  const next = { ...cam, ...patch, eventId, albumId }
  await db.update(schema.cameras).set({ label: next.label, eventId, albumId, mode: next.mode }).where(eq(schema.cameras.id, cam.id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(cameraOut(next), 200)
})

businessRoutes.openapi(createRoute({
  method: 'delete', path: '/cameras/{id}', tags: ['Tools'], summary: 'Remove a camera (its FTP login stops working)', security,
  middleware: [requireStudio('editor', 'manage cameras')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const cam = await cameraFor(db, m.studioId, c.req.valid('param').id)
  await db.delete(schema.cameras).where(eq(schema.cameras.id, cam.id)).run()
  audit(c, 'camera.delete', { type: 'camera', id: cam.id })
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/cameras/{id}/password', tags: ['Tools'], summary: 'Generate a new FTP password (shown once)', security,
  middleware: [requireStudio('editor', 'manage cameras')] as const,
  request: { params: IdParam },
  responses: { 200: json(Camera), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const cam = await cameraFor(db, m.studioId, c.req.valid('param').id)
  const password = cameraPassword()
  await db.update(schema.cameras).set({ passwordHash: await hashPassword(password) }).where(eq(schema.cameras.id, cam.id)).run()
  audit(c, 'camera.password_reset', { type: 'camera', id: cam.id })
  emit(c, m.studioId, 'misc')
  return c.json({ ...cameraOut(cam), password }, 200)
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/cameras/{id}/uploads', tags: ['Tools'], summary: 'Files a camera sent (newest first)', security,
  middleware: [requireStudio('editor', 'manage cameras')] as const,
  request: { params: IdParam, query: PageQuery },
  responses: { 200: json(pageOf(CameraUpload, 'CameraUploadPage')), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const cam = await cameraFor(db, m.studioId, c.req.valid('param').id)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.cameraUploads
  const rows = await db.select().from(t).where(and(eq(t.cameraId, cam.id), afterCursor(t.at, t.id, 'desc', cursor))).orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], cameraUploadOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'delete', path: '/cameras/{id}/uploads', tags: ['Tools'], summary: 'Clear a camera’s upload log', security,
  middleware: [requireStudio('editor', 'manage cameras')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const cam = await cameraFor(db, m.studioId, c.req.valid('param').id)
  await db.delete(schema.cameraUploads).where(eq(schema.cameraUploads.cameraId, cam.id)).run()
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

// ── QR & broadcast lifecycle ────────────────────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'delete', path: '/qrs/{id}', tags: ['Tools'], summary: 'Move a smart QR code to the trash', security,
  description: 'Its short link stops working until POST /qrs/{id}/restore; after 30 days the daily job deletes it.',
  middleware: [requireStudio('editor', 'manage QR codes')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const t = schema.smartQrs
  const res = await getDb(c.env.DB).update(t).set({ deletedAt: nowIso() }).where(and(eq(t.id, c.req.valid('param').id), eq(t.studioId, m.studioId), isNull(t.deletedAt))).run()
  if (res.meta.changes === 0) throw new NotFound('QR code', c.req.valid('param').id)
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/qrs/{id}/restore', tags: ['Tools'], summary: 'Restore a smart QR code from the trash', security,
  middleware: [requireStudio('editor', 'manage QR codes'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader },
  responses: { 200: json(SmartQR), ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const t = schema.smartQrs
  const [qr] = await db.select().from(t).where(and(eq(t.id, c.req.valid('param').id), eq(t.studioId, m.studioId))).limit(1)
  if (!qr) throw new NotFound('QR code', c.req.valid('param').id)
  if (!qr.deletedAt) throw new Conflict('This QR code isn’t in the trash.', 'not_deleted')
  await db.update(t).set({ deletedAt: null }).where(eq(t.id, qr.id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(qrOut({ ...qr, deletedAt: null }), 200)
})

async function broadcastFor(db: ReturnType<typeof getDb>, studioId: string, id: string, opts: { trashed?: boolean } = {}) {
  const t = schema.broadcasts
  const [b] = await db.select().from(t).where(and(eq(t.id, id), eq(t.studioId, studioId), opts.trashed ? isNotNull(t.deletedAt) : isNull(t.deletedAt))).limit(1)
  if (!b) throw new NotFound('Broadcast', id)
  return b
}

businessRoutes.openapi(createRoute({
  method: 'post', path: '/broadcasts/{id}/cancel', tags: ['Grow'], summary: 'Cancel a scheduled broadcast', security,
  middleware: [requireStudio('editor', 'manage broadcasts')] as const,
  request: { params: IdParam },
  responses: { 200: json(Broadcast), ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const b = await broadcastFor(db, m.studioId, c.req.valid('param').id)
  if (b.sentAt || !b.scheduledAt) throw new Conflict('This broadcast was already sent, so it can’t be cancelled.', 'already_sent')
  if (b.cancelledAt) throw new Conflict('This broadcast was already cancelled.', 'already_cancelled')
  const cancelledAt = nowIso()
  await db.update(schema.broadcasts).set({ cancelledAt }).where(eq(schema.broadcasts.id, b.id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(broadcastOut({ ...b, cancelledAt }), 200)
})

businessRoutes.openapi(createRoute({
  method: 'delete', path: '/broadcasts/{id}', tags: ['Grow'], summary: 'Move a broadcast to the trash', security,
  description: 'A scheduled message isn’t sent while it’s in the trash. Restore with POST /broadcasts/{id}/restore; deleted for good after 30 days.',
  middleware: [requireStudio('editor', 'manage broadcasts')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const b = await broadcastFor(db, m.studioId, c.req.valid('param').id)
  await db.update(schema.broadcasts).set({ deletedAt: nowIso() }).where(eq(schema.broadcasts.id, b.id)).run()
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/broadcasts/{id}/restore', tags: ['Grow'], summary: 'Restore a broadcast from the trash', security,
  description: 'A scheduled message whose time passed while it was in the trash goes out on the next minute.',
  middleware: [requireStudio('editor', 'manage broadcasts'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader },
  responses: { 200: json(Broadcast), ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const b = await broadcastFor(db, m.studioId, c.req.valid('param').id, { trashed: true })
  await db.update(schema.broadcasts).set({ deletedAt: null }).where(eq(schema.broadcasts.id, b.id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(broadcastOut({ ...b, deletedAt: null }), 200)
})

// ── Enquiries, prices, store settings, payouts ─────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'patch', path: '/enquiries/{id}', tags: ['Grow'], summary: 'Mark an enquiry replied or add a note', security,
  middleware: [requireStudio('editor', 'manage enquiries')] as const,
  request: { params: IdParam, body: body(z.object({ status: z.enum(['new', 'replied']), note: z.string().max(2000) }).partial().strict()) },
  responses: { 200: json(Enquiry), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const t = schema.enquiries
  const id = c.req.valid('param').id
  const [row] = await db.select().from(t).where(and(eq(t.id, id), eq(t.studioId, m.studioId))).limit(1)
  if (!row) throw new NotFound('Enquiry', id)
  const patch = c.req.valid('json')
  if (Object.keys(patch).length) await db.update(t).set(patch).where(eq(t.id, id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(enquiryOut({ ...row, ...patch }), 200)
})

businessRoutes.openapi(createRoute({
  method: 'put', path: '/prices', tags: ['Business'], summary: 'Replace the store price list — owner', security,
  middleware: [requireStudio('owner', 'change store prices')] as const,
  request: {
    body: body(z.object({
      items: z.array(z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Use lowercase letters, numbers and dashes'), label: z.string().trim().min(1).max(80),
        detail: z.string().max(200), price: z.number().min(0).max(1_000_000).multipleOf(0.01),
      })).max(50).refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, 'Price ids must be unique'),
    })),
  },
  responses: { 200: json(z.object({ items: z.array(Price) })), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { items } = c.req.valid('json')
  const t = schema.prices
  await db.batch([
    db.delete(t).where(eq(t.studioId, m.studioId)),
    ...items.map((p, i) => db.insert(t).values({ studioId: m.studioId, id: p.id, label: p.label, detail: p.detail, pricePaise: toMinor(p.price), sortOrder: i })),
  ])
  audit(c, 'store.prices', { type: 'studio', id: m.studioId }, { count: items.length })
  emit(c, m.studioId, 'misc')
  return c.json({ items }, 200)
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/store/settings', tags: ['Business'], summary: 'Store settings: KYC, payouts, sale watermark, international, terms', security,
  middleware: [requireStudio('owner', 'view store settings')] as const,
  responses: { 200: json(StoreSettings), ...problems(401, 403) },
}), async (c) => {
  const [st] = await getDb(c.env.DB).select().from(schema.studios).where(eq(schema.studios.id, membershipOf(c).studioId)).limit(1)
  return c.json(storeSettingsOut(st), 200)
})

businessRoutes.openapi(createRoute({
  method: 'patch', path: '/store/settings', tags: ['Business'], summary: 'Update store settings — owner', security,
  description: 'Sections are merged. `payout.accountNumber` is write-only (only the last 4 digits are kept). Changing bank details re-verifies the account (simulated penny drop). KYC documents with a file move to review.',
  middleware: [requireStudio('owner', 'change store settings')] as const,
  request: { body: body(StoreSettingsPatch) },
  responses: { 200: json(StoreSettings), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const [st] = await db.select().from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  const cur = storeSettingsOut(st)
  const patch = c.req.valid('json')
  const next: typeof cur = structuredClone(cur)
  if (patch.kyc) {
    const { address, documents, ...rest } = patch.kyc
    Object.assign(next.kyc, rest)
    if (address) next.kyc.address = { ...next.kyc.address, ...address }
    if (documents) {
      const assetIds = documents.map((d) => d.assetId).filter((x): x is string => !!x)
      const found = assetIds.length ? await db.select().from(schema.assets).where(and(eq(schema.assets.studioId, m.studioId), inArray(schema.assets.id, assetIds))) : []
      next.kyc.documents = documents.map((d, i) => {
        if (!d.assetId) return { ...d, status: d.fileName && d.status === 'needed' ? 'review' : d.status }
        const a = found.find((x) => x.id === d.assetId)
        if (!a || a.kind !== 'kyc-document') throw new ValidationFailed([{ field: `kyc.documents.${i}.assetId`, in: 'body', message: 'Upload the document with kind "kyc-document" first', code: 'unknown_asset' }])
        // A newly attached file always goes to review.
        return { kind: d.kind, assetId: a.id, fileName: a.fileName, status: 'review' as const }
      })
    }
    if (next.kyc.gstRegistered && next.kyc.gstin && next.kyc.pan && next.kyc.gstin.slice(2, 12) !== next.kyc.pan) {
      throw new ValidationFailed([{ field: 'kyc.gstin', in: 'body', message: 'Characters 3–12 of the GSTIN must match your PAN', code: 'gstin_pan_mismatch' }])
    }
  }
  if (patch.payout) {
    const { accountNumber, ...rest } = patch.payout
    Object.assign(next.payout, rest)
    if (accountNumber) next.payout.accountLast4 = accountNumber.slice(-4)
    // A new account, IFSC or holder name re-runs the ₹1 check.
    if (accountNumber || (rest.ifsc && rest.ifsc !== cur.payout.ifsc) || (rest.holder !== undefined && rest.holder !== cur.payout.holder)) applyPayoutCheck(next, payoutCheck(next))
  }
  if (patch.saleWatermark) Object.assign(next.saleWatermark, patch.saleWatermark)
  if (patch.international) Object.assign(next.international, patch.international)
  if (patch.terms !== undefined) next.terms = patch.terms
  if (next.international.enabled && !next.international.paymentLink && !next.international.upiQrUrl) {
    throw new ValidationFailed([{ field: 'international.paymentLink', in: 'body', message: 'Add a payment link or a UPI QR before turning this on', code: 'required' }])
  }
  await db.update(schema.studios).set({ storeSettings: next }).where(eq(schema.studios.id, m.studioId)).run()
  audit(c, 'store.settings', { type: 'studio', id: m.studioId }, { sections: Object.keys(patch) })
  emit(c, m.studioId, 'misc')
  return c.json(next, 200)
})

/**
 * The ₹1 penny-drop check. TODO(payments): ask the payout provider (e.g. Razorpay X fund-account validation);
 * until then `simulatePayoutCheck` from @frameline/shared answers deterministically (same rule as the mock).
 */
function payoutCheck(s: ReturnType<typeof storeSettingsOut>): PayoutCheckT {
  return simulatePayoutCheck({ holder: s.payout.holder, legalName: s.kyc.legalName, ifsc: s.payout.ifsc, accountLast4: s.payout.accountLast4 })
}
function applyPayoutCheck(s: ReturnType<typeof storeSettingsOut>, check: PayoutCheckT) {
  s.payout.check = check
  s.payout.verified = check.status === 'verified'
  if (check.bankName && !s.payout.bank) s.payout.bank = check.bankName
}

businessRoutes.openapi(createRoute({
  method: 'post', path: '/store/payout/verify', tags: ['Business'], summary: 'Check the payout bank account again (₹1 test) — owner', security,
  description: 'Runs the account check and stores it in `StoreSettings.payout.check`: `verified` (payouts allowed), `name_mismatch` (the bank has it under `nameAtBank`), or `failed`. Simulated deterministically until a payout provider is configured.',
  middleware: [requireStudio('owner', 'verify the payout account'), idempotent] as const,
  request: { headers: IdempotencyHeader },
  responses: { 200: json(PayoutCheck), ...problems(401, 403, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const [st] = await db.select().from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  const s = structuredClone(storeSettingsOut(st))
  if (!s.payout.accountLast4) throw new Conflict('Add a bank account in Selling settings first.', 'no_payout_account')
  const check = payoutCheck(s)
  applyPayoutCheck(s, check)
  await db.update(schema.studios).set({ storeSettings: s }).where(eq(schema.studios.id, m.studioId)).run()
  audit(c, 'store.payout_verify', { type: 'studio', id: m.studioId }, { status: check.status })
  emit(c, m.studioId, 'misc')
  return c.json(check, 200)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/payouts', tags: ['Business'], summary: 'Withdraw store earnings to the bank — owner', security,
  description: 'Needs a verified payout account; the amount can’t exceed the ledger balance. Adds a `payout` ledger line (bank transfer TODO with Razorpay X).',
  middleware: [requireStudio('owner', 'request payouts'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ amount: z.number().positive().max(10_000_000).multipleOf(0.01) })) },
  responses: { 201: json(LedgerEntry, 'Requested'), ...problems(401, 403, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const [st] = await db.select().from(schema.studios).where(eq(schema.studios.id, m.studioId)).limit(1)
  const payout = storeSettingsOut(st).payout
  if (!payout.verified) throw new Conflict('Verify your bank account in Store settings before requesting a payout.', 'payout_account_unverified')
  const { amount } = c.req.valid('json')
  const available = await payoutBalance(db, m.studioId)
  if (toMinor(amount) > available) {
    throw new ValidationFailed([{ field: 'amount', in: 'body', message: `You can withdraw up to ₹${toMajor(available)}`, code: 'too_big' }])
  }
  const entry = await addLedger(db, m.studioId, 'payout', `Payout to ${payout.bank} ••${payout.accountLast4}`, -toMinor(amount), true)
  audit(c, 'store.payout', { type: 'studio', id: m.studioId }, { amountPaise: toMinor(amount) })
  emit(c, m.studioId, 'misc')
  return c.json(entry, 201)
})

// ── Orders: tracking, resend link ──────────────────────────────────────────
async function orderFor(db: ReturnType<typeof getDb>, studioId: string, id: string) {
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.studioId, studioId))).limit(1)
  if (!o) throw new NotFound('Order', id)
  return o
}

businessRoutes.openapi(createRoute({
  method: 'patch', path: '/orders/{id}', tags: ['Business'], summary: 'Set the courier tracking number on an order (owner)', security,
  description: '`trackingNumber: ""` clears it. The buyer sees it with their order.',
  middleware: [requireStudio('owner', 'manage orders')] as const,
  request: { params: IdParam, body: body(z.object({ trackingNumber: z.string().trim().max(80) }).partial().strict()) },
  responses: { 200: json(Order), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const o = await orderFor(db, m.studioId, c.req.valid('param').id)
  const { trackingNumber } = c.req.valid('json')
  if (trackingNumber !== undefined) await db.update(schema.orders).set({ trackingNumber: trackingNumber || null }).where(eq(schema.orders.id, o.id)).run()
  audit(c, 'store.order_updated', { type: 'order', id: o.id }, { trackingNumber })
  emit(c, m.studioId, 'misc')
  return c.json(orderOut(await orderFor(db, m.studioId, o.id)), 200)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/orders/{id}/resend-link', tags: ['Business'], summary: 'Email the buyer a fresh download link (owner)', security,
  description: '409 `order_not_deliverable` unless the order is paid, printing or paid directly; 422 `no_buyer_email` when the order has no email. Sent with the mailer (logged in development).',
  middleware: [requireStudio('owner', 'manage orders'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader },
  responses: { 200: json(z.object({ sentTo: z.string(), order: Order })), ...problems(401, 403, 404, 409, 422, 503) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const o = await orderFor(db, m.studioId, c.req.valid('param').id)
  if (!['paid', 'printing', 'paid-direct'].includes(o.status)) {
    throw new Conflict(o.status === 'refunded' ? `Order #${o.number} was refunded, so its download link is off.` : `Order #${o.number} isn’t paid yet.`, 'order_not_deliverable', { orderStatus: o.status })
  }
  if (!o.buyerEmail) throw new AppError(422, 'no_buyer_email', 'No email on this order', `Order #${o.number} has no buyer email to send the link to.`)
  const [ev] = await db.select({ shortId: schema.events.shortId }).from(schema.events).where(eq(schema.events.id, o.eventId)).limit(1)
  const link = `${c.env.GALLERY_URL.replace(/\/$/, '')}/${(ev?.shortId ?? '').toLowerCase()}/orders?order=${o.id}`
  await getMailer(c.env).send({
    to: o.buyerEmail,
    subject: `Your photos from ${o.eventName}`,
    text: `Hi ${o.buyer},\n\nHere is your download link for order #${o.number} (${o.items}): ${link}\n\nIt keeps working for 12 months.`,
  })
  const at = nowIso()
  await db.update(schema.orders).set({ linkSentAt: at }).where(eq(schema.orders.id, o.id)).run()
  audit(c, 'store.link_resent', { type: 'order', id: o.id })
  emit(c, m.studioId, 'misc')
  return c.json({ sentTo: o.buyerEmail, order: orderOut({ ...o, linkSentAt: at }) }, 200)
})

// ── Studio stats (Reports) ──────────────────────────────────────────────────
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const monthStart = (month: string, offset = 0) => { const [y, mo] = month.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + offset, 1)) }
const ymd = (d: Date) => d.toISOString().slice(0, 10)

businessRoutes.openapi(createRoute({
  method: 'get', path: '/studio/stats', tags: ['Business'], summary: 'Studio totals for Reports: a month, the month before, all time', security,
  description: '`month` is YYYY-MM (default: this month, UTC). Visits, downloads, face searches and photo views come from daily counters; photos delivered from photos added in the month (guest uploads and trash excluded); sales and orders from paid INR orders (refunds and pending excluded).',
  middleware: [requireStudio('editor', 'view reports')] as const,
  request: { query: z.object({ month: z.string().regex(MONTH_RE, 'Use YYYY-MM, e.g. 2026-09').optional() }) },
  responses: { 200: json(StudioStats), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const month = c.req.valid('query').month ?? new Date().toISOString().slice(0, 7)
  const totals = async (from: Date, to: Date) => {
    const [d] = await db.all<{ visits: number; downloads: number; face: number; views: number }>(sql`
      SELECT coalesce(sum(visits), 0) AS visits, coalesce(sum(downloads), 0) AS downloads, coalesce(sum(face_searches), 0) AS face, coalesce(sum(photo_views), 0) AS views
      FROM event_daily_stats WHERE studio_id = ${m.studioId} AND day >= ${ymd(from)} AND day < ${ymd(to)}`)
    const [ph] = await db.all<{ n: number }>(sql`
      SELECT count(*) AS n FROM photos p JOIN albums a ON a.id = p.album_id JOIN events e ON e.id = p.event_id
      WHERE p.studio_id = ${m.studioId} AND p.deleted_at IS NULL AND a.kind = 'album' AND a.deleted_at IS NULL AND e.deleted_at IS NULL
        AND p.created_at >= ${from.toISOString()} AND p.created_at < ${to.toISOString()}`)
    const [o] = await db.all<{ n: number; paise: number }>(sql`
      SELECT count(*) AS n, coalesce(sum(paid_paise), 0) AS paise FROM orders
      WHERE studio_id = ${m.studioId} AND currency = 'INR' AND status IN ('paid', 'printing') AND at >= ${from.toISOString()} AND at < ${to.toISOString()}`)
    return {
      visits: Number(d?.visits ?? 0), downloads: Number(d?.downloads ?? 0), faceSearches: Number(d?.face ?? 0), photoViews: Number(d?.views ?? 0),
      photosDelivered: Number(ph?.n ?? 0), sales: toMajor(Number(o?.paise ?? 0)), orders: Number(o?.n ?? 0),
    }
  }
  const [all] = await db.all<{ visits: number; downloads: number; face: number; views: number }>(sql`
    SELECT coalesce(sum(visits), 0) AS visits, coalesce(sum(downloads), 0) AS downloads, coalesce(sum(face_searches), 0) AS face, coalesce(sum(photo_views), 0) AS views
    FROM event_daily_stats WHERE studio_id = ${m.studioId}`)
  return c.json({
    month,
    thisMonth: await totals(monthStart(month), monthStart(month, 1)),
    lastMonth: await totals(monthStart(month, -1), monthStart(month)),
    allTime: { visits: Number(all?.visits ?? 0), downloads: Number(all?.downloads ?? 0), faceSearches: Number(all?.face ?? 0), photoViews: Number(all?.views ?? 0) },
    asOf: nowIso(),
  }, 200)
})

// ── Abandoned carts ────────────────────────────────────────────────────────
const CART_AFTER_MS = 30 * 60_000

const cartOut = (o: typeof schema.orders.$inferSelect) => ({
  orderId: o.id, number: o.number, buyer: o.buyer, ...(o.buyerEmail ? { buyerEmail: o.buyerEmail } : {}), eventId: o.eventId, eventName: o.eventName,
  items: o.items, amount: toMajor(o.paidPaise), startedAt: o.at, reminders: o.reminderCount, ...(o.remindedAt ? { remindedAt: o.remindedAt } : {}),
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/carts', tags: ['Business'], summary: 'Abandoned carts (checkouts pending for more than 30 minutes)', security,
  middleware: [requireStudio('editor', 'view carts')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(AbandonedCart, 'CartPage')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const { limit, cursor } = c.req.valid('query')
  const t = schema.orders
  const cutoff = new Date(Date.now() - CART_AFTER_MS).toISOString()
  const rows = await getDb(c.env.DB).select().from(t)
    .where(and(eq(t.studioId, m.studioId), eq(t.status, 'pending'), lt(t.at, cutoff), afterCursor(t.at, t.id, 'desc', cursor)))
    .orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], cartOut), 200)
})

businessRoutes.openapi(createRoute({
  method: 'post', path: '/carts/remind', tags: ['Business'], summary: 'Email buyers a reminder to finish checkout', security,
  description: 'Only pending carts with a buyer email are reminded; returns how many were sent.',
  middleware: [requireStudio('editor', 'remind carts'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ orderIds: z.array(z.string().max(64)).min(1).max(80) })) },
  responses: { 200: json(z.object({ reminded: z.number().int() })), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const t = schema.orders
  const rows = await db.select().from(t).where(and(eq(t.studioId, m.studioId), eq(t.status, 'pending'), inArray(t.id, c.req.valid('json').orderIds)))
  const mailer = getMailer(c.env)
  const gallery = c.env.GALLERY_URL.replace(/\/$/, '')
  let reminded = 0
  for (const o of rows) {
    if (!o.buyerEmail) continue
    const [ev] = await db.select({ shortId: schema.events.shortId }).from(schema.events).where(eq(schema.events.id, o.eventId)).limit(1)
    await mailer.send({
      to: o.buyerEmail,
      subject: `Your photos from ${o.eventName} are waiting`,
      text: `Hi ${o.buyer},\n\nYou started an order (${o.items}, ₹${toMajor(o.paidPaise)}) but didn’t finish paying. Complete it here: ${gallery}/${(ev?.shortId ?? '').toLowerCase()}?order=${o.id}\n`,
    })
    await db.update(t).set({ remindedAt: nowIso(), reminderCount: sql`${t.reminderCount} + 1` }).where(eq(t.id, o.id)).run()
    reminded++
  }
  audit(c, 'store.carts_reminded', undefined, { reminded })
  emit(c, m.studioId, 'misc')
  return c.json({ reminded }, 200)
})

// ── Contract v4: wallet, needs-you, refunds ────────────────────────────────
businessRoutes.openapi(createRoute({
  method: 'get', path: '/wallet', tags: ['Business'], summary: 'Wallet: prepaid money + store earnings (owner)', security,
  description: 'One call for every money number the apps show. `balance` is what UIs label "Wallet"; `withdrawable` caps `POST /payouts`; spending (packs, renewals, AI enhance, wallet payments) draws from `prepaid` first, then from positive `earnings`, with one ledger line per pot. Clients must not derive these from the ledger.',
  middleware: [requireStudio('owner', 'view the wallet')] as const,
  responses: { 200: json(WalletBalance), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const [prepaid, earnings] = await Promise.all([walletOf(c.env.DB, m.studioId), payoutBalance(db, m.studioId)])
  return c.json({
    balance: toMajor(prepaid + earnings), withdrawable: toMajor(Math.max(0, earnings)), prepaid: toMajor(prepaid), earnings: toMajor(earnings),
    currency: 'INR' as const, asOf: nowIso(),
  }, 200)
})

businessRoutes.openapi(createRoute({
  method: 'get', path: '/needs-you', tags: ['Business'], summary: 'Things that need the studio’s action (Home “Needs you”)', security,
  description: `Pending access requests, guest uploads awaiting review, events expiring within ${NEEDS_YOU_EXPIRY_DAYS} days (or in the grace period) and face search data about to lapse. A small computed list, so it isn’t paginated.`,
  middleware: [requireStudio('editor', 'see what needs you')] as const,
  responses: { 200: json(z.object({ items: z.array(NeedsYouItem) }).openapi('NeedsYouList')), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const e = schema.events
  const events = await db.select({ id: e.id, name: e.name, status: e.status, date: e.date, expiresAt: e.expiresAt, photoCount: e.photoCount, settings: e.settings })
    .from(e).where(and(eq(e.studioId, m.studioId), isNull(e.deletedAt)))
  const ids = events.map((x) => x.id)
  const ar = schema.accessRequests
  const p = schema.photos
  const accessRequests: { id: string; eventId: string; name: string; note: string; createdAt: string }[] = []
  const pendingUploads: { eventId: string; count: number; latestAt: string }[] = []
  // D1 allows 100 bound parameters per statement, so event ids go in chunks of 80.
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80)
    accessRequests.push(...await db.select({ id: ar.id, eventId: ar.eventId, name: ar.name, note: ar.note, createdAt: ar.createdAt }).from(ar)
      .where(and(inArray(ar.eventId, part), eq(ar.status, 'pending'))))
    const rows = await db.select({ eventId: p.eventId, count: sql<number>`count(*)`, latestAt: sql<string>`max(${p.createdAt})` }).from(p)
      .where(and(eq(p.studioId, m.studioId), inArray(p.eventId, part), eq(p.reviewStatus, 'pending'), isNull(p.deletedAt))).groupBy(p.eventId)
    pendingUploads.push(...rows.map((r) => ({ eventId: r.eventId, count: Number(r.count), latestAt: r.latestAt })))
  }
  return c.json({ items: buildNeedsYou({ events, accessRequests, pendingUploads }) }, 200)
})

/** Sends the refund to Razorpay when keys exist and the order was paid through it. Returns the refund id, or null when simulated. */
async function providerRefund(env: { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string }, order: typeof schema.orders.$inferSelect, reason: string): Promise<string | null> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !order.providerRef) return null
  const headers = { Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`, 'Content-Type': 'application/json' }
  const unavailable = () => new ServiceUnavailable('Refunds are unavailable right now. Try again in a minute.', 'payment_provider_error')
  let paymentId = order.providerRef
  if (!paymentId.startsWith('pay_')) {
    // providerRef holds the Razorpay order id until the webhook/confirm stores the payment id.
    const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(paymentId)}/payments`, { headers })
    if (!res.ok) throw unavailable()
    const captured = ((await res.json()) as { items?: { id: string; status: string }[] }).items?.find((x) => x.status === 'captured')
    if (!captured) throw new Conflict('This payment hasn’t been captured yet, so it can’t be refunded. Try again later.', 'payment_not_captured')
    paymentId = captured.id
  }
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST', headers, body: JSON.stringify({ amount: order.paidPaise, speed: 'normal', receipt: order.id, notes: { reason: reason.slice(0, 250) } }),
  })
  if (!res.ok) throw unavailable()
  return ((await res.json()) as { id: string }).id
}

businessRoutes.openapi(createRoute({
  method: 'post', path: '/orders/{id}/refund', tags: ['Business'], summary: 'Refund an order in full (owner)', security,
  description: 'Only `paid` or `printing` orders can be refunded (409 `order_not_refundable` otherwise, e.g. already refunded, pending, or paid directly to the studio). Refunds the buyer through Razorpay when configured (simulated otherwise), takes the studio’s share back from earnings with a `refund` ledger line, and marks the order `refunded`. Send an `Idempotency-Key`: a retry returns the first result.',
  middleware: [requireStudio('owner', 'refund orders'), idempotent] as const,
  request: { params: IdParam, headers: IdempotencyHeader, body: body(z.object({ reason: z.string().trim().min(1).max(300).openapi({ description: 'Shown to the buyer.' }) })) },
  responses: { 200: json(Order, 'Refunded'), ...problems(401, 403, 404, 409, 422, 503) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const { id } = c.req.valid('param')
  const { reason } = c.req.valid('json')
  const t = schema.orders
  const [order] = await db.select().from(t).where(and(eq(t.id, id), eq(t.studioId, m.studioId))).limit(1)
  if (!order) throw new NotFound('Order', id)
  const notRefundable = (status: string) => new Conflict(
    status === 'refunded' ? `Order #${order.number} was already refunded.` : `Order #${order.number} can’t be refunded because it isn’t paid through Frameline.`,
    'order_not_refundable', { orderStatus: status },
  )
  if (order.status !== 'paid' && order.status !== 'printing') throw notRefundable(order.status)
  const refundRef = await providerRefund(c.env, order, reason)
  // Compare-and-set, so two concurrent refunds can't both book a ledger line.
  const res = await db.update(t).set({ status: 'refunded', refundedAt: nowIso(), refundReason: reason })
    .where(and(eq(t.id, order.id), inArray(t.status, ['paid', 'printing']))).run()
  if (res.meta.changes === 0) throw notRefundable('refunded')
  await addLedger(db, m.studioId, 'refund', `Order #${order.number} refunded · ${reason}`, -order.sharePaise, true)
  audit(c, 'store.refund', { type: 'order', id: order.id }, { amountPaise: order.paidPaise, sharePaise: order.sharePaise, simulated: !refundRef, ...(refundRef ? { refundRef } : {}) })
  emit(c, m.studioId, 'misc')
  const [fresh] = await db.select().from(t).where(eq(t.id, order.id)).limit(1)
  return c.json(orderOut(fresh), 200)
})
