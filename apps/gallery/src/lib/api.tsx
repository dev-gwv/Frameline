import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { createMockApi, type ChangeTopic, type FramelineApi } from '@frameline/shared'

/** Mock data for the guest gallery lives under its own key so it never collides with the admin demo. */
export const STORAGE_KEY = 'frameline.gallery.v1'

/**
 * Picks the data source.
 *
 * TODO(api): switch to the HTTP client once `packages/shared/src/http.ts` lands:
 *   const url = import.meta.env.VITE_API_URL
 *   if (url) return createHttpApi({ baseUrl: url })
 * Until then the in-memory mock (persisted to localStorage) keeps every guest flow usable.
 */
export function createApi(): FramelineApi {
  return createMockApi({
    load: () => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } },
    save: (d) => { try { localStorage.setItem(STORAGE_KEY, d) } catch { /* quota or private mode */ } },
  })
}

const ApiCtx = createContext<FramelineApi | null>(null)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: 0 },
  },
})

/** Which query-key roots to refresh when the backend announces a change. */
const TOPIC_KEYS: Record<ChangeTopic, string[]> = {
  events: ['event', 'events'],
  albums: ['albums'],
  photos: ['photos', 'photo'],
  studio: ['studio'],
  usage: [],
  guests: [],
  activity: [],
  misc: ['films', 'watermark', 'prices'],
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
