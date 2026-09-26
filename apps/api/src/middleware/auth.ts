import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { and, asc, eq } from 'drizzle-orm'
import type { AppEnv, AuthUser, GuestClaims } from '../env'
import { getDb, schema } from '../db/client'
import { Forbidden, Unauthorized } from '../lib/errors'
import { verifyJwt } from '../lib/jwt'
import { assertRole, type Membership, type Role } from '../services/access'
import { background } from '../lib/http'

function bearer(c: Context<AppEnv>): string | null {
  const h = c.req.header('authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

export async function userFromToken(secret: string, token: string): Promise<AuthUser> {
  const r = await verifyJwt(secret, token, 'studio')
  if (!r.ok) {
    throw r.error === 'expired'
      ? new Unauthorized('Your session has expired. Refresh the access token.', 'token_expired')
      : new Unauthorized('The access token is invalid.', 'invalid_token')
  }
  return { id: r.claims.sub, email: String(r.claims.email ?? ''), name: String(r.claims.name ?? ''), familyId: typeof r.claims.fam === 'string' ? r.claims.fam : undefined }
}

/** Requires a valid studio access token (Authorization: Bearer <jwt>). */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearer(c)
  if (!token) throw new Unauthorized('Sign in to continue. Send the access token as "Authorization: Bearer <token>".', 'missing_token')
  c.set('user', await userFromToken(c.env.JWT_SECRET, token))
  await next()
})

/** Loads the caller's studio membership (X-Studio-Id header, else their first studio). */
export async function loadMembership(c: Context<AppEnv>, userId: string): Promise<Membership> {
  const db = getDb(c.env.DB)
  const wanted = c.req.header('x-studio-id')
  const m = schema.memberships
  const rows = await db.select().from(m)
    .where(wanted ? and(eq(m.userId, userId), eq(m.studioId, wanted)) : eq(m.userId, userId))
    .orderBy(asc(m.createdAt)).limit(1)
  const row = rows[0]
  if (!row) {
    throw wanted
      ? new Forbidden('You are not a member of this studio.', 'not_a_member')
      : new Forbidden('Your account is not part of a studio yet. Accept an invite or create a studio.', 'no_studio')
  }
  const now = Date.now()
  if (!row.lastActiveAt || now - Date.parse(row.lastActiveAt) > 5 * 60_000) {
    background(c, db.update(m).set({ lastActiveAt: new Date(now).toISOString() }).where(eq(m.id, row.id)).run())
  }
  return { id: row.id, studioId: row.studioId, userId: row.userId, role: row.role, eventIds: row.eventIds }
}

/** Auth + studio membership + minimum role. Owner ⊃ editor ⊃ uploader. */
export function requireStudio(min: Role = 'uploader', action?: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    let user = c.get('user')
    if (!user) {
      const token = bearer(c)
      if (!token) throw new Unauthorized('Sign in to continue. Send the access token as "Authorization: Bearer <token>".', 'missing_token')
      user = await userFromToken(c.env.JWT_SECRET, token)
      c.set('user', user)
    }
    const membership = await loadMembership(c, user.id)
    assertRole(membership, min, action)
    c.set('membership', membership)
    await next()
  })
}

/** Guest token (from PIN check / registration) for /v1/public endpoints. Optional unless `required`. */
export async function guestFromRequest(c: Context<AppEnv>): Promise<GuestClaims | null> {
  const token = bearer(c) ?? c.req.header('x-guest-token') ?? c.req.query('token') ?? null
  if (!token) return null
  const r = await verifyJwt(c.env.JWT_SECRET, token, 'guest')
  if (!r.ok) {
    throw r.error === 'expired'
      ? new Unauthorized('Your gallery session has expired. Enter the PIN again.', 'guest_token_expired')
      : new Unauthorized('The gallery token is invalid.', 'invalid_guest_token')
  }
  return { eventId: String(r.claims.sub), guestId: r.claims.gid as string | undefined, studioId: String(r.claims.sid), all: r.claims.all === true, vp: r.claims.vp === true }
}

/** Handlers call these after middleware has run; they narrow the optional context vars. */
export function membershipOf(c: Context<AppEnv>): Membership {
  const m = c.get('membership')
  if (!m) throw new Unauthorized()
  return m
}

export function userOf(c: Context<AppEnv>): AuthUser {
  const u = c.get('user')
  if (!u) throw new Unauthorized()
  return u
}
