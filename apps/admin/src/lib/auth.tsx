import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

/**
 * Session state for the admin app. In mock mode the "session" is a local flag;
 * with VITE_API_URL the HTTP client stores the access token and refreshes it.
 */
export interface SessionUser { id: string; name: string; email: string; role: 'owner' | 'editor' | 'uploader' }
interface AuthCtx {
  user: SessionUser | null
  signIn: (user: SessionUser) => void
  signOut: () => void
}
const KEY = 'frameline.session'
const Ctx = createContext<AuthCtx | null>(null)

const SIGNED_OUT = 'signed-out'
export const DEMO_USER: SessionUser = { id: 'u1', name: 'Aarav Mehta', email: 'aarav@northlight.in', role: 'owner' }

function readSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === SIGNED_OUT) return null
    if (raw) return JSON.parse(raw) as SessionUser
    // In local development with sample data, start signed in so every screen is reachable.
    return import.meta.env.DEV && !import.meta.env.VITE_API_URL ? DEMO_USER : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readSession)
  const signIn = useCallback((u: SessionUser) => { setUser(u); try { localStorage.setItem(KEY, JSON.stringify(u)) } catch { /* ignore */ } }, [])
  const signOut = useCallback(() => { setUser(null); try { localStorage.setItem(KEY, SIGNED_OUT) } catch { /* ignore */ } }, [])
  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>')
  return c
}

/** Redirects to /login (remembering where the user was going) when signed out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
