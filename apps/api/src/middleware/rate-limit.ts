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

const ipAndEmail = async (c: Context<AppEnv>) => {
  const e = await emailFromBody(c)
  return [...ip(c), ...(e ? [`email:${e}`] : [])]
}

export const limits = {
  /** Every request, per IP. */
  global: rateLimit({ name: 'global', limit: 300, windowSec: 60, binding: 'RL_GLOBAL', keys: ip }),
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
  /** Authenticated writes, per user. */
  write: rateLimit({
    name: 'write', limit: 120, windowSec: 60, binding: 'RL_WRITE',
    keys: (c) => (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) ? [] : [`user:${c.get('user')?.id ?? clientIp(c)}`]),
  }),
  /** Guest gallery endpoints, per IP. */
  publicGallery: rateLimit({ name: 'public', limit: 120, windowSec: 60, binding: 'RL_PUBLIC', keys: ip }),
  /** Gallery PIN attempts: 10 per 15 min per IP per event. */
  pin: rateLimit({
    name: 'pin', limit: 10, windowSec: 900,
    keys: (c) => [`${clientIp(c)}:${c.req.param('shortId') ?? '-'}`],
    message: 'Too many PIN attempts. Wait 15 minutes, or ask the photographer for the link.',
  }),
}
