import { OpenAPIHono, z } from '@hono/zod-openapi'
import type { AppEnv } from '../env'
import { ValidationFailed, zodIssuesToFieldErrors } from './errors'

/** Router factory: every body/query/param failure becomes a 422 problem+json with field errors. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) throw new ValidationFailed(zodIssuesToFieldErrors(result.error.issues, result.target))
    },
  })
}

export const FieldErrorSchema = z.object({
  field: z.string(), in: z.enum(['body', 'query', 'path', 'header', 'cookie']), message: z.string(), code: z.string(),
}).openapi('FieldError')

export const ProblemSchema = z.object({
  type: z.string().openapi({ example: 'https://api.frameline.in/problems/not_found' }),
  title: z.string().openapi({ example: 'Not found' }),
  status: z.number().int().openapi({ example: 404 }),
  detail: z.string().openapi({ example: 'Event ev_123 was not found.' }),
  code: z.string().openapi({ example: 'not_found' }),
  requestId: z.string().openapi({ example: '01J9Z6T4Y1...' }),
  instance: z.string().optional(),
  errors: z.array(FieldErrorSchema).optional(),
}).openapi('Problem', { description: 'RFC 9457 problem details' })

const DESCRIPTIONS: Record<number, string> = {
  400: 'Bad request', 401: 'Missing or invalid credentials', 403: 'Authenticated but not allowed', 404: 'Not found',
  409: 'Conflict (e.g. an idempotency key is in flight)', 413: 'Body too large', 422: 'Validation failed', 429: 'Rate limited (see Retry-After)',
  501: 'Feature not configured', 503: 'Dependency unavailable',
}

export function problems(...codes: number[]) {
  const out: Record<number, { description: string; content: { 'application/problem+json': { schema: typeof ProblemSchema } } }> = {}
  for (const code of [...codes, 429]) out[code] = { description: DESCRIPTIONS[code] ?? 'Error', content: { 'application/problem+json': { schema: ProblemSchema } } }
  return out
}

export const json = <T extends z.ZodType>(schema: T, description = 'OK') => ({ description, content: { 'application/json': { schema } } })
export const body = <T extends z.ZodType>(schema: T) => ({ required: true, content: { 'application/json': { schema } } })

export const NoContent = { description: 'No content' } as const
export const security = [{ bearer: [] }]

export const IdParam = z.object({ id: z.string().min(1).max(128).openapi({ param: { name: 'id', in: 'path' }, example: 'ev_riya' }) })

export const IdempotencyHeader = z.object({
  'idempotency-key': z.string().min(8).max(255).optional().openapi({
    param: { name: 'idempotency-key', in: 'header' },
    description: 'Unique key (e.g. a UUID). Retries with the same key and body replay the first response for 24h.',
  }),
})
