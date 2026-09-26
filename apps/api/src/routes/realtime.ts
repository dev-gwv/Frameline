import { Hono } from 'hono'
import { and, asc, eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { AppError, Forbidden, Unauthorized } from '../lib/errors'
import { userFromToken } from '../middleware/auth'
import { hubFor } from '../services/realtime'

/**
 * GET /v1/realtime — WebSocket upgrade to the studio's EventHub.
 * Browsers can't set headers on WebSocket, so the access token comes either as
 * `?token=<jwt>` or as a subprotocol: `new WebSocket(url, ['frameline', 'bearer.<jwt>'])`.
 * Optional `?studio=<id>` picks the studio (default: first membership).
 */
export const realtimeRoutes = new Hono<AppEnv>()

realtimeRoutes.get('/realtime', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    throw new AppError(426, 'upgrade_required', 'Upgrade required', 'Connect with a WebSocket client (Upgrade: websocket).')
  }
  const protocols = (c.req.header('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim())
  const token = c.req.query('token') ?? protocols.find((p) => p.startsWith('bearer.'))?.slice('bearer.'.length)
  if (!token) throw new Unauthorized('Pass the access token as ?token= or the "bearer.<token>" subprotocol.', 'missing_token')
  const user = await userFromToken(c.env.JWT_SECRET, token)
  c.set('user', user)
  const wanted = c.req.query('studio')
  const m = schema.memberships
  const [membership] = await getDb(c.env.DB).select().from(m)
    .where(wanted ? and(eq(m.userId, user.id), eq(m.studioId, wanted)) : eq(m.userId, user.id))
    .orderBy(asc(m.createdAt)).limit(1)
  if (!membership) throw new Forbidden('You are not a member of this studio.', 'not_a_member')
  const headers = new Headers(c.req.raw.headers)
  headers.set('x-user-id', user.id)
  return hubFor(c.env, membership.studioId).fetch(new Request(c.req.raw.url, { headers }))
})
