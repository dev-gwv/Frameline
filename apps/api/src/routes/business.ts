import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../db/client'
import {
  activityOut, broadcastOut, cameraOut, enquiryOut, ledgerOut, orderOut, priceOut, qrOut, ticketOut,
} from '../db/mappers'
import { Conflict, NotFound } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { IdParam, IdempotencyHeader, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import {
  ActivityItem, Broadcast, Camera, CameraMode, Enquiry, LedgerEntry, Order, Price, SmartQR, Ticket, TicketPlatform,
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
  description: 'Creates the camera record and a unique FTP username. The SFTPGo VPS provisions the account (password shown once there).',
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
  const cam = { id: newId('cam'), studioId: m.studioId, label: input.label, eventId: ev.id, albumId: album.id, mode: input.mode, ftpUser, status: 'offline' as const, today: 0, lastFile: null, createdAt: nowIso() }
  await db.insert(schema.cameras).values(cam).run()
  audit(c, 'camera.create', { type: 'camera', id: cam.id })
  emit(c, m.studioId, 'misc')
  return c.json(cameraOut(cam), 201)
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
  const qr = { id: newId('qr'), studioId: m.studioId, name, slug, eventId: ev.id, target: 'web' as const, scans: 0, color: '#1B1712', createdAt: nowIso() }
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
  if (patch.slug && patch.slug !== qr.slug) {
    const [taken] = await db.select({ id: t.id }).from(t).where(and(eq(t.studioId, m.studioId), eq(t.slug, patch.slug))).limit(1)
    if (taken) throw new Conflict(`The short link "${patch.slug}" is already used.`, 'slug_taken')
  }
  if (Object.keys(patch).length) await db.update(t).set(patch).where(eq(t.id, id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(qrOut({ ...qr, ...patch }), 200)
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
