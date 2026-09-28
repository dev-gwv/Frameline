import { createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../env'
import type { Context } from 'hono'
import { getDb, schema } from '../db/client'
import { hashPassword, pepperedHash, randomDigits, randomToken, timingSafeEqual, toBase64Url, verifyPassword } from '../lib/crypto'
import { AppError, BadRequest, Forbidden, NotConfigured, RateLimited, Unauthorized } from '../lib/errors'
import { clientIp } from '../lib/http'
import { newId, nowIso } from '../lib/ids'
import { NoContent, body, createRouter, json, problems, security } from '../lib/openapi'
import { requireAuth, userFromToken, userOf } from '../middleware/auth'
import { limits } from '../middleware/rate-limit'
import { User } from '../schemas/domain'
import { audit } from '../services/audit'
import { getMailer, otpEmail } from '../services/mailer'
import { ensureUser, normalizeEmail } from '../services/provisioning'
import { issueSession, revokeFamily, revokeRefreshToken, rotateRefreshToken } from '../services/sessions'

export const OTP_TTL_MS = 10 * 60_000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_MS = 30_000

const Email = z.email('Enter a valid email address').max(254).transform(normalizeEmail).openapi({ example: 'aarav@northlight.in' })

const Tokens = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string(),
  expiresIn: z.number().int().openapi({ description: 'Access-token lifetime in seconds (900).' }),
  refreshToken: z.string(),
  refreshExpiresIn: z.number().int(),
}).openapi('Tokens')

const SessionResponse = Tokens.extend({ user: User, isNewUser: z.boolean() }).openapi('Session')

const userView = (u: typeof schema.users.$inferSelect) => ({ id: u.id, email: u.email, name: u.name, hasPassword: !!u.passwordHash })

const otpHash = (pepper: string, email: string, code: string) => pepperedHash(pepper, `otp:${email}:${code}`)

export const authRoutes = createRouter()

/** Checks an emailed code: 5 wrong tries burn it; a right code is consumed (single use). */
async function consumeOtp(c: Context<AppEnv>, email: string, code: string): Promise<void> {
  const db = getDb(c.env.DB)
  const t = schema.otpCodes
  const [otp] = await db.select().from(t).where(and(eq(t.email, email), isNull(t.consumedAt))).orderBy(desc(t.createdAt)).limit(1)
  if (!otp) throw new Unauthorized('That code is wrong or was already used. Request a new code.', 'otp_invalid')
  if (otp.expiresAt < nowIso()) throw new Unauthorized('That code has expired. Request a new code.', 'otp_expired')
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new Forbidden('Too many wrong codes. Request a new code.', 'otp_locked')

  const ok = timingSafeEqual(await otpHash(c.env.OTP_PEPPER, email, code), otp.codeHash)
  if (!ok) {
    await db.update(t).set({ attempts: sql`${t.attempts} + 1` }).where(eq(t.id, otp.id)).run()
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (otp.attempts + 1))
    if (remaining === 0) {
      await db.update(t).set({ consumedAt: nowIso() }).where(eq(t.id, otp.id)).run()
      throw new Forbidden('Too many wrong codes. Request a new code.', 'otp_locked', { attemptsRemaining: 0 })
    }
    throw new Unauthorized(`That code is wrong. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`, 'otp_invalid', { attemptsRemaining: remaining })
  }
  const consumed = await db.update(t).set({ consumedAt: nowIso() }).where(and(eq(t.id, otp.id), isNull(t.consumedAt))).run()
  if (consumed.meta.changes === 0) throw new Unauthorized('That code was already used. Request a new code.', 'otp_invalid')
}

// ── OTP ─────────────────────────────────────────────────────────────────────
authRoutes.openapi(createRoute({
  method: 'post', path: '/otp/request', tags: ['Auth'], summary: 'Email a 6-digit sign-in code',
  description: 'Always answers 202 (no account enumeration). Codes expire after 10 minutes; a new code can be requested every 30 seconds. Limited to 5 requests per 15 minutes per email and per IP.',
  middleware: [limits.otpRequest] as const,
  request: { body: body(z.object({ email: Email })) },
  responses: {
    202: json(z.object({
      sent: z.literal(true), expiresIn: z.number().int(), resendAfter: z.number().int(),
      devCode: z.string().optional().openapi({ description: 'Only in development/test environments.' }),
    }), 'Code sent'),
    ...problems(422, 503),
  },
}), async (c) => {
  const { email } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const t = schema.otpCodes
  const [last] = await db.select().from(t).where(eq(t.email, email)).orderBy(desc(t.createdAt)).limit(1)
  const now = Date.now()
  if (last) {
    const since = now - Date.parse(last.createdAt)
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000)
      throw new RateLimited(wait, `Wait ${wait} seconds before requesting another code.`, 'otp_cooldown')
    }
  }
  const code = randomDigits(6)
  await db.batch([
    db.update(t).set({ consumedAt: new Date(now).toISOString() }).where(and(eq(t.email, email), isNull(t.consumedAt))),
    db.insert(t).values({
      id: newId('otp'), email, codeHash: await otpHash(c.env.OTP_PEPPER, email, code), attempts: 0,
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + OTP_TTL_MS).toISOString(), ip: clientIp(c),
    }),
  ])
  await getMailer(c.env).send({ to: email, ...otpEmail(code) })
  const dev = c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test'
  return c.json({ sent: true as const, expiresIn: OTP_TTL_MS / 1000, resendAfter: OTP_RESEND_COOLDOWN_MS / 1000, ...(dev ? { devCode: code } : {}) }, 202)
})

authRoutes.openapi(createRoute({
  method: 'post', path: '/otp/verify', tags: ['Auth'], summary: 'Exchange an emailed code for a session',
  description: 'A code allows 5 wrong attempts, then it is burned and a new one must be requested. New emails get an account (and a studio unless they have a pending team invite).',
  middleware: [limits.otpVerify] as const,
  request: {
    body: body(z.object({
      email: Email,
      code: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
      name: z.string().trim().min(1).max(120).optional().openapi({ description: 'Used when creating a new account.' }),
      studioName: z.string().trim().min(1).max(120).optional(),
    })),
  },
  responses: { 200: json(SessionResponse, 'Signed in'), ...problems(401, 403, 422) },
}), async (c) => {
  const { email, code, name, studioName } = c.req.valid('json')
  const db = getDb(c.env.DB)
  await consumeOtp(c, email, code)

  const { user, isNew } = await ensureUser(db, email, { name, studioName })
  const { id: _id, ...tokens } = await issueSession(c, user)
  audit(c, 'auth.login', { type: 'user', id: user.id }, { method: 'otp', isNew }, user.id)
  return c.json({ ...tokens, user: userView(user), isNewUser: isNew }, 200)
})

// ── Password ────────────────────────────────────────────────────────────────
const Password = z.string().min(10, 'Use at least 10 characters').max(200)

authRoutes.openapi(createRoute({
  method: 'post', path: '/password/login', tags: ['Auth'], summary: 'Sign in with email + password (optional)',
  middleware: [limits.otpVerify] as const,
  request: { body: body(z.object({ email: Email, password: z.string().min(1).max(200) })) },
  responses: { 200: json(SessionResponse, 'Signed in'), ...problems(401, 422) },
}), async (c) => {
  const { email, password } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  // Hash something even when the user doesn't exist so timing doesn't reveal accounts.
  const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false)
  if (!user || !valid) throw new Unauthorized('Email or password is wrong. Try again or sign in with an email code.', 'invalid_credentials')
  const { id: _id, ...tokens } = await issueSession(c, user)
  audit(c, 'auth.login', { type: 'user', id: user.id }, { method: 'password' }, user.id)
  return c.json({ ...tokens, user: userView(user), isNewUser: false }, 200)
})

authRoutes.openapi(createRoute({
  method: 'post', path: '/password', tags: ['Auth'], summary: 'Set or change your password',
  description: 'If a password is already set, `currentPassword` is required. Other sessions are signed out.',
  security, middleware: [requireAuth, limits.otpVerify] as const,
  request: { body: body(z.object({ currentPassword: z.string().max(200).optional(), newPassword: Password })) },
  responses: { 204: NoContent, ...problems(401, 422) },
}), async (c) => {
  const me = userOf(c)
  const { currentPassword, newPassword } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1)
  if (!user) throw new Unauthorized()
  if (user.passwordHash) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new Unauthorized('Your current password is wrong.', 'invalid_current_password')
    }
  }
  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(schema.users.id, user.id)).run()
  const rt = schema.refreshTokens
  await db.update(rt).set({ revokedAt: nowIso(), revokedReason: 'password_changed' })
    .where(and(eq(rt.userId, user.id), isNull(rt.revokedAt), me.familyId ? ne(rt.familyId, me.familyId) : undefined)).run()
  audit(c, 'auth.password_set', { type: 'user', id: user.id })
  return c.body(null, 204)
})

authRoutes.openapi(createRoute({
  method: 'post', path: '/password/reset', tags: ['Auth'], summary: 'Forgot password: set a new one with an emailed code',
  description: 'Request a code with /otp/request first. The code is checked like a sign-in code (5 tries); on success the password is replaced, every other session is signed out, and a new session is returned.',
  middleware: [limits.otpVerify] as const,
  request: { body: body(z.object({ email: Email, code: z.string().regex(/^\d{6}$/, 'The code is 6 digits'), newPassword: Password })) },
  responses: { 200: json(SessionResponse, 'Password reset, signed in'), ...problems(401, 403, 422) },
}), async (c) => {
  const { email, code, newPassword } = c.req.valid('json')
  const db = getDb(c.env.DB)
  await consumeOtp(c, email, code)
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  const { user } = existing ? { user: existing } : await ensureUser(db, email)
  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword), emailVerifiedAt: user.emailVerifiedAt ?? nowIso() }).where(eq(schema.users.id, user.id)).run()
  const rt = schema.refreshTokens
  await db.update(rt).set({ revokedAt: nowIso(), revokedReason: 'password_reset' }).where(and(eq(rt.userId, user.id), isNull(rt.revokedAt))).run()
  const { id: _id, ...tokens } = await issueSession(c, user)
  audit(c, 'auth.password_reset', { type: 'user', id: user.id }, {}, user.id)
  return c.json({ ...tokens, user: { ...userView(user), hasPassword: true }, isNewUser: !existing }, 200)
})

// ── Sessions ────────────────────────────────────────────────────────────────
authRoutes.openapi(createRoute({
  method: 'post', path: '/refresh', tags: ['Auth'], summary: 'Rotate the refresh token and get a new access token',
  description: 'Refresh tokens are single-use. Re-using a rotated token revokes the whole session family (theft detection).',
  middleware: [limits.refresh] as const,
  request: { body: body(z.object({ refreshToken: z.string().min(20).max(200) })) },
  responses: { 200: json(Tokens, 'New tokens'), ...problems(401, 422) },
}), async (c) => {
  const { refreshToken } = c.req.valid('json')
  return c.json(await rotateRefreshToken(c, refreshToken), 200)
})

authRoutes.openapi(createRoute({
  method: 'post', path: '/logout', tags: ['Auth'], summary: 'End the session',
  description: 'Revokes the refresh-token family. With `allDevices: true` (and an access token), every session of the user is revoked.',
  request: { body: body(z.object({ refreshToken: z.string().max(200).optional(), allDevices: z.boolean().optional() })) },
  responses: { 204: NoContent, ...problems(401, 422) },
}), async (c) => {
  const { refreshToken, allDevices } = c.req.valid('json')
  let userId: string | null = null
  if (refreshToken) userId = await revokeRefreshToken(c, refreshToken)
  const authz = c.req.header('authorization')
  if (authz) {
    const me = await userFromToken(c.env.JWT_SECRET, authz.replace(/^Bearer\s+/i, ''))
    userId = me.id
    if (allDevices) {
      const rt = schema.refreshTokens
      await getDb(c.env.DB).update(rt).set({ revokedAt: nowIso(), revokedReason: 'logout_all' }).where(and(eq(rt.userId, me.id), isNull(rt.revokedAt))).run()
    } else if (me.familyId) {
      await revokeFamily(c, me.familyId, 'logout')
    }
  }
  if (userId) audit(c, 'auth.logout', { type: 'user', id: userId }, { allDevices: !!allDevices }, userId)
  return c.body(null, 204)
})

// ── Google OAuth (authorization code + PKCE) ────────────────────────────────
const STATE_COOKIE = 'fl_oauth_state'
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'

const callbackUrl = (c: Context<AppEnv>) => `${(c.env.API_PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '')}/v1/auth/google/callback`
/** App paths are relative to APP_URL; native apps may use an allowlisted absolute URI (GOOGLE_NATIVE_REDIRECTS, default frameline://sign-in). */
export function safeRedirect(env: AppEnv['Bindings'], p?: string): string {
  if (p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\')) return p
  const allowed = (env.GOOGLE_NATIVE_REDIRECTS ?? 'frameline://sign-in').split(',').map((s) => s.trim()).filter(Boolean)
  if (p && allowed.some((a) => p === a || p.startsWith(`${a}?`) || p.startsWith(`${a}/`))) return p
  return '/auth/callback'
}

authRoutes.openapi(createRoute({
  method: 'get', path: '/google/start', tags: ['Auth'], summary: 'Start Google sign-in',
  description: 'Redirects to Google. Sets a short-lived state cookie; the PKCE verifier is kept in KV. `mode=json` returns the URL instead (for mobile). `redirect` is an app path (`/auth/callback`) or, for native apps, an allowlisted URI such as `frameline://sign-in` (GOOGLE_NATIVE_REDIRECTS); tokens come back in the URL fragment for `acceptOAuthFragment`.',
  request: { query: z.object({ redirect: z.string().max(512).optional(), mode: z.enum(['redirect', 'json']).default('redirect') }) },
  responses: { 302: { description: 'Redirect to Google' }, 200: json(z.object({ authorizationUrl: z.url(), state: z.string() })), ...problems(501) },
}), async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) throw new NotConfigured('Google sign-in', 'Google sign-in is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).')
  const { redirect, mode } = c.req.valid('query')
  const state = randomToken(24)
  const verifier = randomToken(48)
  const challenge = toBase64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  await c.env.KV.put(`oauth:google:${state}`, JSON.stringify({ verifier, redirect: safeRedirect(c.env, redirect) }), { expirationTtl: 600 })
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/v1/auth/google', maxAge: 600 })
  const url = new URL(GOOGLE_AUTH)
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID, redirect_uri: callbackUrl(c), response_type: 'code', scope: 'openid email profile',
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account', access_type: 'online',
  }).toString()
  if (mode === 'json') return c.json({ authorizationUrl: url.toString(), state }, 200)
  return c.redirect(url.toString(), 302)
})

authRoutes.openapi(createRoute({
  method: 'get', path: '/google/callback', tags: ['Auth'], summary: 'Google redirect target',
  description: 'Validates state (cookie + KV), exchanges the code, links/creates the user, then redirects to APP_URL with tokens in the URL fragment.',
  request: { query: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }) },
  responses: { 302: { description: 'Redirect back to the app' }, ...problems(400, 501) },
}), async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) throw new NotConfigured('Google sign-in')
  const { code, state, error } = c.req.valid('query')
  const appUrl = c.env.APP_URL.replace(/\/$/, '')
  if (error) return c.redirect(`${appUrl}/login?error=${encodeURIComponent(error)}`, 302)
  const cookie = getCookie(c, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/v1/auth/google', secure: true })
  if (!code || !state) throw new BadRequest('Missing code or state.', 'oauth_invalid')
  const stored = await c.env.KV.get<{ verifier: string; redirect: string }>(`oauth:google:${state}`, 'json')
  // Mobile (mode=json) flows have no cookie; the KV-stored single-use state still binds the request.
  if (!stored || (cookie !== undefined && !timingSafeEqual(cookie, state))) throw new BadRequest('Sign-in link expired or was already used. Start again.', 'oauth_state_mismatch')
  await c.env.KV.delete(`oauth:google:${state}`)

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUrl(c),
      grant_type: 'authorization_code', code_verifier: stored.verifier,
    }),
  })
  if (!tokenRes.ok) throw new AppError(502, 'oauth_exchange_failed', 'Bad gateway', 'Google did not accept the sign-in. Try again.')
  const { access_token } = (await tokenRes.json()) as { access_token?: string }
  const infoRes = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${access_token}` } })
  if (!infoRes.ok) throw new AppError(502, 'oauth_userinfo_failed', 'Bad gateway', 'Could not read your Google profile. Try again.')
  const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string }
  if (!info.email || !info.email_verified) throw new Forbidden('Your Google account email is not verified.', 'oauth_email_unverified')

  const db = getDb(c.env.DB)
  const [bySub] = await db.select().from(schema.users).where(eq(schema.users.googleSub, info.sub)).limit(1)
  const { user, isNew } = bySub ? { user: bySub, isNew: false } : await ensureUser(db, info.email, { name: info.name, googleSub: info.sub })
  if (bySub) await ensureUser(db, bySub.email)
  const { id: _id, ...tokens } = await issueSession(c, user)
  audit(c, 'auth.login', { type: 'user', id: user.id }, { method: 'google' }, user.id)
  const frag = new URLSearchParams({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_in: String(tokens.expiresIn) })
  let target = stored.redirect.startsWith('/') ? `${appUrl}${stored.redirect}` : stored.redirect
  // Tell the app to send a brand-new studio to /setup, same as a new email sign-up (isNewUser).
  if (isNew && stored.redirect.startsWith('/')) target += target.includes('?') ? '&new=1' : '?new=1'
  return c.redirect(`${target}#${frag}`, 302)
})

