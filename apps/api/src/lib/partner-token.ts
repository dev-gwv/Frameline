import { fromBase64Url, hmacVerify } from './crypto'

/**
 * Tokens a partner product signs for us (Studio AutoPilot first), HS256 with a secret only the two servers
 * hold. Separate from jwt.ts on purpose: those are tokens WE issue (issuer 'frameline'); these are tokens we
 * only ever check, with a different secret, issuer and audience, so neither kind can be passed off as the other.
 *
 * A partner token is short-lived (at most 5 minutes from iat to exp) and single-use: its `jti` is spent in KV,
 * so a sign-in link copied out of a browser history or a log cannot be replayed.
 */
export interface PartnerClaims {
  iss: string
  aud: 'frameline'
  /** The partner's user id. */
  sub: string
  /** Unique per token; spent on first use. */
  jti: string
  iat: number
  exp: number
  /** 'sso' signs a person into the admin app; 'api' calls an integration endpoint server to server. */
  purpose: 'sso' | 'api'
  /** The partner's company (studio) id and name. */
  cid: string
  cname: string
  /** Who the person is there. */
  name: string
  email: string
  /** True only when the partner has confirmed the person owns `email`. */
  email_verified: boolean
  /** owner: runs the studio (and Frameline's add-on billing); editor: everyone else allowed in. */
  role: 'owner' | 'editor'
  /** SSO only: an admin path to open after sign-in, e.g. /events/ev_x. */
  to?: string
}

export type PartnerTokenError = 'malformed' | 'bad_signature' | 'expired' | 'wrong_audience' | 'too_long_lived' | 'wrong_purpose'

const MAX_LIFETIME_SEC = 300
const dec = new TextDecoder()

export async function verifyPartnerToken(
  secret: string,
  token: string,
  expected: { issuer: string; purpose: PartnerClaims['purpose'] },
): Promise<{ ok: true; claims: PartnerClaims } | { ok: false; error: PartnerTokenError }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, error: 'malformed' }
  const [head, body, sig] = parts
  let header: { alg?: string }
  let claims: Partial<PartnerClaims>
  let sigBytes: Uint8Array<ArrayBuffer>
  try {
    header = JSON.parse(dec.decode(fromBase64Url(head)))
    claims = JSON.parse(dec.decode(fromBase64Url(body)))
    sigBytes = fromBase64Url(sig)
  } catch {
    return { ok: false, error: 'malformed' }
  }
  if (header.alg !== 'HS256') return { ok: false, error: 'malformed' }
  if (!(await hmacVerify(secret, `${head}.${body}`, sigBytes))) return { ok: false, error: 'bad_signature' }
  if (claims.iss !== expected.issuer) return { ok: false, error: 'bad_signature' }
  if (claims.aud !== 'frameline') return { ok: false, error: 'wrong_audience' }
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || typeof claims.iat !== 'number' || claims.exp + 30 < now) return { ok: false, error: 'expired' }
  if (claims.exp - claims.iat > MAX_LIFETIME_SEC) return { ok: false, error: 'too_long_lived' }
  if (claims.purpose !== expected.purpose) return { ok: false, error: 'wrong_purpose' }
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!str(claims.sub, 128) || !str(claims.jti, 128) || !str(claims.cid, 128) || !str(claims.cname, 160) || typeof claims.email !== 'string' || claims.email.length > 254) {
    return { ok: false, error: 'malformed' }
  }
  if (claims.role !== 'owner' && claims.role !== 'editor') return { ok: false, error: 'malformed' }
  return {
    ok: true,
    claims: {
      ...(claims as PartnerClaims),
      name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : '',
      email_verified: claims.email_verified === true,
    },
  }
}
