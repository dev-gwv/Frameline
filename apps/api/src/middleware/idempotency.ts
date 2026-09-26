import { createMiddleware } from 'hono/factory'
import { and, eq, lt } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { AppError, Conflict } from '../lib/errors'
import { sha256Hex } from '../lib/crypto'
import { background, clientIp } from '../lib/http'
import { guestFromRequest } from './auth'

const TTL_MS = 24 * 3600_000
const KEY_RE = /^[A-Za-z0-9_\-:.]{8,255}$/

class IdempotencyMismatch extends AppError {
  constructor() {
    super(422, 'idempotency_key_reused', 'Idempotency key reused',
      'This Idempotency-Key was already used with a different request body. Generate a new key for a new request.')
  }
}

/**
 * `Idempotency-Key` support (draft-ietf-httpapi-idempotency-key-header).
 * First request: reserve the key (in_progress), run the handler, store status + body for 24h.
 * Retry with same key + same body: replay the stored response with `Idempotent-Replayed: true`.
 * Same key, different body: 422. Same key while the first is still running: 409.
 * 5xx responses are not stored, so the client can retry them.
 */
export const idempotent = createMiddleware<AppEnv>(async (c, next) => {
  const key = c.req.header('idempotency-key')
  if (!key) return next()
  if (!KEY_RE.test(key)) {
    throw new AppError(400, 'invalid_idempotency_key', 'Invalid Idempotency-Key', 'Idempotency-Key must be 8–255 characters of letters, digits, "-", "_", ":" or ".".')
  }
  const db = getDb(c.env.DB)
  const t = schema.idempotencyKeys
  // Studio user, else the guest session (clients can retry from a different IP), else the IP.
  const guest = c.get('user') ? null : await guestFromRequest(c).catch(() => null)
  const principal = c.get('user')?.id ?? (guest ? `guest:${guest.eventId}:${guest.guestId ?? 'anon'}` : `ip:${clientIp(c)}`)
  const path = new URL(c.req.url).pathname
  const scopeKey = `${principal}:${c.req.method}:${path}:${key}`
  const contentType = c.req.header('content-type') ?? ''
  const bodyText = contentType.includes('json') || contentType === '' ? await c.req.text() : `[${contentType}]`
  const requestHash = await sha256Hex(`${c.req.method}\n${path}\n${bodyText}`)
  const now = new Date()

  const [existing] = await db.select().from(t).where(eq(t.scopeKey, scopeKey)).limit(1)
  if (existing && existing.expiresAt > now.toISOString()) {
    if (existing.requestHash !== requestHash) throw new IdempotencyMismatch()
    if (existing.state === 'in_progress') {
      throw new Conflict('A request with this Idempotency-Key is still being processed. Retry shortly.', 'idempotency_in_progress')
    }
    return new Response(existing.responseBody, {
      status: existing.statusCode ?? 200,
      headers: {
        'Content-Type': existing.responseType ?? 'application/json',
        'Idempotent-Replayed': 'true',
        'X-Request-Id': c.get('requestId'),
      },
    })
  }
  if (existing) await db.delete(t).where(eq(t.scopeKey, scopeKey)).run()

  const reserved = await db.insert(t).values({
    scopeKey, requestHash, state: 'in_progress', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  }).onConflictDoNothing().run()
  if (reserved.meta.changes === 0) {
    throw new Conflict('A request with this Idempotency-Key is still being processed. Retry shortly.', 'idempotency_in_progress')
  }

  let stored = false
  try {
    await next()
    const res = c.res
    if (res.status < 500) {
      const text = await res.clone().text()
      await db.update(t).set({
        state: 'done', statusCode: res.status, responseBody: text, responseType: res.headers.get('content-type') ?? 'application/json',
      }).where(eq(t.scopeKey, scopeKey)).run()
      stored = true
    }
  } finally {
    if (!stored) await db.delete(t).where(eq(t.scopeKey, scopeKey)).run()
    // Opportunistic cleanup of expired keys.
    if (Math.random() < 0.02) background(c, db.delete(t).where(and(lt(t.expiresAt, now.toISOString()))).run())
  }
})
