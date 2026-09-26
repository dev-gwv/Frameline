import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../env'

/** One field-level problem inside a 422 response. */
export interface FieldError {
  /** Dotted path of the offending field, e.g. `settings.pin` or `files.0.size`. */
  field: string
  /** Where the field came from: body, query, path or header. */
  in: 'body' | 'query' | 'path' | 'header' | 'cookie'
  message: string
  code: string
}

/** RFC 9457 problem details, as returned by every error response. */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  code: string
  requestId: string
  instance?: string
  errors?: FieldError[]
  [ext: string]: unknown
}

export const PROBLEM_BASE = 'https://api.frameline.in/problems/'
export const PROBLEM_CONTENT_TYPE = 'application/problem+json'

/** Base class: anything thrown that extends AppError becomes a problem+json response. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  readonly title: string
  readonly headers: Record<string, string>
  readonly extensions: Record<string, unknown>

  constructor(
    status: ContentfulStatusCode, code: string, title: string, detail?: string,
    opts: { headers?: Record<string, string>; extensions?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(detail ?? title, { cause: opts.cause })
    this.name = new.target.name
    this.status = status
    this.code = code
    this.title = title
    this.headers = opts.headers ?? {}
    this.extensions = opts.extensions ?? {}
  }
}

export class BadRequest extends AppError {
  constructor(detail = 'The request could not be understood.', code = 'bad_request', extensions?: Record<string, unknown>) {
    super(400, code, 'Bad request', detail, { extensions })
  }
}

export class Unauthorized extends AppError {
  constructor(detail = 'Sign in to continue.', code = 'unauthorized', extensions?: Record<string, unknown>) {
    super(401, code, 'Unauthorized', detail, { headers: { 'WWW-Authenticate': 'Bearer realm="frameline"' }, extensions })
  }
}

export class Forbidden extends AppError {
  constructor(detail = 'You do not have permission to do this.', code = 'forbidden', extensions?: Record<string, unknown>) {
    super(403, code, 'Forbidden', detail, { extensions })
  }
}

export class NotFound extends AppError {
  constructor(what = 'Resource', id?: string) {
    super(404, 'not_found', 'Not found', id ? `${what} ${id} was not found.` : `${what} was not found.`)
  }
}

export class Conflict extends AppError {
  constructor(detail = 'The resource is in a conflicting state.', code = 'conflict', extensions?: Record<string, unknown>) {
    super(409, code, 'Conflict', detail, { extensions })
  }
}

export class PayloadTooLarge extends AppError {
  constructor(maxBytes: number) {
    super(413, 'payload_too_large', 'Payload too large', `The request body is larger than ${maxBytes} bytes.`, { extensions: { maxBytes } })
  }
}

export class UnsupportedMediaType extends AppError {
  constructor(detail = 'Send the body as application/json.') {
    super(415, 'unsupported_media_type', 'Unsupported media type', detail)
  }
}

export class ValidationFailed extends AppError {
  readonly fieldErrors: FieldError[]
  constructor(errors: FieldError[], detail = 'Some fields are missing or invalid. Fix them and try again.') {
    super(422, 'validation_failed', 'Validation failed', detail)
    this.fieldErrors = errors
  }
}

export class RateLimited extends AppError {
  constructor(retryAfterSeconds: number, detail = 'Too many requests. Wait a moment and try again.', code = 'rate_limited', headers: Record<string, string> = {}) {
    const retry = Math.max(1, Math.ceil(retryAfterSeconds))
    super(429, code, 'Too many requests', detail, { headers: { 'Retry-After': String(retry), ...headers }, extensions: { retryAfter: retry } })
  }
}

export class NotConfigured extends AppError {
  constructor(feature: string, detail?: string) {
    super(501, 'not_configured', 'Not configured', detail ?? `${feature} is not configured on this server.`)
  }
}

export class ServiceUnavailable extends AppError {
  constructor(detail = 'This service is temporarily unavailable.', code = 'unavailable') {
    super(503, code, 'Service unavailable', detail)
  }
}

const HTTP_TITLES: Record<number, [string, string]> = {
  400: ['Bad request', 'bad_request'],
  401: ['Unauthorized', 'unauthorized'],
  403: ['Forbidden', 'forbidden'],
  404: ['Not found', 'not_found'],
  405: ['Method not allowed', 'method_not_allowed'],
  408: ['Request timeout', 'timeout'],
  413: ['Payload too large', 'payload_too_large'],
  415: ['Unsupported media type', 'unsupported_media_type'],
  429: ['Too many requests', 'rate_limited'],
}

/** Builds the problem document; `detail` for 5xx is generic unless running in development. */
export function toProblem(err: unknown, c: Context<AppEnv>): { body: ProblemDetails; status: ContentfulStatusCode; headers: Record<string, string> } {
  const requestId = c.get('requestId') ?? 'unknown'
  const dev = c.env?.ENVIRONMENT === 'development'
  const instance = new URL(c.req.url).pathname

  if (err instanceof AppError) {
    const body: ProblemDetails = {
      type: PROBLEM_BASE + err.code, title: err.title, status: err.status, detail: err.message, code: err.code, requestId, instance,
      ...err.extensions,
    }
    if (err instanceof ValidationFailed) body.errors = err.fieldErrors
    return { body, status: err.status, headers: err.headers }
  }
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode
    const [title, code] = HTTP_TITLES[status] ?? ['Error', 'http_error']
    const detail = status === 413 ? 'The request body is too large.' : err.message || title
    return { body: { type: PROBLEM_BASE + code, title, status, detail, code, requestId, instance }, status, headers: {} }
  }
  const e = err instanceof Error ? err : new Error(String(err))
  const body: ProblemDetails = {
    type: PROBLEM_BASE + 'internal', title: 'Internal server error', status: 500,
    detail: dev ? e.message : 'Something went wrong on our side. Try again; if it keeps happening, contact support with the request ID.',
    code: 'internal', requestId, instance,
  }
  if (dev) body.stack = e.stack?.split('\n').slice(0, 12)
  return { body, status: 500, headers: {} }
}

export function problemResponse(err: unknown, c: Context<AppEnv>): Response {
  const { body, status, headers } = toProblem(err, c)
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': PROBLEM_CONTENT_TYPE, 'Cache-Control': 'no-store', 'X-Request-Id': body.requestId, ...headers },
  })
}

/** Converts zod issues into our field-error shape. */
export function zodIssuesToFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string; code: string }>,
  target: string,
): FieldError[] {
  const where: FieldError['in'] = target === 'json' || target === 'form' ? 'body' : target === 'param' ? 'path' : (target as FieldError['in'])
  return issues.map((i) => ({
    field: i.path.map(String).join('.') || '(root)',
    in: where,
    message: i.message,
    code: i.code,
  }))
}
