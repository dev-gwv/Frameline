import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { createMockApi, type ChangeTopic, type FramelineApi } from '@frameline/shared'

const STORAGE_KEY = 'frameline.mock.v1'

/**
 * Picks the data source. With VITE_API_URL set, the HTTP client talks to apps/api;
 * otherwise an in-memory mock (persisted to localStorage) keeps the app fully usable.
 */
export function createApi(): FramelineApi {
  return createMockApi({
    load: () => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } },
    save: (d) => { try { localStorage.setItem(STORAGE_KEY, d) } catch { /* quota or private mode */ } },
  })
}

export function resetDemoData() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  location.reload()
}

const ApiCtx = createContext<FramelineApi | null>(null)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
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
    for (const key of TOPIC_KEYS[topic]) qc.invalidateQueries({ queryKey: [key] })
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
