import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'

/**
 * Marks responses from a deprecated API version (RFC 8594 Sunset + RFC 9745 Deprecation headers).
 * Usage when v2 ships: `app.use('/v1/*', deprecate({ deprecatedAt: '2027-06-01', sunsetAt: '2027-12-01', successor: '/v2' }))`.
 */
export function deprecate(opts: { deprecatedAt: string; sunsetAt: string; successor?: string; docs?: string }) {
  const deprecation = `@${Math.floor(new Date(opts.deprecatedAt).getTime() / 1000)}`
  const sunset = new Date(opts.sunsetAt).toUTCString()
  return createMiddleware<AppEnv>(async (c, next) => {
    await next()
    c.header('Deprecation', deprecation)
    c.header('Sunset', sunset)
    const links: string[] = []
    if (opts.successor) links.push(`<${opts.successor}>; rel="successor-version"`)
    if (opts.docs) links.push(`<${opts.docs}>; rel="deprecation"; type="text/html"`)
    if (links.length) c.header('Link', links.join(', '), { append: true })
  })
}

/** Adds the API version to every versioned response. */
export const apiVersionHeader = (version: string) => createMiddleware<AppEnv>(async (c, next) => {
  await next()
  c.header('API-Version', version)
})
