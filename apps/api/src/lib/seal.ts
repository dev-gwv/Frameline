import { fromBase64Url, toBase64Url } from './crypto'

/** AES-256-GCM sealing for secrets kept in D1 (Drive refresh tokens). Key: 32 bytes, base64 or base64url. */

const keys = new Map<string, Promise<CryptoKey>>()
function aesKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret)
  if (!k) {
    const raw = fromBase64Url(secret.trim().replace(/=+$/, ''))
    if (raw.length !== 32) throw new Error('The sealing key must be 32 bytes (base64).')
    k = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    keys.set(secret, k)
  }
  return k
}

/** `v1.<iv>.<ciphertext>`, base64url. */
export async function seal(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(plain))
  return `v1.${toBase64Url(iv)}.${toBase64Url(ct)}`
}

export async function unseal(secret: string, sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split('.')
  if (v !== 'v1' || !iv || !ct) throw new Error('Not a sealed value')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await aesKey(secret), fromBase64Url(ct))
  return new TextDecoder().decode(plain)
}
