/**
 * Personal guest links (format documented in apps/gallery/README.md).
 *
 *   /s/<token>   album links and face ("My photos") links
 *   /v/<token>   VIP links (only /v/ honours the vip flags)
 *
 * <token> = base64url(UTF-8 JSON of GuestLinkPayload), no "=" padding. Keys are short to keep links short.
 * These unsigned tokens are what the mock API returns; the real API returns HMAC-signed short codes
 * (`createGuestLink`) that the gallery resolves with `resolveGuestLink(code)`.
 */
export interface GuestLinkPayload {
  /** Format version. */
  v?: 1
  /** Event shortId, e.g. "6402F9F". Required. */
  e: string
  /** Welcome name, e.g. "Dadi ji". */
  n?: string
  /** Album id to land on. */
  album?: string
  /** Start on "My photos" (face link): skips the selfie. */
  me?: boolean
  /** Person id from face recognition to match to (face link built from an uploaded photo). */
  p?: string
  /** VIP flags (only honoured on /v/ links). */
  vip?: { skipLogin?: boolean; pin?: boolean; all?: boolean }
}

export type GuestLinkKind = 's' | 'v'

function toBase64Url(s: string) {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(t: string) {
  const b64 = t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Normalises a payload: upper-case event code, drops empty/false keys, trims the name. */
export function cleanGuestLinkPayload(payload: GuestLinkPayload): GuestLinkPayload {
  const clean: GuestLinkPayload = { e: payload.e.toUpperCase() }
  if (payload.n) clean.n = payload.n.slice(0, 40)
  if (payload.album) clean.album = payload.album
  if (payload.me) clean.me = true
  if (payload.p) clean.p = payload.p
  if (payload.vip && (payload.vip.skipLogin || payload.vip.pin || payload.vip.all)) {
    clean.vip = {}
    if (payload.vip.skipLogin) clean.vip.skipLogin = true
    if (payload.vip.pin) clean.vip.pin = true
    if (payload.vip.all) clean.vip.all = true
  }
  return clean
}

export const guestLinkKind = (payload: GuestLinkPayload): GuestLinkKind => (cleanGuestLinkPayload(payload).vip ? 'v' : 's')

/** The unsigned token for a payload (without the /s/ or /v/ prefix). */
export function encodeGuestToken(payload: GuestLinkPayload): string {
  return toBase64Url(JSON.stringify(cleanGuestLinkPayload(payload)))
}

/** Builds the path for a personal link. VIP payloads produce /v/, everything else /s/. */
export function encodeGuestLink(payload: GuestLinkPayload, origin = ''): string {
  const clean = cleanGuestLinkPayload(payload)
  return `${origin}/${clean.vip ? 'v' : 's'}/${toBase64Url(JSON.stringify(clean))}`
}

/** Returns null for anything that isn't a well-formed token. */
export function decodeGuestLink(token: string): GuestLinkPayload | null {
  try {
    const data = JSON.parse(fromBase64Url(token)) as GuestLinkPayload
    if (!data || typeof data.e !== 'string' || !/^[0-9A-Za-z]{4,12}$/.test(data.e)) return null
    return {
      e: data.e.toUpperCase(),
      n: typeof data.n === 'string' ? data.n.slice(0, 40) : undefined,
      album: typeof data.album === 'string' ? data.album : undefined,
      me: data.me === true,
      p: typeof data.p === 'string' ? data.p : undefined,
      vip: data.vip && typeof data.vip === 'object'
        ? { skipLogin: data.vip.skipLogin === true, pin: data.vip.pin === true, all: data.vip.all === true }
        : undefined,
    }
  } catch {
    return null
  }
}

/** Splits "/s/<code>" or "https://…/v/<code>" into kind + code. */
export function parseGuestLinkPath(pathOrUrl: string): { kind: GuestLinkKind; code: string } | null {
  const m = /\/(s|v)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(pathOrUrl)
  return m ? { kind: m[1] as GuestLinkKind, code: m[2] } : null
}
