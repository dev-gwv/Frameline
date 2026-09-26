/** Small Web Crypto helpers (Workers-native, no Node APIs). */

const enc = new TextEncoder()

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)))
}

const hmacKeys = new Map<string, Promise<CryptoKey>>()
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacKeys.get(secret)
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
    hmacKeys.set(secret, k)
  }
  return k
}

export async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)))
}

export async function hmacVerify(secret: string, data: string, signature: Uint8Array<ArrayBuffer>): Promise<boolean> {
  return crypto.subtle.verify('HMAC', await hmacKey(secret), signature, enc.encode(data))
}

/** Peppered SHA-256 used for OTP codes and refresh tokens (high-entropy or short-lived secrets). */
export async function pepperedHash(pepper: string, value: string): Promise<string> {
  return toHex(await hmacSha256(pepper, value))
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** Uniform random integer in [0, max) without modulo bias. */
export function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

export function randomDigits(n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += String(randomInt(10))
  return s
}

/** Constant-time string comparison (both inputs are hashes of equal length in practice). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

// ── Passwords: PBKDF2-SHA256 ─────────────────────────────────────────────────
// Workers caps PBKDF2 at 100,000 iterations; we use the maximum.
export const PBKDF2_ITERATIONS = 100_000

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

/** Returns `pbkdf2-sha256$<iterations>$<salt>$<hash>` (base64url parts). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split('$')
  if (alg !== 'pbkdf2-sha256' || !iter || !salt || !hash) return false
  const derived = await pbkdf2(password, fromBase64Url(salt), Number(iter))
  return timingSafeEqual(toBase64Url(derived), hash)
}
