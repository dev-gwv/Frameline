import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { createMockApi, type ChangeTopic, type FramelineApi } from '@frameline/shared'
import { kv } from './storage'

const STORAGE_KEY = 'frameline.mock.v1'

/**
 * Picks the data source.
 *
 * TODO(api): switch to the HTTP client once `createHttpApi` lands in packages/shared/src/http.ts:
 *
 *   const url = process.env.EXPO_PUBLIC_API_URL
 *   if (url) return createHttpApi({ baseUrl: url, getToken: () => local.get().studioSession?.token })
 *
 * Until then an in-memory mock, persisted to expo-sqlite kv-store, keeps the app fully usable offline.
 */
export function createApi(): FramelineApi {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL
  if (apiUrl) {
    // TODO(api): return createHttpApi({ baseUrl: apiUrl }) — falls through to the mock for now.
  }
  return createMockApi({
    load: () => kv.get(STORAGE_KEY),
    save: (d) => kv.set(STORAGE_KEY, d),
  })
}

/** Clears mock data; the next launch starts from the sample seed. */
export function resetDemoData() {
  kv.remove(STORAGE_KEY)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
})

/** Which query-key roots to refresh when the backend announces a change (same pattern as apps/admin). */
const TOPIC_KEYS: Record<ChangeTopic, string[]> = {
  events: ['events', 'event'],
  albums: ['albums'],
  photos: ['photos', 'photo', 'my-photos', 'highlights'],
  studio: ['studio'],
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

const ApiCtx = createContext<FramelineApi | null>(null)

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
