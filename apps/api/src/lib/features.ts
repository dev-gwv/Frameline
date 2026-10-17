import { withoutAi, type EventSettings } from '@frameline/shared'
import type { Env } from '../env'

/**
 * Server-side switches, set per deployment (wrangler vars), read on every request -- flipping one needs no code
 * change and no app release: the admin and gallery apps read them from GET /v1/meta.
 *
 * AI_FEATURES: face finding and selfie search ("Find my photos"). `off` until the image processor is deployed
 * (apps/processor); anything else, or unset, is on. While off, guests get withoutAi() settings: no selfie, no
 * face privacy, and "own" downloads become "all", so galleries work fully without it.
 */
export const aiOn = (env: Pick<Env, 'AI_FEATURES'>): boolean => env.AI_FEATURES !== 'off'

/** The settings an event behaves by right now. */
export const effectiveSettings = (env: Pick<Env, 'AI_FEATURES'>, s: EventSettings): EventSettings => (aiOn(env) ? s : withoutAi(s))
