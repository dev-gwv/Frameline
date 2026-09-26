import type { Env } from '../env'

/**
 * The Vectorize binding, or undefined when it isn't usable. Vectorize has no local simulator:
 * in `wrangler dev`/tests the binding is a proxy that throws on first use unless run with remote bindings.
 */
export function vectorIndex(env: Env): VectorizeIndex | undefined {
  // Locally the binding is a remote-only proxy; opt in with VECTORIZE_REMOTE=1 when using remote bindings.
  if ((env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test') && env.VECTORIZE_REMOTE !== '1') return undefined
  try {
    const idx = env.FACES
    return idx && typeof idx.query === 'function' ? idx : undefined
  } catch {
    return undefined
  }
}
