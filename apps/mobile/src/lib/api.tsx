import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
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

/** Guest gallery tokens (12 h, per event short id) in expo-sqlite kv-store: the client needs sync reads. */
function kvGuestTokenStore(prefix = 'frameline.guest'): GuestTokenStore {
  return {
    get: (k) => kv.get(`${prefix}.${k.toUpperCase()}`),
    set: (k, v) => kv.set(`${prefix}.${k.toUpperCase()}`, v),
    clear: (k) => kv.remove(`${prefix}.${k.toUpperCase()}`),
  }
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
      tokens: secureTokenStore(),
      guestTokens: kvGuestTokenStore(),
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
  misc: ['films', 'cameras', 'qrs', 'broadcasts', 'tickets', 'team', 'watermark', 'website', 'enquiries', 'ledger', 'orders'],
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
