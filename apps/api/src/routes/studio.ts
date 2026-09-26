import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { getDb, schema } from '../db/client'
import { studioOut, usageOut, websiteOut } from '../db/mappers'
import { Conflict, NotFound } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { toMinor, toMajor } from '../lib/money'
import { IdempotencyHeader, body, createRouter, json, problems, security } from '../lib/openapi'
import { membershipOf, requireAuth, requireStudio, userOf } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import {
  MembershipView, Role, Studio, StudioPatch, TeamMember, Usage, User, WatermarkPatch, WatermarkSettings, Website, WebsitePatch,
} from '../schemas/domain'
import { audit } from '../services/audit'
import { getMailer } from '../services/mailer'
import { normalizeEmail } from '../services/provisioning'
import { emit } from '../services/realtime'

export const studioRoutes = createRouter()

async function loadStudio(db: ReturnType<typeof getDb>, id: string) {
  const [row] = await db.select().from(schema.studios).where(eq(schema.studios.id, id)).limit(1)
  if (!row) throw new NotFound('Studio', id)
  return row
}

// ── Me ─────────────────────────────────────────────────────────────────────
studioRoutes.openapi(createRoute({
  method: 'get', path: '/me', tags: ['Account'], summary: 'Current user and studio memberships', security,
  middleware: [requireAuth] as const,
  responses: { 200: json(z.object({ user: User, memberships: z.array(MembershipView) })), ...problems(401) },
}), async (c) => {
  const me = userOf(c)
  const db = getDb(c.env.DB)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1)
  if (!user) throw new NotFound('User', me.id)
  const rows = await db.select({ m: schema.memberships, name: schema.studios.name }).from(schema.memberships)
    .innerJoin(schema.studios, eq(schema.studios.id, schema.memberships.studioId))
    .where(eq(schema.memberships.userId, me.id)).orderBy(asc(schema.memberships.createdAt))
  return c.json({
    user: { id: user.id, email: user.email, name: user.name, hasPassword: !!user.passwordHash },
    memberships: rows.map((r) => ({ studioId: r.m.studioId, studioName: r.name, role: r.m.role, eventIds: r.m.eventIds })),
  }, 200)
})

studioRoutes.openapi(createRoute({
  method: 'patch', path: '/me', tags: ['Account'], summary: 'Update your name', security,
  middleware: [requireAuth] as const,
  request: { body: body(z.object({ name: z.string().trim().min(1).max(120) }).strict()) },
  responses: { 200: json(User), ...problems(401, 422) },
}), async (c) => {
  const me = userOf(c)
  const db = getDb(c.env.DB)
  await db.update(schema.users).set({ name: c.req.valid('json').name }).where(eq(schema.users.id, me.id)).run()
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1)
  return c.json({ id: u.id, email: u.email, name: u.name, hasPassword: !!u.passwordHash }, 200)
})

// ── Studio ─────────────────────────────────────────────────────────────────
studioRoutes.openapi(createRoute({
  method: 'get', path: '/studio', tags: ['Studio'], summary: 'Get the current studio', security,
  description: 'The studio is chosen by the `X-Studio-Id` header, else your first membership.',
  middleware: [requireStudio('uploader')] as const,
  responses: { 200: json(Studio), ...problems(401, 403) },
}), async (c) => c.json(studioOut(await loadStudio(getDb(c.env.DB), membershipOf(c).studioId)), 200))

studioRoutes.openapi(createRoute({
  method: 'patch', path: '/studio', tags: ['Studio'], summary: 'Update studio profile and branding', security,
  middleware: [requireStudio('editor', 'edit studio settings')] as const,
  request: { body: body(StudioPatch) },
  responses: { 200: json(Studio), ...problems(401, 403, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const patch = c.req.valid('json')
  const db = getDb(c.env.DB)
  if (patch.handle) {
    const [taken] = await db.select({ id: schema.studios.id }).from(schema.studios).where(eq(schema.studios.handle, patch.handle)).limit(1)
    if (taken && taken.id !== m.studioId) throw new Conflict(`The handle "${patch.handle}" is taken. Try another.`, 'handle_taken')
  }
  if (Object.keys(patch).length) await db.update(schema.studios).set(patch).where(eq(schema.studios.id, m.studioId)).run()
  audit(c, 'studio.update', { type: 'studio', id: m.studioId }, { fields: Object.keys(patch) })
  emit(c, m.studioId, 'studio')
  return c.json(studioOut(await loadStudio(db, m.studioId)), 200)
})

studioRoutes.openapi(createRoute({
  method: 'get', path: '/studio/usage', tags: ['Billing'], summary: 'Plan, photo usage and wallet', security,
  middleware: [requireStudio('uploader')] as const,
  responses: { 200: json(Usage), ...problems(401, 403) },
}), async (c) => c.json(usageOut(await loadStudio(getDb(c.env.DB), membershipOf(c).studioId)), 200))

studioRoutes.openapi(createRoute({
  method: 'post', path: '/studio/credits', tags: ['Billing'], summary: 'Add wallet credits (owner)', security,
  description: 'Records a top-up (in rupees) and returns the new wallet balance. Supports `Idempotency-Key`. In production this is called after a Razorpay payment is captured (see README).',
  middleware: [requireStudio('owner', 'manage billing'), idempotent] as const,
  request: { headers: IdempotencyHeader, body: body(z.object({ amount: z.number().positive().max(1_000_000).multipleOf(0.01) })) },
  responses: { 200: json(z.object({ walletCredits: z.number() })), ...problems(401, 403, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const { amount } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const s = schema.studios
  await db.update(s).set({ walletPaise: sql`${s.walletPaise} + ${toMinor(amount)}` }).where(eq(s.id, m.studioId)).run()
  const row = await loadStudio(db, m.studioId)
  audit(c, 'billing.credits_added', { type: 'studio', id: m.studioId }, { amountPaise: toMinor(amount) })
  emit(c, m.studioId, 'usage')
  return c.json({ walletCredits: toMajor(row.walletPaise) }, 200)
})

// ── Watermark & website ────────────────────────────────────────────────────
studioRoutes.openapi(createRoute({
  method: 'get', path: '/watermark', tags: ['Studio'], summary: 'Watermark settings', security,
  middleware: [requireStudio('uploader')] as const,
  responses: { 200: json(WatermarkSettings), ...problems(401, 403, 404) },
}), async (c) => {
  const [row] = await getDb(c.env.DB).select().from(schema.watermarks).where(eq(schema.watermarks.studioId, membershipOf(c).studioId)).limit(1)
  if (!row) throw new NotFound('Watermark')
  return c.json(row.settings, 200)
})

studioRoutes.openapi(createRoute({
  method: 'patch', path: '/watermark', tags: ['Studio'], summary: 'Update watermark settings', security,
  middleware: [requireStudio('editor', 'change the watermark')] as const,
  request: { body: body(WatermarkPatch) },
  responses: { 200: json(WatermarkSettings), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const patch = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(schema.watermarks).where(eq(schema.watermarks.studioId, m.studioId)).limit(1)
  if (!row) throw new NotFound('Watermark')
  const next = { ...row.settings, ...patch, applyTo: { ...row.settings.applyTo, ...(patch.applyTo ?? {}) } }
  await db.update(schema.watermarks).set({ settings: next, updatedAt: nowIso() }).where(eq(schema.watermarks.studioId, m.studioId)).run()
  emit(c, m.studioId, 'misc')
  return c.json(next, 200)
})

studioRoutes.openapi(createRoute({
  method: 'get', path: '/website', tags: ['Studio'], summary: 'Studio website', security,
  middleware: [requireStudio('uploader')] as const,
  responses: { 200: json(Website), ...problems(401, 403, 404) },
}), async (c) => {
  const [row] = await getDb(c.env.DB).select().from(schema.websites).where(eq(schema.websites.studioId, membershipOf(c).studioId)).limit(1)
  if (!row) throw new NotFound('Website')
  return c.json(websiteOut(row), 200)
})

studioRoutes.openapi(createRoute({
  method: 'patch', path: '/website', tags: ['Studio'], summary: 'Update the studio website', security,
  middleware: [requireStudio('editor', 'edit the website')] as const,
  request: { body: body(WebsitePatch) },
  responses: { 200: json(Website), ...problems(401, 403, 404, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const patch = c.req.valid('json')
  const db = getDb(c.env.DB)
  const w = schema.websites
  const [row] = await db.select().from(w).where(eq(w.studioId, m.studioId)).limit(1)
  if (!row) throw new NotFound('Website')
  await db.update(w).set({ ...patch, updatedAt: nowIso() }).where(eq(w.studioId, m.studioId)).run()
  const [next] = await db.select().from(w).where(eq(w.studioId, m.studioId)).limit(1)
  emit(c, m.studioId, 'misc')
  return c.json(websiteOut(next), 200)
})

// ── Team ───────────────────────────────────────────────────────────────────
function accessLabel(role: 'owner' | 'editor' | 'uploader', eventNames: string[]): string {
  if (role === 'owner') return 'All events, billing, payouts'
  if (role === 'editor') return 'All events'
  return eventNames.length ? `${eventNames.join(', ')} only` : 'Assigned events only'
}

studioRoutes.openapi(createRoute({
  method: 'get', path: '/team', tags: ['Team'], summary: 'Studio members and pending invites', security,
  middleware: [requireStudio('editor', 'view the team')] as const,
  responses: { 200: json(z.object({ items: z.array(TeamMember), nextCursor: z.null() })), ...problems(401, 403) },
}), async (c) => {
  const m = membershipOf(c)
  const db = getDb(c.env.DB)
  const members = await db.select({ m: schema.memberships, u: schema.users }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.studioId, m.studioId)).orderBy(asc(schema.memberships.createdAt))
  const invites = await db.select().from(schema.teamInvites)
    .where(and(eq(schema.teamInvites.studioId, m.studioId), isNull(schema.teamInvites.acceptedAt), gt(schema.teamInvites.expiresAt, nowIso())))
  const eventIds = [...new Set([...members.flatMap((r) => r.m.eventIds), ...invites.flatMap((i) => i.eventIds)])]
  const names = new Map<string, string>()
  if (eventIds.length) {
    for (const e of await db.select({ id: schema.events.id, name: schema.events.name }).from(schema.events).where(inArray(schema.events.id, eventIds))) names.set(e.id, e.name)
  }
  const label = (role: 'owner' | 'editor' | 'uploader', ids: string[]) => accessLabel(role, ids.map((id) => names.get(id)).filter((x): x is string => !!x))
  const items = [
    ...members.map((r) => ({ id: r.u.id, name: r.u.name, email: r.u.email, role: r.m.role, access: label(r.m.role, r.m.eventIds), lastActive: r.m.lastActiveAt ?? r.u.lastActiveAt ?? '' })),
    ...invites.map((i) => ({ id: i.id, name: i.email.split('@')[0], email: i.email, role: i.role, access: `${label(i.role, i.eventIds)} · invite pending`, lastActive: '' })),
  ]
  return c.json({ items, nextCursor: null }, 200)
})

studioRoutes.openapi(createRoute({
  method: 'post', path: '/team/invites', tags: ['Team'], summary: 'Invite a team member (owner)', security,
  description: 'Existing Frameline users are added immediately; others get an email invite that is accepted when they first sign in with that email.',
  middleware: [requireStudio('owner', 'manage the team'), idempotent] as const,
  request: {
    headers: IdempotencyHeader,
    body: body(z.object({ email: z.email().max(254).transform(normalizeEmail), role: Role, eventIds: z.array(z.string().max(64)).max(200).default([]) })),
  },
  responses: { 201: json(TeamMember, 'Invited'), ...problems(401, 403, 409, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const me = userOf(c)
  const { email, role, eventIds } = c.req.valid('json')
  const db = getDb(c.env.DB)
  if (eventIds.length) {
    const found = await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.studioId, m.studioId), inArray(schema.events.id, eventIds)))
    if (found.length !== new Set(eventIds).size) throw new NotFound('One or more events')
  }
  const assigned = role === 'uploader' ? eventIds : []
  const [existingUser] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  if (existingUser) {
    const [already] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.studioId, m.studioId), eq(schema.memberships.userId, existingUser.id))).limit(1)
    if (already) throw new Conflict(`${email} is already on the team.`, 'already_member')
    await db.insert(schema.memberships).values({ id: newId('mem'), studioId: m.studioId, userId: existingUser.id, role, eventIds: assigned, createdAt: nowIso() }).run()
    audit(c, 'team.member_added', { type: 'user', id: existingUser.id }, { role })
    emit(c, m.studioId, 'misc')
    return c.json({ id: existingUser.id, name: existingUser.name, email, role, access: accessLabel(role, []), lastActive: existingUser.lastActiveAt ?? '' }, 201)
  }
  const [pending] = await db.select().from(schema.teamInvites)
    .where(and(eq(schema.teamInvites.studioId, m.studioId), eq(schema.teamInvites.email, email), isNull(schema.teamInvites.acceptedAt), gt(schema.teamInvites.expiresAt, nowIso()))).limit(1)
  if (pending) throw new Conflict(`${email} already has a pending invite.`, 'invite_pending')
  const id = newId('inv')
  await db.insert(schema.teamInvites).values({
    id, studioId: m.studioId, email, role, eventIds: assigned, invitedBy: me.id, createdAt: nowIso(), expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  }).run()
  const studio = await loadStudio(db, m.studioId)
  const link = `${c.env.APP_URL.replace(/\/$/, '')}/login?email=${encodeURIComponent(email)}`
  await getMailer(c.env).send({
    to: email,
    subject: `${me.name || 'A colleague'} invited you to ${studio.name} on Frameline`,
    text: `You've been invited to join ${studio.name} on Frameline as ${role}.\n\nSign in with this email address to accept: ${link}\n\nThe invite expires in 14 days.`,
  })
  audit(c, 'team.invited', { type: 'invite', id }, { email, role })
  emit(c, m.studioId, 'misc')
  return c.json({ id, name: email.split('@')[0], email, role, access: `${accessLabel(role, [])} · invite pending`, lastActive: '' }, 201)
})
