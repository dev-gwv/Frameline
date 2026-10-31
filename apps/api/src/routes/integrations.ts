import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { and, count, desc, eq, isNull, like } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { AppError, NotConfigured, NotFound, Unauthorized } from '../lib/errors'
import { body, createRouter, json, problems } from '../lib/openapi'
import { verifyPartnerToken, type PartnerClaims } from '../lib/partner-token'
import { audit } from '../services/audit'
import { createEvent } from '../services/events'
import { STUDIO_AUTOPILOT, ensurePartnerStudio, ensurePartnerUser, link, linkedId, projectKey, spendJti } from '../services/partner'
import { emit } from '../services/realtime'
import { effectiveSettings, paymentsOn } from '../lib/features'
import { issueSession } from '../services/sessions'
import { DriveNotConnected, driveConfigured, drivePickerOn, getConnection } from '../services/drive'
import { expandPicked, pickerConfig, startImport, stopImport } from '../services/drive-actions'
import { importOut } from '../services/drive-import'
import { DriveImportSchema, DriveItemSchema, DrivePickerSchema, ImportInput } from './drive'

/**
 * Studio AutoPilot, the studio-management app, opens Frameline as its gallery add-on.
 *
 * Two doors, both behind a token Studio AutoPilot's server signs with STUDIOAUTOPILOT_SECRET:
 * - GET  /sso        a person pressing "Open gallery": signs them in and lands them in the admin app.
 * - POST /events     a project's "Create gallery": makes (once) the event for that project.
 * - GET  /events/:p  how that gallery is doing, for the project page.
 * - GET  /events     every gallery made for the company (Studio AutoPilot's Galleries list).
 * - GET  /studio     the joined Frameline studio: plan, wallet, photos used, Google Drive (Studio AutoPilot's settings).
 * - /drive/picker, /drive/expand, /events/:p/drive-imports  importing from Google Drive on Studio AutoPilot's own page.
 * Connecting Drive and keeping originals in it are done in Frameline's admin, reached through /sso with the paths
 * these answers give (`drive.settingsPath`; `importPath` is the admin's own import window).
 * And one door the other way: services/partner-notify.ts tells Studio AutoPilot when a gallery changed.
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
  /** The couple-and-family PIN (sees every photo), when the studio set one. */
  fullAccessPin: z.string().nullable(),
  /** Guests see only their own photos (selfie); the event PIN then shows nothing else. */
  facePrivacy: z.boolean(),
  expiresAt: z.string(),
  /** Gallery opens, all platforms. */
  visits: z.number().int(),
  /** Signed-up guests; only on the single-gallery read. */
  guests: z.number().int().optional(),
  /** Where new full-size files go: Frameline, or the studio's Google Drive. */
  originalsIn: z.enum(['frameline', 'drive']),
  adminPath: z.string(),
  /** The admin page that imports from Google Drive into this gallery (an sso `to`). */
  importPath: z.string(),
  createdAt: z.string(),
}).openapi('PartnerGallery')

type EventRow = typeof schema.events.$inferSelect
const galleryOut = (c: Context<AppEnv>, projectId: string, row: EventRow) => galleryFrom(c, projectId, { ...row, settings: effectiveSettings(c.env, row.settings) })
const galleryFrom = (c: Context<AppEnv>, projectId: string, e: EventRow) => ({
  projectId, eventId: e.id, shortId: e.shortId, name: e.name, status: e.status, photoCount: e.photoCount,
  galleryUrl: `${c.env.GALLERY_URL.replace(/\/$/, '')}/${e.shortId}`,
  pin: e.settings.pin ?? null,
  fullAccessPin: e.settings.facePrivacy && e.settings.faceSearch ? e.settings.fullAccessPin ?? null : null,
  facePrivacy: e.settings.facePrivacy && e.settings.faceSearch,
  expiresAt: e.expiresAt,
  visits: (e.visits?.web ?? 0) + (e.visits?.android ?? 0) + (e.visits?.ios ?? 0),
  originalsIn: e.originalsIn,
  adminPath: `/events/${e.id}`, importPath: `/events/${e.id}?modal=import`, createdAt: e.createdAt,
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
 * - face privacy off: the link and the PIN already keep strangers out (with it on, the event PIN would show a
 *   guest nothing but selfie matches, and only the full-access PIN would show the rest);
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
      originalsIn: z.enum(['frameline', 'drive']).optional().openapi({ description: 'Keep full-size photos in the studio\'s Google Drive. Unset: the studio\'s Drive default. "drive" without a working Drive connection is 409 drive_not_connected.' }),
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
    overrides: SA_GALLERY, originalsIn: input.originalsIn,
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
  const g = schema.guests
  const [{ n }] = await getDb(c.env.DB).select({ n: count() }).from(g).where(and(eq(g.eventId, ev.id), isNull(g.removedAt)))
  return c.json({ ...galleryOut(c, projectId, ev), guests: n }, 200)
})

integrationRoutes.openapi(createRoute({
  method: 'get', path: '/integrations/studioautopilot/events', tags: ['Integrations'], summary: 'Every gallery Studio AutoPilot made for this company',
  description: 'Newest first; galleries in the trash are left out.',
  responses: { 200: json(z.object({ items: z.array(Gallery) })), ...problems(401, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const db = getDb(c.env.DB)
  const studioId = await linkedId(db, 'studio', claims.cid)
  if (!studioId) return c.json({ items: [] }, 200)
  const l = schema.partnerLinks
  const e = schema.events
  const prefix = projectKey(claims, '')
  const rows = await db.select({ key: l.externalId, e }).from(l)
    .innerJoin(e, eq(e.id, l.localId))
    .where(and(eq(l.provider, STUDIO_AUTOPILOT), eq(l.kind, 'event'), like(l.externalId, `${prefix}%`), eq(e.studioId, studioId), isNull(e.deletedAt)))
    .orderBy(desc(e.createdAt)).limit(500)
  return c.json({ items: rows.map((r) => galleryOut(c, r.key.slice(prefix.length), r.e)) }, 200)
})

const PartnerStudio = z.object({
  linked: z.boolean(),
  studioName: z.string().nullable(),
  plan: z.string().nullable(),
  validTill: z.string().nullable(),
  walletRupees: z.number().nullable(),
  photosUsed: z.number().int().nullable(),
  photosLimit: z.number().int().nullable(),
  galleries: z.number().int(),
  adminUrl: z.string(),
  /** Google Drive for this studio: whether Frameline offers it at all, and whether the studio connected it. */
  drive: z.object({
    available: z.boolean(),
    /** Importing also needs Google's file picker. */
    importAvailable: z.boolean(),
    connected: z.boolean(),
    /** Google no longer lets Frameline in: the owner has to connect again. */
    needsReconnect: z.boolean(),
    email: z.string().nullable(),
    /** New galleries keep their full-size photos in Drive. */
    defaultForNewEvents: z.boolean(),
    /** The admin page to connect or manage Drive (an sso `to`). */
    settingsPath: z.string(),
  }),
}).openapi('PartnerStudio')

/** Drive as Studio AutoPilot shows it; a studio not set up here yet has no connection. */
async function driveOut(c: Context<AppEnv>, studioId: string | null) {
  const conn = studioId && driveConfigured(c.env) ? await getConnection(c.env, studioId) : null
  return {
    available: driveConfigured(c.env), importAvailable: drivePickerOn(c.env),
    connected: !!conn && conn.status !== 'revoked', needsReconnect: conn?.status === 'revoked',
    email: conn?.email ?? null, defaultForNewEvents: !!conn && conn.status !== 'revoked' && conn.defaultForNewEvents,
    settingsPath: '/settings/drive',
  }
}

integrationRoutes.openapi(createRoute({
  method: 'get', path: '/integrations/studioautopilot/studio', tags: ['Integrations'], summary: 'The Frameline studio joined to this company',
  description: 'For Studio AutoPilot\'s settings: whether the company is set up here yet, its plan, wallet and photos used. `linked: false` until the owner first opens a gallery.',
  responses: { 200: json(PartnerStudio), ...problems(401, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const db = getDb(c.env.DB)
  const adminUrl = c.env.APP_URL.replace(/\/$/, '')
  const studioId = await linkedId(db, 'studio', claims.cid)
  const [s] = studioId ? await db.select().from(schema.studios).where(eq(schema.studios.id, studioId)).limit(1) : []
  if (!s) return c.json({ linked: false, studioName: null, plan: null, validTill: null, walletRupees: null, photosUsed: null, photosLimit: null, galleries: 0, adminUrl, drive: await driveOut(c, null) }, 200)
  const l = schema.partnerLinks
  const e = schema.events
  const [{ n }] = await db.select({ n: count() }).from(l).innerJoin(e, eq(e.id, l.localId))
    .where(and(eq(l.provider, STUDIO_AUTOPILOT), eq(l.kind, 'event'), like(l.externalId, `${projectKey(claims, '')}%`), eq(e.studioId, s.id), isNull(e.deletedAt)))
  return c.json({
    linked: true, studioName: s.name, plan: s.planId,
    // While payments are off a lapsed plan isn't enforced and nothing can be bought, so there is no end to show
    // (Studio AutoPilot would say "plan ended, renew it" about something that hasn't ended).
    validTill: paymentsOn(c.env) ? s.validTill : null, walletRupees: s.walletPaise / 100,
    photosUsed: s.photosUsed, photosLimit: s.photosLimit, galleries: n, adminUrl, drive: await driveOut(c, s.id),
  }, 200)
})

// ── Google Drive import from Studio AutoPilot's own screen ──────────────────
// Studio AutoPilot shows Google's picker on its Gallery tab with a token from here, then asks us to list what was
// picked and copy it into the project's gallery. The copy, its checks and the Drive connection stay Frameline's
// (services/drive-actions.ts, the same code the admin app's import window runs); connecting Drive stays in
// Frameline's Settings → Google Drive, reached through /sso.

/** The company's Frameline studio; one not set up here yet has no Drive either. */
async function partnerStudioId(c: Context<AppEnv>, claims: PartnerClaims): Promise<string> {
  const studioId = await linkedId(getDb(c.env.DB), 'studio', claims.cid)
  if (!studioId) throw new DriveNotConnected()
  return studioId
}

integrationRoutes.openapi(createRoute({
  method: 'get', path: '/integrations/studioautopilot/drive/picker', tags: ['Integrations'], summary: 'What Google\'s picker needs, for Studio AutoPilot\'s page',
  description: 'A short-lived drive.file token for the studio\'s connected Drive, the Picker\'s browser key and the Cloud project number. The Picker key must allow Studio AutoPilot\'s address as a referrer.',
  responses: { 200: json(DrivePickerSchema), ...problems(401, 409, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  c.header('Cache-Control', 'no-store')
  return c.json(await pickerConfig(c.env, await partnerStudioId(c, claims)), 200)
})

integrationRoutes.openapi(createRoute({
  method: 'post', path: '/integrations/studioautopilot/drive/expand', tags: ['Integrations'], summary: 'List what picked Drive items hold',
  description: 'The same answer as the admin app\'s POST /drive/expand: each picked file, and every file inside each picked folder (three levels) with its folder path.',
  request: { body: body(z.object({ ids: z.array(z.string().regex(/^[\w-]{10,200}$/)).min(1).max(500) })) },
  responses: { 200: json(z.object({ items: z.array(DriveItemSchema), closedFolders: z.array(z.object({ id: z.string(), name: z.string() })) })), ...problems(401, 409, 422, 501, 503) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  return c.json(await expandPicked(c.env, await partnerStudioId(c, claims), c.req.valid('json').ids), 200)
})

integrationRoutes.openapi(createRoute({
  method: 'post', path: '/integrations/studioautopilot/events/{projectId}/drive-imports', tags: ['Integrations'], summary: 'Import picked Drive files into a project\'s gallery',
  description: 'The admin app\'s import, for the project\'s gallery: albums by name (reused when one exists), the plan and event checked for room (402), files already in the gallery skipped, the copy run in the background.',
  request: { params: ProjectParam, body: body(ImportInput) },
  responses: { 201: json(DriveImportSchema, 'Import started'), ...problems(401, 402, 404, 409, 422, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const { projectId } = c.req.valid('param')
  const ev = await linkedEvent(c, claims, projectId)
  if (!ev) throw new NotFound('Gallery', projectId)
  const user = await ensurePartnerUser(getDb(c.env.DB), claims)
  return c.json(await startImport(c, ev, user.id, c.req.valid('json')), 201)
})

integrationRoutes.openapi(createRoute({
  method: 'get', path: '/integrations/studioautopilot/events/{projectId}/drive-imports', tags: ['Integrations'], summary: 'A project gallery\'s Drive imports, newest first',
  request: { params: ProjectParam },
  responses: { 200: json(z.object({ items: z.array(DriveImportSchema) })), ...problems(401, 404, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const { projectId } = c.req.valid('param')
  const ev = await linkedEvent(c, claims, projectId)
  if (!ev) throw new NotFound('Gallery', projectId)
  const t = schema.driveImports
  const rows = await getDb(c.env.DB).select().from(t).where(eq(t.eventId, ev.id)).orderBy(desc(t.createdAt)).limit(30)
  return c.json({ items: rows.map(importOut) }, 200)
})

integrationRoutes.openapi(createRoute({
  method: 'delete', path: '/integrations/studioautopilot/events/{projectId}/drive-imports/{importId}', tags: ['Integrations'], summary: 'Stop a project gallery\'s Drive import',
  description: 'Photos already copied stay; the rest are skipped.',
  request: { params: ProjectParam.extend({ importId: z.string().min(1).max(64).openapi({ param: { name: 'importId', in: 'path' } }) }) },
  responses: { 200: json(DriveImportSchema), ...problems(401, 404, 501) },
}), async (c) => {
  const claims = await claimsFrom(c, bearerOf(c), 'api')
  const { projectId, importId } = c.req.valid('param')
  const ev = await linkedEvent(c, claims, projectId)
  if (!ev) throw new NotFound('Gallery', projectId)
  return c.json(await stopImport(c, ev.studioId, importId, (eventId) => { if (eventId !== ev.id) throw new NotFound('Import', importId) }), 200)
})
