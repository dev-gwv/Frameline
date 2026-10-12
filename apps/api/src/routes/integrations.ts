import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { AppError, NotConfigured, NotFound, Unauthorized } from '../lib/errors'
import { body, createRouter, json, problems } from '../lib/openapi'
import { verifyPartnerToken, type PartnerClaims } from '../lib/partner-token'
import { audit } from '../services/audit'
import { createEvent } from '../services/events'
import { STUDIO_AUTOPILOT, ensurePartnerStudio, ensurePartnerUser, link, linkedId, projectKey, spendJti } from '../services/partner'
import { emit } from '../services/realtime'
import { issueSession } from '../services/sessions'

/**
 * Studio AutoPilot, the studio-management app, opens Frameline as its gallery add-on.
 *
 * Two doors, both behind a token Studio AutoPilot's server signs with STUDIOAUTOPILOT_SECRET:
 * - GET  /sso        a person pressing "Open gallery": signs them in and lands them in the admin app.
 * - POST /events     a project's "Create gallery": makes (once) the event for that project.
 * - GET  /events/:p  how that gallery is doing, for the project page.
 *
 * Billing stays Frameline's: a studio made here starts on the same trial as any other and pays from its wallet.
 */
export const integrationRoutes = createRouter()

const ISSUER = 'studioautopilot'

function secretOf(c: Context<AppEnv>): string {
  const s = c.env.STUDIOAUTOPILOT_SECRET
  if (!s || s.length < 32) throw new NotConfigured('Studio AutoPilot sign-in', 'Studio AutoPilot is not connected on this server (set STUDIOAUTOPILOT_SECRET, 32+ characters).')
  return s
}

async function claimsFrom(c: Context<AppEnv>, token: string | undefined, purpose: PartnerClaims['purpose']): Promise<PartnerClaims> {
  if (!token) throw new Unauthorized('Send the Studio AutoPilot token.', 'missing_token')
  const r = await verifyPartnerToken(secretOf(c), token, { issuer: ISSUER, purpose })
  if (!r.ok) {
    throw r.error === 'expired'
      ? new Unauthorized('This link from Studio AutoPilot has expired. Open it again.', 'partner_token_expired')
      : new Unauthorized('This link from Studio AutoPilot is not valid.', 'invalid_partner_token')
  }
  await spendJti(c.env.KV, r.claims)
  return r.claims
}

/** An admin path only; anything else lands on the events list. */
const safePath = (p: string | undefined) => (p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && p.length <= 200 ? p : '/events')

// ── Sign-in ─────────────────────────────────────────────────────────────────
integrationRoutes.openapi(createRoute({
  method: 'get', path: '/integrations/studioautopilot/sso', tags: ['Integrations'], summary: 'Sign in from Studio AutoPilot',
  description: 'Opened by the browser from Studio AutoPilot\'s "Open gallery". Verifies the single-use token, finds or makes the person and their studio, and redirects to the admin app with a session in the URL fragment (the same hand-over as Google sign-in). Failures redirect to /login?error=sa_*.',
  request: { query: z.object({ token: z.string().max(4096).optional() }) },
  responses: { 302: { description: 'Redirect into the admin app' } },
}), async (c) => {
  const appUrl = c.env.APP_URL.replace(/\/$/, '')
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  const fail = (code: string) => c.redirect(`${appUrl}/login?error=${code}`, 302)
  let claims: PartnerClaims
  try {
    claims = await claimsFrom(c, c.req.valid('query').token, 'sso')
  } catch (err) {
    return fail(err instanceof NotConfigured ? 'sa_not_configured' : 'sa_link_expired')
  }
  const db = getDb(c.env.DB)
  const user = await ensurePartnerUser(db, claims)
  try {
    await ensurePartnerStudio(db, claims, user)
  } catch (err) {
    if (err instanceof AppError && err.code === 'partner_studio_not_set_up') return fail('sa_studio_not_set_up')
    throw err
  }
  const { id: _id, ...tokens } = await issueSession(c, user)
  audit(c, 'auth.login', { type: 'user', id: user.id }, { method: STUDIO_AUTOPILOT, company: claims.cid }, user.id)
  const frag = new URLSearchParams({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_in: String(tokens.expiresIn) })
  return c.redirect(`${appUrl}/auth/callback?from=${encodeURIComponent(safePath(claims.to))}#${frag}`, 302)
})

// ── A project's gallery ─────────────────────────────────────────────────────
const Gallery = z.object({
  projectId: z.string(),
  eventId: z.string(),
  shortId: z.string(),
  name: z.string(),
  status: z.string(),
  photoCount: z.number().int(),
  galleryUrl: z.string(),
  pin: z.string().nullable(),
  adminPath: z.string(),
  createdAt: z.string(),
}).openapi('PartnerGallery')

type EventRow = typeof schema.events.$inferSelect
const galleryOut = (c: Context<AppEnv>, projectId: string, e: EventRow) => ({
  projectId, eventId: e.id, shortId: e.shortId, name: e.name, status: e.status, photoCount: e.photoCount,
  galleryUrl: `${c.env.GALLERY_URL.replace(/\/$/, '')}/${e.shortId}`,
  pin: e.settings.pin ?? null,
  adminPath: `/events/${e.id}`, createdAt: e.createdAt,
})

async function linkedEvent(c: Context<AppEnv>, claims: PartnerClaims, projectId: string): Promise<EventRow | null> {
  const db = getDb(c.env.DB)
  const studioId = await linkedId(db, 'studio', claims.cid)
  const eventId = await linkedId(db, 'event', projectKey(claims, projectId))
  if (!studioId || !eventId) return null
  // Scoped to the company's own studio, and a gallery moved to the trash counts as gone.
  const [row] = await db.select().from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.studioId, studioId), isNull(schema.events.deletedAt))).limit(1)
  return row ?? null
}

/**
 * A Studio AutoPilot gallery: a wedding the couple shares with their guests. The private-family preset with two
 * changes, both because selfie search is not running in production yet:
 * - face privacy off: the link and the PIN already keep strangers out, and a typed PIN sees everything anyway;
 * - downloads 'all': 'own' allows only photos a selfie matched, so nobody -- not even the couple -- could
 *   download a single photo.
 * The studio can turn either back on per event once selfie search works.
 */
const SA_GALLERY = { facePrivacy: false, downloads: 'all' } as const

const bearerOf = (c: Context<AppEnv>) => /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '')?.[1]?.trim()

const ProjectParam = z.object({ projectId: z.string().min(1).max(128).openapi({ param: { name: 'projectId', in: 'path' } }) })

integrationRoutes.openapi(createRoute({
  method: 'post', path: '/integrations/studioautopilot/events', tags: ['Integrations'], summary: 'Make the gallery for a Studio AutoPilot project',
  description: 'Server to server. Idempotent per project: a second call returns the gallery the first one made (200), unless it was moved to the trash, in which case a new one is made (201).',
  request: {
    body: body(z.object({
      projectId: z.string().min(1).max(128),
      name: z.string().trim().min(1).max(160),
      date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Must be an ISO-8601 date'),
      city: z.string().trim().max(120).default(''),
      type: z.enum(['wedding', 'engagement', 'couple', 'family', 'baby', 'birthday', 'corporate', 'school', 'sports', 'product', 'real-estate', 'themed', 'other']).default('wedding'),
    })),
  },
  responses: { 200: json(Gallery, 'Already made'), 201: json(Gallery, 'Made'), ...problems(401, 409, 422, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const input = c.req.valid('json')
  const db = getDb(c.env.DB)
  const existing = await linkedEvent(c, claims, input.projectId)
  if (existing) return c.json(galleryOut(c, input.projectId, existing), 200)

  const user = await ensurePartnerUser(db, claims)
  const studioId = await ensurePartnerStudio(db, claims, user)
  const key = projectKey(claims, input.projectId)
  // Still linked but not found above: the gallery was moved to the trash. Let go of it so this makes a new one.
  const stale = await linkedId(db, 'event', key)
  if (stale) {
    const l = schema.partnerLinks
    await db.delete(l).where(and(eq(l.provider, STUDIO_AUTOPILOT), eq(l.kind, 'event'), eq(l.externalId, key), eq(l.localId, stale))).run()
  }
  const made = await createEvent(db, studioId, {
    name: input.name, date: input.date, city: input.city, type: input.type, preset: 'private-family', guestUploadLimit: 300,
    overrides: SA_GALLERY,
  })
  const winner = await link(db, 'event', key, made)
  // Two presses at once: the first to link wins, and the loser's empty event is removed again.
  if (winner !== made) await db.delete(schema.events).where(eq(schema.events.id, made)).run()
  const ev = await linkedEvent(c, claims, input.projectId)
  if (!ev) throw new NotFound('Gallery', input.projectId)
  if (winner === made) {
    audit(c, 'event.create', { type: 'event', id: made }, { via: STUDIO_AUTOPILOT, project: input.projectId }, user.id)
    emit(c, studioId, 'events')
  }
  return c.json(galleryOut(c, input.projectId, ev), winner === made ? 201 : 200)
})

integrationRoutes.openapi(createRoute({
  method: 'get', path: '/integrations/studioautopilot/events/{projectId}', tags: ['Integrations'], summary: 'A Studio AutoPilot project\'s gallery',
  request: { params: ProjectParam },
  responses: { 200: json(Gallery), ...problems(401, 404, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const { projectId } = c.req.valid('param')
  const ev = await linkedEvent(c, claims, projectId)
  if (!ev) throw new NotFound('Gallery', projectId)
  return c.json(galleryOut(c, projectId, ev), 200)
})
