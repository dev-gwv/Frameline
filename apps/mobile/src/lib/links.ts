import { parseGuestLinkPath, type GuestLinkKind, type PhotoEvent, type Studio } from '@frameline/shared'

export const WEB_HOST = 'frameline.in'

/** Public gallery link for an event (the same link the web share sheet shows). */
export const eventLink = (e: Pick<PhotoEvent, 'shortId'>) => `https://${WEB_HOST}/${e.shortId.toLowerCase()}`
/** Follow link for a studio. */
export const followLink = (s: Pick<Studio, 'followCode'>) => `https://${WEB_HOST}/f/${s.followCode}`

export type ParsedCode =
  | { kind: 'event'; code: string; name?: string }
  | { kind: 'studio'; code: string }
  /** Personal link: /s/<code> (album / face links) or /v/<code> (VIP). Resolved with resolveGuestLink. */
  | { kind: 'link'; linkKind: GuestLinkKind; code: string }

/**
 * Accepts anything a guest might paste or scan: an event code (6402F9F), a follow code (FA-KCGWHY),
 * frameline://e/<id>?n=Name, https://frameline.in/<id>, /f/<code>, and personal links /s/<code> and /v/<code>.
 */
export function parseCode(raw: string): ParsedCode | null {
  const input = raw.trim()
  if (!input) return null
  let name: string | undefined
  const stripped = input.replace(/^(?:frameline:\/\/|https?:\/\/(?:www\.)?[^/?#]+)/i, '')
  const personal = parseGuestLinkPath(stripped.startsWith('/') ? stripped : `/${stripped}`)
  if (personal) return { kind: 'link', linkKind: personal.kind, code: personal.code }
  const [path = '', q = ''] = stripped.split('#')[0]!.split('?')
  // RN's URLSearchParams polyfill lacks get(); parse by hand.
  for (const pair of q.split('&')) {
    const [k, v] = pair.split('=')
    if ((k === 'n' || k === 'name') && v) { try { name = decodeURIComponent(v.replace(/\+/g, ' ')) } catch { name = v } }
  }
  const parts = path.split('/').filter(Boolean)
  if (parts[0]?.toLowerCase() === 'f' && parts[1]) return { kind: 'studio', code: parts[1].toUpperCase() }
  if (parts[0]?.toLowerCase() === 'e' && parts[1]) return { kind: 'event', code: parts[1].toUpperCase(), name }
  const token = (parts[0] ?? path).toUpperCase().replace(/\s+/g, '')
  if (/^FA-[A-Z0-9]{4,}$/.test(token)) return { kind: 'studio', code: token }
  if (/^[0-9A-F]{7}$/.test(token)) return { kind: 'event', code: token, name }
  return null
}

/** The in-app route for a parsed code. */
export function routeFor(p: ParsedCode): string {
  if (p.kind === 'studio') return `/studio/${p.code}`
  if (p.kind === 'link') return `/${p.linkKind}/${p.code}`
  return `/e/${p.code}${p.name ? `?n=${encodeURIComponent(p.name)}` : ''}`
}
