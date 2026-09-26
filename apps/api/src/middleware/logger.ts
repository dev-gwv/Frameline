import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { clientIp } from '../lib/http'

/** One structured JSON line per request (Workers Logs / Logpush index these fields). */
export const structuredLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = c.get('startedAt') ?? Date.now()
  let error: unknown
  try {
    await next()
  } catch (e) {
    error = e
    throw e
  } finally {
    const status = error ? 500 : c.res.status
    const line = {
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      msg: 'request',
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      durationMs: Date.now() - start,
      requestId: c.get('requestId'),
      userId: c.get('user')?.id ?? null,
      studioId: c.get('membership')?.studioId ?? null,
      ip: clientIp(c),
      ua: c.req.header('user-agent')?.slice(0, 160) ?? null,
    }
    if (c.env?.ENVIRONMENT !== 'test') console.log(JSON.stringify(line))
  }
})

export function logError(c: { get: (k: 'requestId') => string | undefined }, err: unknown, extra: Record<string, unknown> = {}) {
  const e = err instanceof Error ? err : new Error(String(err))
  console.error(JSON.stringify({ level: 'error', msg: e.message, name: e.name, stack: e.stack, requestId: c.get('requestId'), ...extra }))
}
