import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AppEnv, Env } from '../env'
import type { RateLimitDecision } from '../do/rate-limiter'
import { RateLimited } from '../lib/errors'
import { clientIp } from '../lib/http'

/** Pluggable store: Workers Rate Limiting binding when available, else the RateLimiter Durable Object. */
export interface RateLimitStore {
  hit(key: string, limit: number, windowSec: number): Promise<RateLimitDecision>
}

/** Cloudflare Workers Rate Limiting binding. Limits/periods are fixed in wrangler.jsonc (period 10 or 60s). */
export class BindingStore implements RateLimitStore {
  constructor(private binding: RateLimit) {}
  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitDecision> {
    const { success } = await this.binding.limit({ key })
    // The binding reports only allow/deny, so the remaining count is unknown while allowed.
    return { success, limit, remaining: success ? limit : 0, reset: windowSec }
  }
}

export class DurableObjectStore implements RateLimitStore {
  constructor(private ns: Env['RATE_LIMITER']) {}
  hit(key: string, limit: number, windowSec: number): Promise<RateLimitDecision> {
    return this.ns.get(this.ns.idFromName(key)).hit(limit, windowSec * 1000)
  }
}

export interface BucketConfig {
  /** Bucket name; also prefixes the store key. */
  name: string
  limit: number
  windowSec: number
  /** Use this Workers Rate Limiting binding when bound (it must be configured with the same limit/period). */
  binding?: 'RL_GLOBAL' | 'RL_PUBLIC' | 'RL_WRITE'
  /** One or more identities to count against (e.g. IP and email). Return [] to skip. */
  keys: (c: Context<AppEnv>) => string[] | Promise<string[]>
  message?: string
}

export function storeFor(env: Env, bucket: Pick<BucketConfig, 'binding' | 'windowSec'>): RateLimitStore {
  const binding = bucket.binding ? env[bucket.binding] : undefined
  if (binding && (bucket.windowSec === 10 || bucket.windowSec === 60)) return new BindingStore(binding)
  return new DurableObjectStore(env.RATE_LIMITER)
}

function limitHeaders(d: RateLimitDecision, windowSec: number): Record<string, string> {
  return {
    'RateLimit-Limit': String(d.limit),
    'RateLimit-Remaining': String(d.remaining),
    'RateLimit-Reset': String(d.reset),
    'RateLimit-Policy': `${d.limit};w=${windowSec}`,
  }
}

/** Checks every key of the bucket; the first exhausted key yields 429 with Retry-After + RateLimit-* headers. */
export function rateLimit(bucket: BucketConfig) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (bucket.name === 'global' && c.env.RATE_LIMIT_DISABLED === '1') return next()
    const keys = await bucket.keys(c)
    if (keys.length === 0) return next()
    const store = storeFor(c.env, bucket)
    let tightest: RateLimitDecision | null = null
    for (const k of keys) {
      const d = await store.hit(`${bucket.name}:${k}`, bucket.limit, bucket.windowSec)
      if (!d.success) throw new RateLimited(d.reset, bucket.message, 'rate_limited', limitHeaders({ ...d, remaining: 0 }, bucket.windowSec))
      if (!tightest || d.remaining < tightest.remaining) tightest = d
    }
    await next()
    if (!tightest) return
    // Inner (route-specific) buckets run later but finish first; keep whichever policy is tighter.
    const existing = c.res.headers.get('RateLimit-Remaining')
    if (existing !== null && Number(existing) <= tightest.remaining) return
    for (const [k, v] of Object.entries(limitHeaders(tightest, bucket.windowSec))) c.header(k, v)
  })
}

// ── Buckets ───────────────────────────────────────────────────────────────────
const ip = (c: Context<AppEnv>) => [`ip:${clientIp(c)}`]

async function emailFromBody(c: Context<AppEnv>): Promise<string | null> {
  try {
    const b = (await c.req.json()) as { email?: unknown }
    return typeof b?.email === 'string' ? b.email.trim().toLowerCase() : null
  } catch {
    return null
  }
}

/** The guest behind a gallery call: a short fingerprint of their session token, else their device id, else the IP. */
const guestKey = (c: Context<AppEnv>): string[] => {
  const auth = c.req.header('authorization')
  const token = (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined) ?? c.req.header('x-guest-token') ?? c.req.query('token')
  if (token && token.length > 20) return [`tok:${token.slice(-24)}`]
  const device = c.req.header('x-guest-device')
  if (device && /^[\w-]{8,64}$/.test(device)) return [`dev:${device}`]
  return ip(c)
}

const ipAndEmail = async (c: Context<AppEnv>) => {
  const e = await emailFromBody(c)
  return [...ip(c), ...(e ? [`email:${e}`] : [])]
}

export const limits = {
  /**
   * Every request, per IP -- except photo files. A wedding's guests share one venue Wi-Fi address, and a gallery
   * page loads dozens of images each: counting files against 300 a minute per IP blocked a room of guests in
   * seconds. Files are static and cached; the API calls around them are what this ceiling is for.
   */
  global: rateLimit({
    name: 'global', limit: 1200, windowSec: 60, binding: 'RL_GLOBAL',
    keys: (c) => (c.req.method === 'GET' && c.req.path.startsWith('/v1/media/') ? [] : ip(c)),
  }),
  /** OTP send: 5 per 15 min per email AND per IP. */
  otpRequest: rateLimit({
    name: 'otp-request', limit: 5, windowSec: 900, keys: ipAndEmail,
    message: 'Too many sign-in codes requested. Wait a few minutes before asking for another.',
  }),
  /** OTP verify / password login: 10 per 15 min per email AND per IP. */
  otpVerify: rateLimit({
    name: 'otp-verify', limit: 10, windowSec: 900, keys: ipAndEmail,
    message: 'Too many sign-in attempts. Wait 15 minutes and try again.',
  }),
  /** Token refresh, per IP. */
  refresh: rateLimit({ name: 'refresh', limit: 60, windowSec: 60, keys: ip }),
  /**
   * Authenticated writes, per user. Not the web copies an upload sends (PUT /photos/:id/web): one per photo, so a
   * 400-photo upload would hit 120 a minute; the global ceiling still caps them.
   */
  write: rateLimit({
    name: 'write', limit: 120, windowSec: 60, binding: 'RL_WRITE',
    keys: (c) => (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || (c.req.method === 'PUT' && /^\/v1\/photos\/[^/]+\/web$/.test(c.req.path)) ? [] : [`user:${c.get('user')?.id ?? clientIp(c)}`]),
  }),
  /**
   * Guest gallery endpoints, per guest: their gallery session, else their device, else their IP. Per IP alone,
   * every guest on the venue's Wi-Fi shared one allowance. The global ceiling above still caps an address.
   */
  publicGallery: rateLimit({ name: 'public', limit: 300, windowSec: 60, binding: 'RL_PUBLIC', keys: guestKey }),
  /** Gallery PIN attempts: 10 per 15 min per IP per event. */
  pin: rateLimit({
    name: 'pin', limit: 10, windowSec: 900,
    keys: (c) => [`${clientIp(c)}:${c.req.param('shortId') ?? '-'}`],
    message: 'Too many PIN attempts. Wait 15 minutes, or ask the photographer for the link.',
  }),
}
