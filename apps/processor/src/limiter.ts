/**
 * How many photos the processor works on at once, and how many may wait.
 *
 * Each photo is decoded whole (a 24 MP JPEG is ~70 MB of pixels) and resized twice, so a burst of uploads
 * must queue here rather than run side by side and blow through the container's memory cap. apps/api already
 * sends at most `max_concurrency` queue batches at a time (wrangler.jsonc), so the wait line stays short; it
 * is for downloads rendered on demand (/render) arriving while photos are being processed. Past the line,
 * the caller is told "busy" (503 + Retry-After) and tries again, instead of everything piling in.
 */
export class Limiter {
  private running = 0
  private readonly waiting: (() => void)[] = []

  readonly max: number
  readonly maxWaiting: number

  // Plain fields, not parameter properties: the processor runs on Node's type stripping, which rejects those.
  constructor(max: number, maxWaiting: number) {
    this.max = max
    this.maxWaiting = maxWaiting
  }

  get busy() { return this.running >= this.max && this.waiting.length >= this.maxWaiting }
  get stats() { return { running: this.running, waiting: this.waiting.length, max: this.max } }

  /** Runs `fn` when a slot is free; null when the wait line is full (the caller answers 503). */
  async run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.running >= this.max) {
      if (this.waiting.length >= this.maxWaiting) return null
      await new Promise<void>((go) => this.waiting.push(go))
    } else {
      this.running++
    }
    try {
      return await fn()
    } finally {
      const next = this.waiting.shift()
      // The slot passes straight to the next in line, so `running` only drops when nobody waits.
      if (next) next()
      else this.running--
    }
  }
}
