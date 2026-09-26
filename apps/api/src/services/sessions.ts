import type { Context } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { pepperedHash, randomToken } from '../lib/crypto'
import { Unauthorized } from '../lib/errors'
import { clientIp } from '../lib/http'
import { newId } from '../lib/ids'
import { signJwt } from '../lib/jwt'
import { audit } from './audit'

export const ACCESS_TTL_SEC = 15 * 60
export const REFRESH_TTL_SEC = 30 * 24 * 3600

export interface SessionTokens {
  tokenType: 'Bearer'
  accessToken: string
  expiresIn: number
  refreshToken: string
  refreshExpiresIn: number
}

type UserRow = typeof schema.users.$inferSelect

const hashRefresh = (secret: string, token: string) => pepperedHash(secret, `refresh:${token}`)

export async function signAccessToken(secret: string, user: Pick<UserRow, 'id' | 'email' | 'name'>, familyId: string): Promise<string> {
  return signJwt(secret, { sub: user.id, aud: 'studio', email: user.email, name: user.name, fam: familyId }, ACCESS_TTL_SEC)
}

/** Issues a new access token + refresh token. Pass `familyId` when rotating; omit to start a new family (login). */
export async function issueSession(c: Context<AppEnv>, user: Pick<UserRow, 'id' | 'email' | 'name'>, familyId = newId('fam')): Promise<SessionTokens & { id: string }> {
  const db = getDb(c.env.DB)
  const refreshToken = randomToken(32)
  const now = Date.now()
  const id = newId('rt')
  await db.insert(schema.refreshTokens).values({
    id, userId: user.id, familyId, tokenHash: await hashRefresh(c.env.JWT_SECRET, refreshToken),
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + REFRESH_TTL_SEC * 1000).toISOString(),
    userAgent: c.req.header('user-agent')?.slice(0, 200) ?? null, ip: clientIp(c),
  }).run()
  return {
    id, tokenType: 'Bearer', accessToken: await signAccessToken(c.env.JWT_SECRET, user, familyId), expiresIn: ACCESS_TTL_SEC,
    refreshToken, refreshExpiresIn: REFRESH_TTL_SEC,
  }
}

export async function revokeFamily(c: Context<AppEnv>, familyId: string, reason: string): Promise<void> {
  const db = getDb(c.env.DB)
  const t = schema.refreshTokens
  await db.update(t).set({ revokedAt: new Date().toISOString(), revokedReason: reason })
    .where(and(eq(t.familyId, familyId), isNull(t.revokedAt))).run()
}

/**
 * Refresh-token rotation with reuse detection:
 * each refresh token is single-use; presenting an already-rotated token means it leaked
 * (or a client raced itself), so the whole family is revoked and the user must sign in again.
 */
export async function rotateRefreshToken(c: Context<AppEnv>, presented: string): Promise<SessionTokens> {
  const db = getDb(c.env.DB)
  const t = schema.refreshTokens
  const hash = await hashRefresh(c.env.JWT_SECRET, presented)
  const [row] = await db.select().from(t).where(eq(t.tokenHash, hash)).limit(1)
  if (!row) throw new Unauthorized('The refresh token is not valid. Sign in again.', 'invalid_refresh_token')

  if (row.revokedAt) {
    if (row.revokedReason === 'rotated') {
      await revokeFamily(c, row.familyId, 'reuse_detected')
      audit(c, 'auth.refresh_reuse_detected', { type: 'session', id: row.familyId }, { tokenId: row.id }, row.userId)
      throw new Unauthorized('This refresh token was already used. For your security all sessions on this device were signed out. Sign in again.', 'refresh_token_reused')
    }
    throw new Unauthorized('This session has ended. Sign in again.', 'refresh_token_revoked')
  }
  if (row.expiresAt < new Date().toISOString()) throw new Unauthorized('Your session expired. Sign in again.', 'refresh_token_expired')

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, row.userId)).limit(1)
  if (!user) throw new Unauthorized('The account no longer exists.', 'invalid_refresh_token')

  const next = await issueSession(c, user, row.familyId)
  // Compare-and-set: only one concurrent rotation can win; the loser is treated as reuse.
  const res = await db.update(t).set({ revokedAt: new Date().toISOString(), revokedReason: 'rotated', replacedBy: next.id })
    .where(and(eq(t.id, row.id), isNull(t.revokedAt))).run()
  if (res.meta.changes === 0) {
    await revokeFamily(c, row.familyId, 'reuse_detected')
    throw new Unauthorized('This refresh token was already used. Sign in again.', 'refresh_token_reused')
  }
  const { id: _id, ...tokens } = next
  return tokens
}

export async function revokeRefreshToken(c: Context<AppEnv>, presented: string): Promise<string | null> {
  const db = getDb(c.env.DB)
  const t = schema.refreshTokens
  const [row] = await db.select().from(t).where(eq(t.tokenHash, await hashRefresh(c.env.JWT_SECRET, presented))).limit(1)
  if (!row) return null
  await revokeFamily(c, row.familyId, 'logout')
  return row.userId
}
