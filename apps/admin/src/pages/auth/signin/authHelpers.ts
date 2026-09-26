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
            ? `That code doesn’t match. Check the latest email and try again · ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`
            : err.detail || 'That code doesn’t match. Check the latest email and try again.',
        }
      case 'otp_expired':
        return { message: 'That code has expired. Request a new code and use the latest email.', locked: true }
      case 'otp_locked':
        return { message: 'Too many wrong codes. For your safety this code no longer works. Request a new code, or use your password.', locked: true }
      case 'otp_cooldown':
      case 'rate_limited': {
        const s = err.retryAfter
        return { message: s ? `Too many tries. Wait ${s} second${s === 1 ? '' : 's'}, then try again.` : 'Too many tries. Wait a moment, then try again.', waitSeconds: s }
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
