import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../db/client'
import {
  activityOut, broadcastOut, cameraOut, cameraUploadOut, enquiryOut, ledgerOut, orderOut, priceOut, qrOut, storeSettingsOut, ticketOut,
} from '../db/mappers'
import { Conflict, NotFound, ValidationFailed } from '../lib/errors'
import { hashPassword, randomInt } from '../lib/crypto'
import { toMajor, toMinor } from '../lib/money'
import { addLedger, payoutBalance } from '../services/billing'
import { newId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import {
  ActivityItem, Broadcast, Camera, CameraMode, CameraUpload, Enquiry, LedgerEntry, Order, Price, SmartQR, StoreSettings, StoreSettingsPatch, Ticket, TicketPlatform,
} from '../schemas/domain'
import { audit } from '../services/audit'
import { eventForMember } from '../services/events'
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
  const cam = { id: newId('cam'), studioId: m.studioId, label: input.label, eventId: ev.id, albumId: album.id, mode: input.mode, ftpUser, status: 'offline' as const, today: 0, lastFile: null, createdAt: nowIso(), passwordHash: await hashPassword(password) }
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
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.createdAt, t.id, 'asc', cursor)))
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
  const qr = { id: newId('qr'), studioId: m.studioId, name, slug, eventId: ev.id, target: 'web' as const, scans: 0, color: '#1B1712', createdAt: nowIso(), scheduledEventId: null, scheduledAt: null, dotStyle: null, logoUrl: null }
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
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, m.studioId), afterCursor(t.createdAt, t.id, 'desc', cursor)))
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
    imageUrl: input.imageUrl ?? null, cancelledAt: null,
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
  method: 'delete', path: '/qrs/{id}', tags: ['Tools'], summary: 'Delete a smart QR code', security,
  middleware: [requireStudio('editor', 'manage QR codes')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const res = await getDb(c.env.DB).delete(schema.smartQrs).where(and(eq(schema.smartQrs.id, c.req.valid('param').id), eq(schema.smartQrs.studioId, m.studioId))).run()
  if (res.meta.changes === 0) throw new NotFound('QR code', c.req.valid('param').id)
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

async function broadcastFor(db: ReturnType<typeof getDb>, studioId: string, id: string) {
  const [b] = await db.select().from(schema.broadcasts).where(and(eq(schema.broadcasts.id, id), eq(schema.broadcasts.studioId, studioId))).limit(1)
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
  method: 'delete', path: '/broadcasts/{id}', tags: ['Grow'], summary: 'Delete a broadcast from the list', security,
  middleware: [requireStudio('editor', 'manage broadcasts')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const b = await broadcastFor(db, m.studioId, c.req.valid('param').id)
  await db.delete(schema.broadcasts).where(eq(schema.broadcasts.id, b.id)).run()
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
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
    if (documents) next.kyc.documents = documents.map((d) => ({ ...d, status: d.fileName && d.status === 'needed' ? 'review' : d.status }))
    if (next.kyc.gstRegistered && next.kyc.gstin && next.kyc.pan && next.kyc.gstin.slice(2, 12) !== next.kyc.pan) {
      throw new ValidationFailed([{ field: 'kyc.gstin', in: 'body', message: 'Characters 3–12 of the GSTIN must match your PAN', code: 'gstin_pan_mismatch' }])
    }
  }
  if (patch.payout) {
    const { accountNumber, ...rest } = patch.payout
    Object.assign(next.payout, rest)
    if (accountNumber) next.payout.accountLast4 = accountNumber.slice(-4)
    // TODO(payments): real penny-drop verification via the payout provider; simulated as "valid IFSC + account".
    if (accountNumber || (rest.ifsc && rest.ifsc !== cur.payout.ifsc)) next.payout.verified = !!next.payout.accountLast4 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(next.payout.ifsc)
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
