import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../env'

export interface RateLimitDecision {
  success: boolean
  limit: number
  remaining: number
  /** Seconds until the oldest hit leaves the window (i.e. when capacity frees up). */
  reset: number
}

/**
 * Sliding-window-log limiter: one instance per (bucket, key). Durable Objects serialise calls,
 * so the check-and-increment is atomic. The log is persisted so eviction doesn't reset limits,
 * and an alarm deletes storage once the window has fully drained.
 */
export class RateLimiter extends DurableObject<Env> {
  private log: number[] | null = null

  async hit(limit: number, windowMs: number, cost = 1): Promise<RateLimitDecision> {
    const now = Date.now()
    const log = (this.log ??= (await this.ctx.storage.get<number[]>('log')) ?? []).filter((t) => t > now - windowMs)
    this.log = log
    if (log.length + cost > limit) {
      const reset = Math.max(1, Math.ceil((log[0] + windowMs - now) / 1000))
      return { success: false, limit, remaining: Math.max(0, limit - log.length), reset }
    }
    for (let i = 0; i < cost; i++) log.push(now)
    await this.ctx.storage.put('log', log)
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null) await this.ctx.storage.setAlarm(now + windowMs + 1000)
    return { success: true, limit, remaining: limit - log.length, reset: Math.max(1, Math.ceil((log[0] + windowMs - now) / 1000)) }
  }

  /** Clears the window (used by tests and support tooling). */
  async reset(): Promise<void> {
    this.log = []
    await this.ctx.storage.deleteAll()
  }

  async alarm(): Promise<void> {
    const log = this.log ?? (await this.ctx.storage.get<number[]>('log')) ?? []
    const newest = log[log.length - 1] ?? 0
    // Windows are at most a day; once the newest hit is older than that, everything has expired.
    if (log.length === 0 || Date.now() - newest > 86_400_000) {
      this.log = null
      await this.ctx.storage.deleteAll()
    } else {
      await this.ctx.storage.setAlarm(Date.now() + 15 * 60_000)
    }
  }
}
