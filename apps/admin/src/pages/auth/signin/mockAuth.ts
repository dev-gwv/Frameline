import { useCallback, useEffect, useState } from 'react'

/*
 * Simulated email-code auth for mock mode. The real backend (Better Auth email OTP +
 * password + Google OAuth) replaces these helpers; the screens only need the same outcomes.
 */
export const DEMO_EMAIL = 'aarav@northlight.in'
export const DEMO_NAME = 'Aarav Mehta'
export const DEMO_CODE = '123456'
export const MAX_ATTEMPTS = 5
export const RESEND_SECONDS = 30

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
export const isDemo = (email: string) => email.trim().toLowerCase() === DEMO_EMAIL

/** "priya.rao@gmail.com" → "Priya Rao" */
export const nameFromEmail = (email: string) =>
  email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'New studio'

export const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms))

/** Seconds-left countdown for "Resend code". */
export function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  const start = useCallback(() => setLeft(RESEND_SECONDS), [])
  return { left, start }
}

/** Wrong-code tracking with a lockout after MAX_ATTEMPTS. */
export function useCodeCheck() {
  const [attempts, setAttempts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const locked = attempts >= MAX_ATTEMPTS
  const check = (code: string) => {
    if (locked) return false
    if (code === DEMO_CODE) { setError(null); return true }
    const used = attempts + 1
    setAttempts(used)
    const left = MAX_ATTEMPTS - used
    setError(left > 0
      ? `That code doesn’t match. Check the latest email and try again · ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
      : 'Too many wrong codes. For your safety, code sign-in is paused for 15 minutes. Use your password or try again later.')
    return false
  }
  const reset = () => { setAttempts(0); setError(null) }
  return { attempts, error, locked, check, reset, clearError: () => setError(null) }
}
