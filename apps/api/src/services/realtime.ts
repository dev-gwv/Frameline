import type { Context } from 'hono'
import type { ChangeTopic } from '@frameline/shared'
import type { AppEnv, Env } from '../env'
import { background } from '../lib/http'

export function hubFor(env: Env, studioId: string) {
  return env.EVENT_HUB.get(env.EVENT_HUB.idFromName(`studio:${studioId}`))
}

/** Broadcast change topics to a studio's connected clients. */
export async function publishTopics(env: Env, studioId: string, topics: ChangeTopic[]): Promise<void> {
  if (topics.length === 0) return
  await hubFor(env, studioId).publish(topics)
}

/** Fire-and-forget variant for request handlers (runs after the response via waitUntil). */
export function emit(c: Context<AppEnv>, studioId: string, ...topics: ChangeTopic[]): void {
  background(c, publishTopics(c.env, studioId, topics))
}
