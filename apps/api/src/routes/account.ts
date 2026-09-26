import { createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { COUPONS, PERIOD_DAYS, PLANS, planPrice } from '@frameline/shared'
import { getDb, schema } from '../db/client'
import { defaultNotificationPrefs, purchaseOut, usageOut } from '../db/mappers'
import { AppError, Conflict, NotFound } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { toMajor, toMinor } from '../lib/money'
import { IdParam, IdempotencyHeader, NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { PageQuery, afterCursor, pageOf, toPage } from '../lib/pagination'
import { membershipOf, requireStudio, userOf } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { LedgerEntry, NotificationPrefs, Purchase, Role, TeamMember, Usage, UsageBreakdown, UsageReport } from '../schemas/domain'
import { audit } from '../services/audit'
import { creditWallet, debitWallet, recordPurchase } from '../services/billing'
import { emit } from '../services/realtime'
import { accessLabel } from './studio'

export const accountRoutes = createRouter()
const DAY = 86_400_000

async function studioRow(db: ReturnType<typeof getDb>, id: string) {
  const [row] = await db.select().from(schema.studios).where(eq(schema.studios.id, id)).limit(1)
  if (!row) throw new NotFound('Studio', id)
  return row
}

// ── Usage ──────────────────────────────────────────────────────────────────
export const CAPACITY_RULES = [
  'Each photo uploaded in web quality counts as 1.',
  'Each photo uploaded as an original counts as 2.',
  'Guest uploads use the space reserved for guests (the upload limit you set per event), not your photos.',
  'Deleting photos doesn’t give space back until the next billing period.',
  'Copies of a photo in another album don’t count again.',
]

accountRoutes.openapi(createRoute({
  method: 'get', path: '/studio/usage/breakdown', tags: ['Billing'], summary: 'How capacity is calculated, per event', security,
  middleware: [requireStudio('editor', 'view usage')] as const,
  responses: { 200: json(UsageBreakdown), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const st = await studioRow(db, m.studioId)
  const rows = await db.all<{ id: string; name: string; web: number; originals: number; guest: number }>(sql`
    SELECT e.id, e.name,
      coalesce(sum(CASE WHEN a.kind != 'guest' AND p.quality = 'web' AND p.enhanced_from IS NULL THEN 1 ELSE 0 END), 0) AS web,
      coalesce(sum(CASE WHEN a.kind != 'guest' AND p.quality = 'original' THEN 1 ELSE 0 END), 0) AS originals,
      coalesce(sum(CASE WHEN a.kind = 'guest' THEN 1 ELSE 0 END), 0) AS guest
    FROM events e LEFT JOIN photos p ON p.event_id = e.id LEFT JOIN albums a ON a.id = p.album_id
    WHERE e.studio_id = ${m.studioId} AND e.deleted_at IS NULL GROUP BY e.id ORDER BY e.created_at DESC`)
  return c.json({
    limit: st.photosLimit, used: st.photosUsed, guestReserved: st.guestReserved,
    available: Math.max(0, st.photosLimit - st.photosUsed - st.guestReserved), rules: CAPACITY_RULES,
    events: rows.map((r) => ({ eventId: r.id, name: r.name, webPhotos: r.web, originals: r.originals, guestUploads: r.guest, counted: r.web + r.originals * 2 })),
  }, 200)
})

const csvCell = (v: string | number | null) => { const x = v === null ? '' : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x }

accountRoutes.openapi(createRoute({
  method: 'post', path: '/studio/usage/report', tags: ['Billing'], summary: 'Generate a usage report (CSV)', security,
  middleware: [requireStudio('editor', 'download reports')] as const,
  responses: { 202: json(UsageReport, 'Report generated'), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const events = await db.select().from(schema.events).where(and(eq(schema.events.studioId, m.studioId), isNull(schema.events.deletedAt))).orderBy(desc(schema.events.createdAt))
  const csv = [['Event', 'Short code', 'Date', 'Photos', 'Photo limit', 'Status', 'Expires'], ...events.map((e) => [e.name, e.shortId, e.date.slice(0, 10), e.photoCount, e.photoLimit, e.status, e.expiresAt.slice(0, 10)])]
    .map((r) => r.map(csvCell).join(',')).join('\n')
  // Small enough to build inline; large studios would move this to the queue (status 'processing' until done).
  const row = { id: newId('rep'), studioId: m.studioId, status: 'ready' as const, requestedAt: nowIso(), readyAt: nowIso(), csv }
  await db.insert(schema.usageReports).values(row).run()
  emit(c, m.studioId, 'usage')
  return c.json({ id: row.id, status: row.status, requestedAt: row.requestedAt, readyAt: row.readyAt, csv }, 202)
})

accountRoutes.openapi(createRoute({
  method: 'get', path: '/studio/usage/report', tags: ['Billing'], summary: 'Latest usage report', security,
  middleware: [requireStudio('editor', 'download reports')] as const,
  responses: { 200: json(z.object({ report: UsageReport.nullable() })), ...problems(401, 403) },
}), async (c) => {
  const t = schema.usageReports
  const [r] = await getDb(c.env.DB).select().from(t).where(eq(t.studioId, membershipOf(c).studioId)).orderBy(desc(t.requestedAt)).limit(1)
  return c.json({ report: r ? { id: r.id, status: r.status, requestedAt: r.requestedAt, ...(r.readyAt ? { readyAt: r.readyAt } : {}), ...(r.csv ? { csv: r.csv } : {}) } : null }, 200)
})

// ── Plan & wallet ──────────────────────────────────────────────────────────
accountRoutes.openapi(createRoute({
  method: 'post', path: '/studio/plan', tags: ['Billing'], summary: 'Change plan (prorated) — owner', security,
  description: 'Unused time on the current plan is credited against the new plan’s price. Payment capture is simulated until Razorpay keys are configured.',
  middleware: [requireStudio('owner', 'change the plan'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ planId: z.enum(['starter', 'studio', 'pro', 'agency']), period: z.enum(['yearly', 'quarterly']) })) },
  responses: { 200: json(z.object({ usage: Usage, charged: z.number(), credit: z.number(), purchase: Purchase.nullable() })), ...problems(401, 403, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const { planId, period } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const st = await studioRow(db, m.studioId)
  if (st.planId === planId && st.planPeriod === period) throw new Conflict('You are already on this plan.', 'same_plan')
  const current = PLANS.find((p) => p.id === st.planId)!
  const next = PLANS.find((p) => p.id === planId)!
  const remainingDays = Math.max(0, (Date.parse(st.validTill) - Date.now()) / DAY)
  const credit = Math.round(planPrice(current, st.planPeriod) * Math.min(1, remainingDays / PERIOD_DAYS[st.planPeriod]))
  const charged = Math.max(0, planPrice(next, period) - credit)
  await db.update(schema.studios).set({ planId, planPeriod: period, photosLimit: next.photos, validTill: new Date(Date.now() + PERIOD_DAYS[period] * DAY).toISOString() }).where(eq(schema.studios.id, m.studioId)).run()
  const purchase = await recordPurchase(db, m.studioId, {
    description: `${next.name} plan · ${period}${credit ? ` (₹${credit} credit for unused time)` : ''}`, kind: 'plan', amountPaise: toMinor(charged), method: 'card',
  })
  audit(c, 'billing.plan_changed', { type: 'studio', id: m.studioId }, { from: st.planId, to: planId, period, charged })
  emit(c, m.studioId, 'usage', 'misc')
  return c.json({ usage: usageOut(await studioRow(db, m.studioId)), charged, credit, purchase: purchaseOut(purchase) }, 200)
})

accountRoutes.openapi(createRoute({
  method: 'put', path: '/studio/renewal-multiplier', tags: ['Billing'], summary: 'Set the client renewal price multiplier — owner', security,
  middleware: [requireStudio('owner', 'change renewal pricing')] as const,
  request: { body: body(z.object({ multiplier: z.number().min(1).max(10) })) },
  responses: { 200: json(Usage), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  await db.update(schema.studios).set({ renewalMultiplier: c.req.valid('json').multiplier }).where(eq(schema.studios.id, m.studioId)).run()
  emit(c, m.studioId, 'usage')
  return c.json(usageOut(await studioRow(db, m.studioId)), 200)
})

accountRoutes.openapi(createRoute({
  method: 'post', path: '/studio/coupons', tags: ['Billing'], summary: 'Redeem a coupon — owner', security,
  middleware: [requireStudio('owner', 'redeem coupons'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ code: z.string().trim().min(3).max(40).transform((s) => s.toUpperCase()) })) },
  responses: { 200: json(z.object({ credits: z.number(), walletCredits: z.number() })), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const { code } = c.req.valid('json')
  const credits = COUPONS[code]
  if (!credits) throw new AppError(404, 'invalid_coupon', 'Invalid coupon', 'That coupon code isn’t valid. Check the spelling and try again.')
  const db = getDb(c.env.DB)
  const st = schema.studios
  // Atomic "not used yet" check on the JSON list of redeemed codes.
  const res = await db.update(st).set({ couponsRedeemed: sql`json_insert(${st.couponsRedeemed}, '$[#]', ${code})` })
    .where(and(eq(st.id, m.studioId), sql`NOT EXISTS (SELECT 1 FROM json_each(${st.couponsRedeemed}) WHERE value = ${code})`)).run()
  if (res.meta.changes === 0) throw new Conflict('This coupon was already used on your account.', 'coupon_used')
  await creditWallet(db, m.studioId, toMinor(credits), `Coupon ${code}`)
  await recordPurchase(db, m.studioId, { description: `Coupon ${code} · ${credits} credits`, kind: 'coupon', amountPaise: 0, method: 'coupon' })
  emit(c, m.studioId, 'usage', 'misc')
  return c.json({ credits, walletCredits: toMajor((await studioRow(db, m.studioId)).walletPaise) }, 200)
})

accountRoutes.openapi(createRoute({
  method: 'post', path: '/studio/credits/spend', tags: ['Billing'], summary: 'Spend wallet credits', security,
  description: 'Debits the wallet and adds a `credits-used` ledger line. 402 when the wallet is short.',
  middleware: [requireStudio('editor', 'spend credits'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ amount: z.number().positive().max(1_000_000).multipleOf(0.01), description: z.string().trim().min(1).max(200) })) },
  responses: { 200: json(z.object({ walletCredits: z.number(), entry: LedgerEntry })), ...problems(401, 402, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const { amount, description } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const entry = await debitWallet(db, m.studioId, toMinor(amount), description)
  emit(c, m.studioId, 'usage', 'misc')
  return c.json({ walletCredits: toMajor((await studioRow(db, m.studioId)).walletPaise), entry }, 200)
})

accountRoutes.openapi(createRoute({
  method: 'get', path: '/purchases', tags: ['Billing'], summary: 'What the studio bought from Frameline — owner', security,
  middleware: [requireStudio('owner', 'view billing')] as const,
  request: { query: PageQuery },
  responses: { 200: json(pageOf(Purchase, 'PurchasePage')), ...problems(401, 403) },
}), async (c) => {
  const { limit, cursor } = c.req.valid('query')
  const t = schema.purchases
  const rows = await getDb(c.env.DB).select().from(t).where(and(eq(t.studioId, membershipOf(c).studioId), afterCursor(t.at, t.id, 'desc', cursor)))
    .orderBy(desc(t.at), desc(t.id)).limit(limit + 1)
  return c.json(toPage(rows, limit, (r) => [r.at, r.id], purchaseOut), 200)
})

// ── Notification preferences (per member) ──────────────────────────────────
accountRoutes.openapi(createRoute({
  method: 'get', path: '/me/notifications', tags: ['Account'], summary: 'Your notification preferences for this studio', security,
  middleware: [requireStudio('uploader')] as const,
  responses: { 200: json(NotificationPrefs), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const [row] = await getDb(c.env.DB).select({ p: schema.memberships.notificationPrefs }).from(schema.memberships).where(eq(schema.memberships.id, m.id)).limit(1)
  return c.json(row?.p ?? defaultNotificationPrefs(userOf(c).email), 200)
})

accountRoutes.openapi(createRoute({
  method: 'put', path: '/me/notifications', tags: ['Account'], summary: 'Update notification preferences', security,
  middleware: [requireStudio('uploader')] as const,
  request: { body: body(NotificationPrefs.partial().strict()) },
  responses: { 200: json(NotificationPrefs), ...problems(401, 403, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const [row] = await db.select({ p: schema.memberships.notificationPrefs }).from(schema.memberships).where(eq(schema.memberships.id, m.id)).limit(1)
  const next = { ...(row?.p ?? defaultNotificationPrefs(userOf(c).email)), ...c.req.valid('json') }
  await db.update(schema.memberships).set({ notificationPrefs: next }).where(eq(schema.memberships.id, m.id)).run()
  emit(c, m.studioId, 'misc')
  return c.json(next, 200)
})

// ── Team member changes ────────────────────────────────────────────────────
async function ownerCount(db: ReturnType<typeof getDb>, studioId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.memberships).where(and(eq(schema.memberships.studioId, studioId), eq(schema.memberships.role, 'owner')))
  return Number(r?.n ?? 0)
}

accountRoutes.openapi(createRoute({
  method: 'patch', path: '/team/{id}', tags: ['Team'], summary: 'Change a member’s role or assigned events — owner', security,
  description: '`id` is the user id of a member, or the id of a pending invite.',
  middleware: [requireStudio('owner', 'manage the team')] as const,
  request: { params: IdParam, body: body(z.object({ role: Role, eventIds: z.array(z.string().max(128)).max(200) }).partial().strict()) },
  responses: { 200: json(TeamMember), ...problems(401, 403, 404, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const id = c.req.valid('param').id
  const patch = c.req.valid('json')
  if (patch.eventIds?.length) {
    const found = await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.studioId, m.studioId), inArray(schema.events.id, patch.eventIds.slice(0, 90))))
    if (found.length !== new Set(patch.eventIds).size) throw new NotFound('One or more events')
  }
  const names = async (ids: string[]) => ids.length ? (await db.select({ name: schema.events.name }).from(schema.events).where(inArray(schema.events.id, ids.slice(0, 90)))).map((e) => e.name) : []
  const [row] = await db.select({ m: schema.memberships, u: schema.users }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.studioId, m.studioId), eq(schema.memberships.userId, id))).limit(1)
  if (row) {
    const role = patch.role ?? row.m.role
    if (row.m.role === 'owner' && role !== 'owner' && (await ownerCount(db, m.studioId)) <= 1) throw new Conflict('A studio needs at least one owner. Make someone else owner first.', 'last_owner')
    const eventIds = role === 'uploader' ? (patch.eventIds ?? row.m.eventIds) : []
    await db.update(schema.memberships).set({ role, eventIds }).where(eq(schema.memberships.id, row.m.id)).run()
    audit(c, 'team.member_updated', { type: 'user', id }, { role, eventIds })
    emit(c, m.studioId, 'misc')
    return c.json({ id, name: row.u.name, email: row.u.email, role, access: accessLabel(role, await names(eventIds)), lastActive: row.m.lastActiveAt ?? '', eventIds }, 200)
  }
  const [inv] = await db.select().from(schema.teamInvites).where(and(eq(schema.teamInvites.id, id), eq(schema.teamInvites.studioId, m.studioId))).limit(1)
  if (!inv || inv.acceptedAt) throw new NotFound('Team member', id)
  const role = patch.role ?? inv.role
  const eventIds = role === 'uploader' ? (patch.eventIds ?? inv.eventIds) : []
  await db.update(schema.teamInvites).set({ role, eventIds }).where(eq(schema.teamInvites.id, id)).run()
  emit(c, m.studioId, 'misc')
  return c.json({ id, name: inv.email.split('@')[0], email: inv.email, role, access: `${accessLabel(role, await names(eventIds))} · invite pending`, lastActive: '', eventIds, pending: true }, 200)
})

accountRoutes.openapi(createRoute({
  method: 'delete', path: '/team/{id}', tags: ['Team'], summary: 'Remove a member or cancel an invite — owner', security,
  middleware: [requireStudio('owner', 'manage the team')] as const,
  request: { params: IdParam },
  responses: { 204: NoContent, ...problems(401, 403, 404, 409) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const id = c.req.valid('param').id
  const [row] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.studioId, m.studioId), eq(schema.memberships.userId, id))).limit(1)
  if (row) {
    if (row.role === 'owner' && (await ownerCount(db, m.studioId)) <= 1) throw new Conflict('You can’t remove the only owner.', 'last_owner')
    await db.batch([
      db.delete(schema.memberships).where(eq(schema.memberships.id, row.id)),
      // End their sessions' access to this studio immediately: access tokens are re-checked against memberships on every call.
    ])
    audit(c, 'team.member_removed', { type: 'user', id })
  } else {
    const res = await db.delete(schema.teamInvites).where(and(eq(schema.teamInvites.id, id), eq(schema.teamInvites.studioId, m.studioId))).run()
    if (res.meta.changes === 0) throw new NotFound('Team member', id)
    audit(c, 'team.invite_cancelled', { type: 'invite', id })
  }
  emit(c, m.studioId, 'misc')
  return c.body(null, 204)
})

