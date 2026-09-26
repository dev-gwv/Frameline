import { parseCode, routeFor } from '@/lib/links'

/**
 * Rewrites incoming system links before Expo Router resolves them:
 *   https://frameline.in/6402f9f?n=Dadi%20ji → /e/6402F9F?n=Dadi%20ji
 *   https://frameline.in/f/FA-KCGWHY        → /studio/FA-KCGWHY
 *   https://frameline.in/s/<code>, /v/<code> → /s/<code>, /v/<code> (personal links, resolved with resolveGuestLink)
 * frameline://e/<shortId> already matches the `e/[shortId]` route. Never throws.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const parsed = parseCode(path)
    return parsed ? routeFor(parsed) : path
  } catch {
    return '/'
  }
}
