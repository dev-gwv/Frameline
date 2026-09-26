import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import {
  ApiError, createHttpApi, createMockApi,
  type AuthTokens, type ChangeTopic, type FramelineApi, type FramelineHttpApi, type GuestTokenStore, type TokenStore,
} from '@frameline/shared'
import { actions, local } from './local'
import { kv } from './storage'

const STORAGE_KEY = 'frameline.mock.v1'

/** Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:8787) to talk to apps/api; leave it unset for the offline mock. */
const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || undefined
export const API_MODE: 'http' | 'mock' = API_URL ? 'http' : 'mock'

/* ---------------- token stores ---------------- */

/**
 * Studio session tokens in the Keychain / Android Keystore via expo-secure-store. Access and refresh tokens are
 * stored under separate keys (some iOS versions reject values over ~2 KB) and cached in memory after the first read.
 */
const TK = { access: 'frameline.auth.access', refresh: 'frameline.auth.refresh', expires: 'frameline.auth.expiresAt' }
function secureTokenStore(): TokenStore {
  let cache: AuthTokens | null | undefined
  return {
    async get() {
      if (cache !== undefined) return cache
      try {
        const [accessToken, refreshToken, expires] = await Promise.all([SecureStore.getItemAsync(TK.access), SecureStore.getItemAsync(TK.refresh), SecureStore.getItemAsync(TK.expires)])
        cache = accessToken && refreshToken ? { accessToken, refreshToken, expiresAt: expires ? Number(expires) : undefined } : null
      } catch {
        cache = null
      }
      return cache
    },
    async set(t) {
      cache = t
      try {
        await Promise.all([
          SecureStore.setItemAsync(TK.access, t.accessToken),
          SecureStore.setItemAsync(TK.refresh, t.refreshToken),
          t.expiresAt ? SecureStore.setItemAsync(TK.expires, String(t.expiresAt)) : SecureStore.deleteItemAsync(TK.expires),
        ])
      } catch { /* keychain unavailable: the session lasts until the app closes */ }
    },
    async clear() {
      cache = null
      try { await Promise.all(Object.values(TK).map((k) => SecureStore.deleteItemAsync(k))) } catch { /* nothing stored */ }
    },
  }
}

const secureTokens = secureTokenStore()

/**
 * Google sign-in for the native app (apps/api README "Auth extras"): ask the API for the Google URL with
 * `redirect=frameline://sign-in&mode=json`, open it in an auth session, and store the tokens from the redirect
 * fragment with auth.acceptOAuthFragment. Returns false when the person cancelled.
 */
export const GOOGLE_REDIRECT = 'frameline://sign-in'
export async function signInWithGoogle(http: FramelineHttpApi): Promise<boolean> {
  const { authorizationUrl } = await http.request<{ authorizationUrl: string }>('GET', '/v1/auth/google/start', { query: { redirect: GOOGLE_REDIRECT, mode: 'json' }, auth: false })
  const res = await WebBrowser.openAuthSessionAsync(authorizationUrl, GOOGLE_REDIRECT)
  if (res.type !== 'success') return false
  const fragment = res.url.includes('#') ? res.url.slice(res.url.indexOf('#') + 1) : ''
  let ok = false
  try {
    ok = await http.auth.acceptOAuthFragment(fragment)
  } catch {
    // Some URLSearchParams polyfills lack get(): read the fragment by hand and store the tokens directly.
    const p: Record<string, string> = {}
    for (const pair of fragment.split('&')) { const [k, v = ''] = pair.split('='); if (k) p[k] = decodeURIComponent(v) }
    if (p.access_token && p.refresh_token) {
      await secureTokens.set({ accessToken: p.access_token, refreshToken: p.refresh_token, expiresAt: Date.now() + Number(p.expires_in ?? 900) * 1000 })
      ok = true
    }
  }
  if (!ok) {
    const m = /[#&]error=([^&]+)/.exec(res.url)
    throw new ApiError({ status: 401, code: 'oauth_failed', detail: m ? decodeURIComponent(m[1]!.replace(/\+/g, ' ')) : 'Google didn’t sign you in. Try again or use an email code.' })
  }
  return true
}

/** Guest gallery tokens (12 h, per event short id) in expo-sqlite kv-store: the client needs sync reads. */
function kvGuestTokenStore(prefix = 'frameline.guest'): GuestTokenStore {
  return {
    get: (k) => kv.get(`${prefix}.${k.toUpperCase()}`),
    set: (k, v) => kv.set(`${prefix}.${k.toUpperCase()}`, v),
    clear: (k) => kv.remove(`${prefix}.${k.toUpperCase()}`),
  }
}

/**
 * Stable per-install id sent as X-Guest-Device on guest calls (follows, "my galleries" and the "Download all"
 * counter are keyed by it). Random v4-style id kept in SecureStore; falls back to kv-store if the keychain fails.
 */
const DEVICE_KEY = 'frameline.guest.device'
let deviceId: string | undefined
export function guestDeviceId(): string {
  if (deviceId) return deviceId
  try { deviceId = SecureStore.getItem(DEVICE_KEY) ?? undefined } catch { deviceId = kv.get(DEVICE_KEY) ?? undefined }
  if (!deviceId) {
    const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    deviceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex.slice(17, 20)}-${hex.slice(20)}`
    try { SecureStore.setItem(DEVICE_KEY, deviceId) } catch { kv.set(DEVICE_KEY, deviceId) }
  }
  return deviceId
}

/* ---------------- clients ---------------- */

export interface ApiClients {
  api: FramelineApi
  /** The HTTP client (with `auth.*`) when EXPO_PUBLIC_API_URL is set; null in mock mode. */
  http: FramelineHttpApi | null
}

export function createApi(): ApiClients {
  if (API_URL) {
    const http = createHttpApi({
      baseUrl: API_URL,
      tokens: secureTokens,
      guestTokens: kvGuestTokenStore(),
      guestDeviceId,
      WebSocket: globalThis.WebSocket,
      // Refresh failed: the photographer has to sign in again. Guests never have a studio session, so this is a no-op for them.
      onUnauthorized: () => { if (local.get().studioSession) { actions.signOut(); queryClient.clear() } },
    })
    return { api: http, http }
  }
  // Offline mock persisted to expo-sqlite kv-store; it throws ApiError just like the HTTP client.
  const api = createMockApi({ load: () => kv.get(STORAGE_KEY), save: (d) => kv.set(STORAGE_KEY, d) })
  return { api, http: null }
}

/** Clears mock data; the next launch starts from the sample seed. */
export function resetDemoData() {
  kv.remove(STORAGE_KEY)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the API on 4xx (PIN required, not found…); retry network blips and 5xx once.
      retry: (count, e) => count < 1 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
    },
    mutations: { retry: 0 },
  },
})

/** Which query-key roots to refresh when the backend announces a change (same pattern as apps/admin). */
const TOPIC_KEYS: Record<ChangeTopic, string[]> = {
  events: ['events', 'event', 'public-event'],
  albums: ['albums', 'public-event'],
  photos: ['photos', 'photo', 'public-photos', 'my-photos', 'highlights'],
  studio: ['studio', 'studio-profile'],
  usage: ['usage'],
  guests: ['guests', 'access-requests'],
  activity: ['activity'],
  misc: ['films', 'cameras', 'qrs', 'broadcasts', 'tickets', 'team', 'watermark', 'public-watermark', 'website', 'enquiries', 'ledger', 'orders'],
}

function LiveUpdates({ api }: { api: FramelineApi }) {
  const qc = useQueryClient()
  useEffect(() => api.subscribe((topic) => {
    for (const key of TOPIC_KEYS[topic]) qc.invalidateQueries({ queryKey: [key] })
  }), [api, qc])
  // Refetch stale queries when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'))
    return () => sub.remove()
  }, [])
  return null
}

const ApiCtx = createContext<(ApiClients & { sessionChecked: boolean }) | null>(null)

/**
 * On launch in API mode: drop the local photographer session if the keychain has no tokens, otherwise confirm it with
 * `auth.me()` (a dead refresh token ends in onUnauthorized → signed out).
 */
function useSessionCheck(http: FramelineHttpApi | null) {
  const [checked, setChecked] = useState(!http)
  useEffect(() => {
    if (!http) return
    let alive = true
    ;(async () => {
      try {
        const signedIn = await http.auth.isSignedIn()
        if (!signedIn) { if (local.get().studioSession) actions.signOut(); return }
        const me = await http.auth.me()
        if (alive) actions.setSession({ email: me.user.email, name: me.user.name, studioName: me.memberships[0]?.studioName })
      } catch (e) {
        // Offline: keep the stored session; the next request refreshes or signs out.
        if (e instanceof ApiError && e.status === 401) actions.signOut()
      } finally {
        if (alive) setChecked(true)
      }
    })()
    return () => { alive = false }
  }, [http])
  return checked
}

export function ApiProvider({ children, api: given }: { children: ReactNode; api?: FramelineApi }) {
  const clients = useMemo<ApiClients>(() => (given ? { api: given, http: null } : createApi()), [given])
  const sessionChecked = useSessionCheck(clients.http)
  const value = useMemo(() => ({ ...clients, sessionChecked }), [clients, sessionChecked])
  return (
    <ApiCtx.Provider value={value}>
      <QueryClientProvider client={queryClient}>
        <LiveUpdates api={clients.api} />
        {children}
      </QueryClientProvider>
    </ApiCtx.Provider>
  )
}

function useClients() {
  const ctx = useContext(ApiCtx)
  if (!ctx) throw new Error('useApi must be used inside <ApiProvider>')
  return ctx
}

export const useApi = () => useClients().api
/** HTTP client with `auth.*`, or null in mock mode. */
export const useHttp = () => useClients().http
/** False until the launch session check has finished (always true in mock mode). */
export const useSessionChecked = () => useClients().sessionChecked
