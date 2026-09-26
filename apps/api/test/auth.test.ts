import { describe, expect, it } from 'vitest'
import { call, expectProblem, freshIp, uniqueEmail } from './helpers'

async function requestCode(email: string, ip = freshIp()) {
  const r = await call('/v1/auth/otp/request', { body: { email }, ip })
  expect(r.status).toBe(202)
  expect(r.json.devCode).toMatch(/^\d{6}$/)
  return r.json.devCode as string
}

const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')

describe('email OTP', () => {
  it('signs a new user in, creates their studio, and /v1/me works', async () => {
    const email = uniqueEmail('new')
    const code = await requestCode(email)
    const v = await call('/v1/auth/otp/verify', { body: { email, code, name: 'Asha', studioName: 'Asha Photo' } })
    expect(v.status).toBe(200)
    expect(v.json).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, isNewUser: true, user: { email, name: 'Asha', hasPassword: false } })
    expect(v.json.accessToken.split('.')).toHaveLength(3)

    const me = await call('/v1/me', { token: v.json.accessToken })
    expect(me.status).toBe(200)
    expect(me.json.memberships).toEqual([expect.objectContaining({ role: 'owner', studioName: 'Asha Photo' })])

    const studio = await call('/v1/studio', { token: v.json.accessToken })
    expect(studio.json.name).toBe('Asha Photo')

    // A code is single-use.
    expectProblem(await call('/v1/auth/otp/verify', { body: { email, code } }), 401, 'otp_invalid')
  })

  it('stores only a hash of the code', async () => {
    const { env } = await import('cloudflare:test')
    const email = uniqueEmail('hash')
    const code = await requestCode(email)
    const row = await env.DB.prepare('SELECT code_hash FROM otp_codes WHERE email = ? ORDER BY created_at DESC').bind(email).first<{ code_hash: string }>()
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row!.code_hash).not.toContain(code)
  })

  it('locks the code after 5 wrong attempts', async () => {
    const email = uniqueEmail('lock')
    const code = await requestCode(email)
    for (let i = 1; i <= 4; i++) {
      const r = await call('/v1/auth/otp/verify', { body: { email, code: wrongCode(code) } })
      expectProblem(r, 401, 'otp_invalid')
      expect(r.json.attemptsRemaining).toBe(5 - i)
    }
    expectProblem(await call('/v1/auth/otp/verify', { body: { email, code: wrongCode(code) } }), 403, 'otp_locked')
    // Even the right code no longer works.
    const after = await call('/v1/auth/otp/verify', { body: { email, code } })
    expect(after.status).toBe(401)
  })

  it('enforces the 30s resend cooldown', async () => {
    const email = uniqueEmail('cool')
    await requestCode(email)
    const again = await call('/v1/auth/otp/request', { body: { email } })
    expectProblem(again, 429, 'otp_cooldown')
    expect(Number(again.headers.get('retry-after'))).toBeGreaterThan(0)
  })
})

describe('refresh tokens', () => {
  async function signIn() {
    const email = uniqueEmail('rt')
    const code = await requestCode(email)
    const v = await call('/v1/auth/otp/verify', { body: { email, code } })
    expect(v.status).toBe(200)
    return v.json as { accessToken: string; refreshToken: string }
  }

  it('rotates, and reuse of a rotated token revokes the whole family', async () => {
    const first = await signIn()
    const r1 = await call('/v1/auth/refresh', { body: { refreshToken: first.refreshToken } })
    expect(r1.status).toBe(200)
    expect(r1.json.refreshToken).not.toBe(first.refreshToken)
    expect((await call('/v1/me', { token: r1.json.accessToken })).status).toBe(200)

    // Replaying the old token = theft signal.
    expectProblem(await call('/v1/auth/refresh', { body: { refreshToken: first.refreshToken } }), 401, 'refresh_token_reused')
    // The legitimately rotated token is now revoked too.
    expectProblem(await call('/v1/auth/refresh', { body: { refreshToken: r1.json.refreshToken } }), 401, 'refresh_token_revoked')
  })

  it('logout revokes the refresh token', async () => {
    const s = await signIn()
    expect((await call('/v1/auth/logout', { body: { refreshToken: s.refreshToken } })).status).toBe(204)
    expectProblem(await call('/v1/auth/refresh', { body: { refreshToken: s.refreshToken } }), 401, 'refresh_token_revoked')
  })

  it('rejects garbage tokens', async () => {
    expectProblem(await call('/v1/auth/refresh', { body: { refreshToken: 'x'.repeat(43) } }), 401, 'invalid_refresh_token')
    expectProblem(await call('/v1/me', { token: 'not.a.jwt' }), 401, 'invalid_token')
    expectProblem(await call('/v1/me'), 401, 'missing_token')
  })
})

describe('password login', () => {
  it('sets a password and signs in with it', async () => {
    const email = uniqueEmail('pw')
    const code = await requestCode(email)
    const s = (await call('/v1/auth/otp/verify', { body: { email, code } })).json
    expect((await call('/v1/auth/password', { token: s.accessToken, body: { newPassword: 'correct horse battery' } })).status).toBe(204)
    const ok = await call('/v1/auth/password/login', { body: { email, password: 'correct horse battery' } })
    expect(ok.status).toBe(200)
    expect(ok.json.user.hasPassword).toBe(true)
    expectProblem(await call('/v1/auth/password/login', { body: { email, password: 'wrong password!!' } }), 401, 'invalid_credentials')
    // Changing it now requires the current password.
    expectProblem(await call('/v1/auth/password', { token: ok.json.accessToken, body: { newPassword: 'another long pass' } }), 401, 'invalid_current_password')
  })

  it('reports Google sign-in as not configured without secrets', async () => {
    expectProblem(await call('/v1/auth/google/start'), 501, 'not_configured')
  })
})
