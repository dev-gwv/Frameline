import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'

const VALID = /^[A-Za-z0-9._:-]{8,128}$/

/** Accepts a well-formed inbound X-Request-Id (or Cloudflare's cf-ray), else generates one; always echoes it. */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const inbound = c.req.header('x-request-id')
  const id = inbound && VALID.test(inbound) ? inbound : crypto.randomUUID()
  c.set('requestId', id)
  c.set('startedAt', Date.now())
  await next()
  c.header('X-Request-Id', id)
})
