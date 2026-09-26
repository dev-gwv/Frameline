import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'
import type { AppEnv } from './env'
import { NotFound, PayloadTooLarge, ValidationFailed, problemResponse, zodIssuesToFieldErrors } from './lib/errors'
import { createRouter, json, problems } from './lib/openapi'
import { logError, structuredLogger } from './middleware/logger'
import { limits } from './middleware/rate-limit'
import { requestId } from './middleware/request-id'
import { userFromToken } from './middleware/auth'
import { apiVersionHeader } from './middleware/versioning'
import { authRoutes } from './routes/auth'
import { businessRoutes } from './routes/business'
import { eventRoutes } from './routes/events'
import { photoRoutes } from './routes/photos'
import { publicRoutes } from './routes/public'
import { realtimeRoutes } from './routes/realtime'
import { studioRoutes } from './routes/studio'
import { uploadRoutes } from './routes/uploads'

export const API_MAJOR = 'v1'
const JSON_LIMIT = 1024 * 1024 // 1 MiB for JSON bodies
const PART_LIMIT = 16 * 1024 * 1024 // proxy part uploads (10 MiB parts + headroom)

const ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id', 'X-Studio-Id', 'X-Guest-Token']
const EXPOSED_HEADERS = [
  'X-Request-Id', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'RateLimit-Policy', 'ETag',
  'Idempotent-Replayed', 'API-Version', 'Deprecation', 'Sunset', 'Link', 'Server-Timing',
]

/** Sets c.var.user when a valid bearer token is present (never fails) so per-user limits can key on it. */
const peekUser = createMiddleware<AppEnv>(async (c, next) => {
  const h = c.req.header('authorization')
  if (h?.startsWith('Bearer ')) {
    try { c.set('user', await userFromToken(c.env.JWT_SECRET, h.slice(7).trim())) } catch { /* the route decides */ }
  }
  await next()
})

export function createApp() {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) throw new ValidationFailed(zodIssuesToFieldErrors(result.error.issues, result.target))
    },
  })

  // ── Global middleware ────────────────────────────────────────────────────
  app.use('*', requestId)
  app.use('*', structuredLogger)
  app.use('*', timing({ enabled: (c) => c.env?.ENVIRONMENT !== 'production' }))
  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin', crossOriginOpenerPolicy: 'same-origin-allow-popups' }))
  app.use('*', async (c, next) => {
    const allow = (c.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return cors({
      origin: (origin) => (allow.includes(origin) || allow.includes('*') ? origin : null),
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ALLOWED_HEADERS,
      exposeHeaders: EXPOSED_HEADERS,
      credentials: true,
      maxAge: 600,
    })(c, next)
  })
  app.use('*', limits.global)

  // ── Unversioned ──────────────────────────────────────────────────────────
  app.openapi(createRoute({
    method: 'get', path: '/health', tags: ['Meta'], summary: 'Liveness + D1 check (unversioned)',
    responses: { 200: json(z.object({ status: z.literal('ok'), checks: z.object({ db: z.literal('ok') }) })), ...problems(503) },
  }), async (c) => {
    await c.env.DB.prepare('SELECT 1').first()
    c.header('Cache-Control', 'no-store')
    return c.json({ status: 'ok' as const, checks: { db: 'ok' as const } }, 200)
  })

  // ── v1 ───────────────────────────────────────────────────────────────────
  const v1 = createRouter()
  v1.use('*', apiVersionHeader('1'))
  v1.use('*', async (c, next) => {
    const isPart = c.req.method === 'PUT' && c.req.path.includes('/uploads/') && c.req.path.includes('/parts/')
    const max = isPart ? PART_LIMIT : JSON_LIMIT
    return bodyLimit({ maxSize: max, onError: () => { throw new PayloadTooLarge(max) } })(c, next)
  })
  v1.use('*', peekUser)
  v1.use('*', limits.write)

  v1.openapi(createRoute({
    method: 'get', path: '/meta', tags: ['Meta'], summary: 'API version and build',
    responses: {
      200: json(z.object({
        name: z.string(), apiVersion: z.string(), version: z.string(), build: z.string(), environment: z.string(),
        docs: z.string(), openapi: z.string(), time: z.string(),
      })),
    },
  }), (c) => c.json({
    name: 'frameline-api', apiVersion: API_MAJOR, version: c.env.API_VERSION, build: c.env.BUILD_SHA, environment: c.env.ENVIRONMENT,
    docs: '/v1/docs', openapi: '/v1/openapi.json', time: new Date().toISOString(),
  }, 200))

  v1.route('/auth', authRoutes)
  v1.route('/', studioRoutes)
  v1.route('/', eventRoutes)
  v1.route('/', photoRoutes)
  v1.route('/', uploadRoutes)
  v1.route('/', businessRoutes)
  v1.route('/public', publicRoutes)
  v1.route('/', realtimeRoutes)

  app.route('/v1', v1)

  // ── OpenAPI + reference docs ─────────────────────────────────────────────
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearer', {
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token from /v1/auth/otp/verify, /password/login or /refresh (15-minute lifetime).',
  })
  app.doc31('/v1/openapi.json', (c) => ({
    openapi: '3.1.0',
    info: {
      title: 'Frameline API', version: c.env.API_VERSION,
      description: 'REST API for Frameline studios, galleries and apps. Errors use RFC 9457 `application/problem+json`. List endpoints use cursor paging (`limit`, `cursor` → `nextCursor`). POST create/upload/payment endpoints accept `Idempotency-Key`.',
    },
    servers: [{ url: c.env.API_PUBLIC_URL || new URL(c.req.url).origin }],
  }))
  app.get('/v1/docs', Scalar({ url: '/v1/openapi.json', pageTitle: 'Frameline API reference' }))

  // ── Errors ───────────────────────────────────────────────────────────────
  app.notFound((c) => problemResponse(new NotFound('Route', `${c.req.method} ${new URL(c.req.url).pathname}`), c))
  app.onError((err, c) => {
    const res = problemResponse(err, c)
    if (res.status >= 500) logError(c, err, { path: new URL(c.req.url).pathname, method: c.req.method })
    return res
  })

  return app
}
