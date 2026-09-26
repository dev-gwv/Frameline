import { createApp } from './app'
import type { Env, PhotoJob } from './env'
import { handlePhotoQueue } from './services/processor'

export { EventHub } from './do/event-hub'
export { RateLimiter } from './do/rate-limiter'

const app = createApp()

export default {
  fetch: app.fetch,
  queue: (batch, env) => handlePhotoQueue(batch, env),
} satisfies ExportedHandler<Env, PhotoJob>
