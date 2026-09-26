import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { ApiError, createHttpApi, createMockApi, storageTokenStore, type ChangeTopic, type FramelineApi, type FramelineHttpApi } from '@frameline/shared'

const STORAGE_KEY = 'frameline.mock.v1'
/** Set to the API origin (e.g. http://localhost:8787) to use the real backend instead of sample data. */
export const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined

export const tokenStore = storageTokenStore('frameline.tokens')

function mockApi(): FramelineApi {
  return createMockApi({
    load: () => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } },
    save: (d) => { try { localStorage.setItem(STORAGE_KEY, d) } catch { /* quota or private mode */ } },
  })
}

/**
 * Picks the data source. With VITE_API_URL set, the HTTP client talks to apps/api (/v1) with
 * token refresh, retries and live updates; otherwise an in-memory mock (persisted to localStorage)
 * keeps the app fully usable offline.
 */
export function createApi(): FramelineApi {
  if (!API_URL) return mockApi()
  return createHttpApi({
    baseUrl: API_URL,
    tokens: tokenStore,
    onUnauthorized: () => {
      if (!location.pathname.startsWith('/login')) location.assign(`/login?expired=1&from=${encodeURIComponent(location.pathname + location.search)}`)
    },
  })
}

export function resetDemoData() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  location.reload()
}

const ApiCtx = createContext<FramelineApi | null>(null)

/** Turns any thrown value into a sentence people can act on. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts. Wait a moment and try again.'
    if (err.status === 0 || err.code === 'network_error') return 'Can’t reach Frameline. Check your connection and try again.'
    return err.detail || err.message
  }
  if (err instanceof Error) return err.message
  return 'Something unexpected happened.'
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry client errors (401/403/404/422); the HTTP client already retries network/5xx.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
    },
    mutations: { retry: 0 },
  },
})

/** Which query-key roots to refresh when the backend announces a change. */
const TOPIC_KEYS: Record<ChangeTopic, string[]> = {
  events: ['events', 'event'],
  albums: ['albums'],
  photos: ['photos', 'photo'],
  studio: ['studio'],
  usage: ['usage'],
  guests: ['guests', 'access-requests'],
  activity: ['activity'],
  misc: ['films', 'cameras', 'qrs', 'broadcasts', 'tickets', 'team', 'watermark', 'website', 'enquiries', 'ledger', 'orders'],
}

function LiveUpdates({ api }: { api: FramelineApi }) {
  const qc = useQueryClient()
  useEffect(() => api.subscribe((topic) => {
    for (const key of TOPIC_KEYS[topic] ?? []) qc.invalidateQueries({ queryKey: [key] })
  }), [api, qc])
  return null
}

export function ApiProvider({ children, api: given }: { children: ReactNode; api?: FramelineApi }) {
  const api = useMemo(() => given ?? createApi(), [given])
  return (
    <ApiCtx.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        <LiveUpdates api={api} />
        {children}
      </QueryClientProvider>
    </ApiCtx.Provider>
  )
}

export function useApi() {
  const api = useContext(ApiCtx)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}

/** The HTTP client (with `auth.*`) when running against the real API, else null. */
export function useHttpApi(): FramelineHttpApi | null {
  const api = useApi()
  return 'auth' in api ? (api as FramelineHttpApi) : null
}
