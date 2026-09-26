import type { Context } from 'hono'
import type { AppEnv } from '../env'

/** Client IP as seen by Cloudflare; falls back for local dev/tests. */
export function clientIp(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
}

/** Runs work after the response without blocking it (falls back to awaiting outside a request). */
export function background(c: Context<AppEnv>, p: Promise<unknown>): void {
  const safe = p.catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'background task failed', error: String(e), requestId: c.get('requestId') })))
  try { c.executionCtx.waitUntil(safe) } catch { void safe }
}
