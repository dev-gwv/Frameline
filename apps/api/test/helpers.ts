import { SELF, env } from 'cloudflare:test'
import { expect } from 'vitest'
import { signAccessToken } from '../src/services/sessions'

export const BASE = 'https://api.test'

let ipCounter = Math.floor(Math.random() * 200)
/** A fresh client IP so per-IP rate limits don't leak between tests. */
export const freshIp = () => `10.${Math.floor(Math.random() * 250)}.${(ipCounter++ % 250) + 1}.${Math.floor(Math.random() * 250) + 1}`

export interface CallOpts { token?: string; body?: unknown; headers?: Record<string, string>; ip?: string; method?: string }

export async function call(path: string, opts: CallOpts = {}) {
  const headers: Record<string, string> = { 'cf-connecting-ip': opts.ip ?? freshIp(), ...(opts.headers ?? {}) }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { res, status: res.status, json, headers: res.headers }
}

export const SEED = {
  owner: { id: 'u1', email: 'aarav@northlight.in', name: 'Aarav Mehta' },
  editor: { id: 'u2', email: 'meera@northlight.in', name: 'Meera Iyer' },
  uploader: { id: 'u3', email: 'kunal.shah@gmail.com', name: 'Kunal Shah' },
} as const

/** Mints an access token for a seeded user directly (auth flows themselves are covered in auth.test.ts). */
export function tokenFor(who: keyof typeof SEED) {
  return signAccessToken(env.JWT_SECRET, SEED[who], `fam_test_${who}`)
}

export function expectProblem(r: { status: number; json: any; headers: Headers }, status: number, code?: string) {
  expect(r.status).toBe(status)
  expect(r.headers.get('content-type')).toContain('application/problem+json')
  expect(r.json).toMatchObject({ status, type: expect.stringContaining('/problems/'), title: expect.any(String), detail: expect.any(String), requestId: expect.any(String) })
  if (code) expect(r.json.code).toBe(code)
  expect(r.json.stack).toBeUndefined()
}

export const uniqueEmail = (tag: string) => `${tag}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`
