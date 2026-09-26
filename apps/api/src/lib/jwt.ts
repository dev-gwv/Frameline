import { fromBase64Url, hmacSha256, hmacVerify, toBase64Url } from './crypto'

/** Minimal HS256 JWT (RFC 7519) using Web Crypto. */
export interface JwtClaims {
  sub: string
  aud: 'studio' | 'guest' | 'upload'
  iat: number
  exp: number
  iss: string
  jti?: string
  [claim: string]: unknown
}

const ISSUER = 'frameline'
const enc = new TextEncoder()
const dec = new TextDecoder()
const b64json = (v: unknown) => toBase64Url(enc.encode(JSON.stringify(v)))

export async function signJwt(secret: string, claims: { sub: string; aud: JwtClaims['aud']; [claim: string]: unknown }, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtClaims = { ...claims, iss: ISSUER, iat: now, exp: now + ttlSeconds }
  const head = b64json({ alg: 'HS256', typ: 'JWT' })
  const body = b64json(payload)
  const sig = toBase64Url(await hmacSha256(secret, `${head}.${body}`))
  return `${head}.${body}.${sig}`
}

export type JwtError = 'malformed' | 'bad_signature' | 'expired' | 'wrong_audience'

/** Verifies signature, expiry (30s leeway), issuer and audience. */
export async function verifyJwt(secret: string, token: string, audience: JwtClaims['aud']): Promise<{ ok: true; claims: JwtClaims } | { ok: false; error: JwtError }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, error: 'malformed' }
  const [head, body, sig] = parts
  let header: { alg?: string }
  let claims: JwtClaims
  try {
    header = JSON.parse(dec.decode(fromBase64Url(head)))
    claims = JSON.parse(dec.decode(fromBase64Url(body)))
  } catch {
    return { ok: false, error: 'malformed' }
  }
  if (header.alg !== 'HS256') return { ok: false, error: 'malformed' }
  let sigBytes: Uint8Array<ArrayBuffer>
  try { sigBytes = fromBase64Url(sig) } catch { return { ok: false, error: 'malformed' } }
  if (!(await hmacVerify(secret, `${head}.${body}`, sigBytes))) return { ok: false, error: 'bad_signature' }
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + 30 < now) return { ok: false, error: 'expired' }
  if (claims.iss !== ISSUER) return { ok: false, error: 'bad_signature' }
  if (claims.aud !== audience) return { ok: false, error: 'wrong_audience' }
  return { ok: true, claims }
}
