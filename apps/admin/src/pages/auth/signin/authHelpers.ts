import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@frameline/shared'
import { errorMessage } from '../../../lib/api'

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

/** Seconds-left countdown for "Resend code" and rate-limit waits. */
export function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  const start = useCallback((seconds: number) => setLeft(Math.max(0, Math.ceil(seconds))), [])
  return { left, start }
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export interface AuthFailure {
  message: string
  /** The code can't be used any more: the person needs a new one. */
  locked?: boolean
  /** Seconds to wait before trying again (rate limits and resend cooldowns). */
  waitSeconds?: number
}

/** Turns an auth error (ApiError from the HTTP client or the mock) into an inline message. */
export function describeAuthError(err: unknown): AuthFailure {
  if (err instanceof ApiError) {
    const remaining = typeof err.problem.attemptsRemaining === 'number' ? err.problem.attemptsRemaining : undefined
    switch (err.code) {
      case 'invalid_code':
      case 'otp_invalid':
        if (remaining === 0) return { message: 'Too many wrong codes. Request a new code, or use your password.', locked: true }
        return {
          message: remaining !== undefined
            ? `That code doesn’t match. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`
            : err.detail || 'That code doesn’t match. Check the latest email and try again.',
        }
      case 'otp_expired':
        return { message: 'That code has expired. Request a new code and use the latest email.', locked: true }
      case 'otp_locked':
        return { message: 'Too many wrong codes. For your safety this code no longer works. Request a new code, or use your password.', locked: true }
      case 'otp_cooldown':
      case 'rate_limited': {
        return { message: 'Too many tries. For your safety, wait a moment before trying again.', waitSeconds: err.retryAfter ?? 60 }
      }
      case 'invalid_credentials':
        return { message: 'Email or password is wrong. Try again, or sign in with an email code.' }
      case 'invalid_current_password':
        return { message: 'This account already has a password. Sign in with an email code, then change it in Settings → Security.' }
    }
  }
  return { message: errorMessage(err) }
}

/** Where to go after signing in: only same-app paths, never back to /login. */
export function safeDestination(from: string | null | undefined) {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/login')) return '/'
  return from
}

/*
 * Sample data has no server to rate-limit code requests, so mimic the API here: the 4th code
 * requested within 5 minutes gets a 429 with a 42-second wait ("Try again in 0:42" on the button).
 */
const REQ_KEY = 'frameline.code-requests'
export function demoRateLimit() {
  const now = Date.now()
  let st: { times: number[]; until?: number } = { times: [] }
  try { st = JSON.parse(sessionStorage.getItem(REQ_KEY) ?? '{"times":[]}') } catch { /* ignore */ }
  const save = () => { try { sessionStorage.setItem(REQ_KEY, JSON.stringify(st)) } catch { /* ignore */ } }
  const limited = (retryAfter: number) => new ApiError({ status: 429, code: 'rate_limited', detail: 'Too many sign-in codes requested.', retryAfter })
  if (st.until && now < st.until) throw limited(Math.ceil((st.until - now) / 1000))
  st.times = (st.times ?? []).filter((t) => now - t < 5 * 60_000)
  if (st.times.length >= 3) { st = { times: [], until: now + 42_000 }; save(); throw limited(42) }
  st.times.push(now); st.until = undefined; save()
}
