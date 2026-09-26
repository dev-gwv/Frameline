import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { API_URL, queryClient, useHttpApi } from './api'

/**
 * Session for the admin app, with one interface for both data modes:
 * - Sample data (no VITE_API_URL): codes are checked locally (demo code 123456).
 * - Real API: email codes, passwords and Google go through /v1/auth; tokens refresh automatically.
 * Screens call requestCode → verifyCode (or signInWithPassword) and never touch tokens.
 */
export interface SessionUser { id: string; name: string; email: string; role: 'owner' | 'editor' | 'uploader' }
export interface VerifyResult { user: SessionUser; isNewUser: boolean }

interface AuthCtx {
  user: SessionUser | null
  /** True while the stored session is being checked on start-up (real API only). */
  loading: boolean
  mode: 'demo' | 'api'
  requestCode(email: string): Promise<{ resendAfter: number; devCode?: string }>
  verifyCode(email: string, code: string, extra?: { name?: string; studioName?: string }): Promise<VerifyResult>
  signInWithPassword(email: string, password: string): Promise<VerifyResult>
  setPassword(newPassword: string, currentPassword?: string): Promise<void>
  /** Forgot password: after requestCode(email), set a new password with the emailed code. Signs you in. */
  resetPassword(email: string, code: string, newPassword: string): Promise<VerifyResult>
  googleUrl(redirectPath?: string): string | null
  /** Low-level: set the session directly (demo flows such as Google in sample mode). */
  signIn(user: SessionUser): void
  signOut(opts?: { allDevices?: boolean }): Promise<void>
}

const KEY = 'frameline.session'
const SIGNED_OUT = 'signed-out'
export const DEMO_USER: SessionUser = { id: 'u1', name: 'Aarav Mehta', email: 'aarav@northlight.in', role: 'owner' }
export const DEMO_CODE = '123456'
const Ctx = createContext<AuthCtx | null>(null)

function readSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === SIGNED_OUT) return null
    if (raw) return JSON.parse(raw) as SessionUser
    // In local development with sample data, start signed in so every screen is reachable.
    return import.meta.env.DEV && !API_URL ? DEMO_USER : null
  } catch { return null }
}
const writeSession = (u: SessionUser | null) => { try { localStorage.setItem(KEY, u ? JSON.stringify(u) : SIGNED_OUT) } catch { /* ignore */ } }
const nameFromEmail = (email: string) => email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function AuthProvider({ children }: { children: ReactNode }) {
  const http = useHttpApi()
  const [user, setUser] = useState<SessionUser | null>(readSession)
  const [loading, setLoading] = useState(!!http)

  const set = useCallback((u: SessionUser | null) => { setUser(u); writeSession(u) }, [])

  // Real API: confirm the stored tokens still work and load the membership role.
  const loadMe = useCallback(async (): Promise<SessionUser | null> => {
    if (!http) return null
    const me = await http.auth.me()
    const m = me.memberships[0]
    return { id: me.user.id, name: me.user.name || nameFromEmail(me.user.email), email: me.user.email, role: m?.role ?? 'owner' }
  }, [http])

  useEffect(() => {
    if (!http) return
    let cancelled = false
    ;(async () => {
      try {
        if (location.pathname === '/auth/callback') await http.auth.acceptOAuthFragment(location.hash)
        const signedIn = await http.auth.isSignedIn()
        const u = signedIn ? await loadMe() : null
        if (!cancelled) set(u)
      } catch {
        if (!cancelled) set(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [http, loadMe, set])

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    mode: http ? 'api' : 'demo',
    async requestCode(email) {
      if (http) { const r = await http.auth.requestOtp(email); return { resendAfter: r.resendAfter, devCode: r.devCode } }
      await new Promise((r) => setTimeout(r, 350))
      return { resendAfter: 30, devCode: import.meta.env.DEV ? DEMO_CODE : undefined }
    },
    async verifyCode(email, code, extra) {
      if (http) {
        const s = await http.auth.verifyOtp(email, code, extra)
        const u = (await loadMe())!
        set(u); queryClient.clear()
        return { user: u, isNewUser: s.isNewUser }
      }
      await new Promise((r) => setTimeout(r, 350))
      if (code !== DEMO_CODE) throw new Error('That code didn’t match. Check the email and try again.')
      const isDemo = email.trim().toLowerCase() === DEMO_USER.email
      const u = isDemo ? DEMO_USER : { id: 'u_' + email, name: extra?.name ?? nameFromEmail(email), email, role: 'owner' as const }
      set(u)
      return { user: u, isNewUser: !isDemo }
    },
    async signInWithPassword(email, password) {
      if (http) {
        const s = await http.auth.loginWithPassword(email, password)
        const u = (await loadMe())!
        set(u); queryClient.clear()
        return { user: u, isNewUser: s.isNewUser }
      }
      if (password.length < 6) throw new Error('Passwords have at least 6 characters.')
      const isDemo = email.trim().toLowerCase() === DEMO_USER.email
      const u = isDemo ? DEMO_USER : { id: 'u_' + email, name: nameFromEmail(email), email, role: 'owner' as const }
      set(u)
      return { user: u, isNewUser: !isDemo }
    },
    async setPassword(newPassword, currentPassword) {
      if (http) return http.auth.setPassword(newPassword, currentPassword)
      if (newPassword.length < 8) throw new Error('Use at least 8 characters.')
    },
    async resetPassword(email, code, newPassword) {
      if (http) {
        await http.auth.resetPassword(email, code, newPassword)
        const u = (await loadMe())!
        set(u); queryClient.clear()
        return { user: u, isNewUser: false }
      }
      if (code !== DEMO_CODE) throw new Error('That code didn’t match. Check the email and try again.')
      if (newPassword.length < 8) throw new Error('Use at least 8 characters.')
      const isDemo = email.trim().toLowerCase() === DEMO_USER.email
      const u = isDemo ? DEMO_USER : { id: 'u_' + email, name: nameFromEmail(email), email, role: 'owner' as const }
      set(u)
      return { user: u, isNewUser: false }
    },
    googleUrl(redirectPath) { return http ? http.auth.googleStartUrl(redirectPath) : null },
    signIn: set,
    async signOut(opts) {
      try { if (http) await http.auth.logout(opts) } finally {
        if (!http) writeSession(null)
        set(null); queryClient.clear()
      }
    },
  }), [user, loading, http, loadMe, set])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>')
  return c
}

/** Redirects to /login (remembering where the user was going) when signed out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid h-full place-items-center text-[13px] text-ink-3" aria-busy="true">Checking your session…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
