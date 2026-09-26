import { parseCode } from '@/lib/links'

/**
 * Rewrites incoming system links before Expo Router resolves them:
 *   https://frameline.in/6402f9f?n=Dadi%20ji → /e/6402F9F?n=Dadi%20ji
 *   https://frameline.in/f/FA-KCGWHY        → /studio/FA-KCGWHY
 * frameline://e/<shortId> already matches the `e/[shortId]` route. Never throws.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const parsed = parseCode(path)
    if (!parsed) return path
    if (parsed.kind === 'studio') return `/studio/${parsed.code}`
    return `/e/${parsed.code}${parsed.name ? `?n=${encodeURIComponent(parsed.name)}` : ''}`
  } catch {
    return '/'
  }
}
