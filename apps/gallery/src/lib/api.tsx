import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import {
  ApiError, createHttpApi, createMockApi, localStoragePersistence, memoryTokenStore, storageGuestTokenStore, type ChangeTopic, type FramelineApi,
} from '@frameline/shared'
import { guest } from './guest'

/** Mock data for the guest gallery lives under its own key so it never collides with the admin demo. */
export const STORAGE_KEY = 'frameline.gallery.v1'
/** Guest session tokens (HTTP mode), one per gallery: `frameline.guest.tokens.<SHORTID>`. */
export const GUEST_TOKENS_KEY = 'frameline.guest.tokens'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
/** True when talking to apps/api over HTTP (VITE_API_URL is set); false for the in-browser mock. */
export const isLiveApi = !!API_URL

/**
 * Picks the data source: the HTTP client when VITE_API_URL is set (guests have no studio session, so the
 * studio token store stays in memory; guest tokens persist per gallery), otherwise the mock persisted to
 * localStorage so every guest flow works offline.
 */
export function createApi(): FramelineApi {
  if (API_URL) {
    return createHttpApi({
      baseUrl: API_URL, tokens: memoryTokenStore(), guestTokens: storageGuestTokenStore(GUEST_TOKENS_KEY), guestDeviceId: deviceId,
    })
  }
  // Persisted to localStorage and kept in sync across tabs (the storage event).
  return createMockApi(localStoragePersistence(STORAGE_KEY))
}

const DEVICE_KEY = 'frameline.device'
let device: string | undefined
/** Random id for this browser (per-guest limits and "my galleries"), persisted in localStorage. */
export function deviceId(): string {
  if (device) return device
  try { device = localStorage.getItem(DEVICE_KEY) ?? undefined } catch { /* storage unavailable */ }
  if (!device) {
    device = `dev_${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)}`
    try { localStorage.setItem(DEVICE_KEY, device) } catch { /* private mode: this page session only */ }
  }
  return device
}

/** Guest calls and where their gallery short id is, so a lost session can reopen the right gate. */
const SHORT_ID_ARG: Partial<Record<keyof FramelineApi, (args: unknown[]) => unknown>> = {
  registerGuest: (a) => a[0],
  listPublicPhotos: (a) => a[0],
  searchFaces: (a) => a[0],
  recordPhotoViews: (a) => a[1],
  requestNotify: (a) => a[0],
  createOrder: (a) => a[0],
  setFavourite: (a) => a[2],
  recordDownload: (a) => a[1],
  createEnquiry: (a) => (a[0] as { shortId?: string } | undefined)?.shortId,
  listPublicPrices: (a) => a[0],
  getPublicWatermark: (a) => a[0],
  uploadGuestPhotos: (a) => a[0],
  requestPublicZip: (a) => a[0],
  // Not verifyDownloadPin / listMyFavourites / listMyOrders: their 401s are about the PIN or registration for that
  // feature, not a lost gallery session.
}

/**
 * When the API says the guest's session is gone (expired token, PIN or registration needed), forget the
 * matching local state so EventLayout shows that gate again instead of a broken screen.
 */
function onGuestError(shortId: string, err: unknown) {
  if (!(err instanceof ApiError)) return
  if (err.code === 'pin_required' || err.code === 'guest_token_expired' || err.code === 'invalid_guest_token') {
    guest.patchSession(shortId, { pin: undefined, auth: undefined })
  } else if (err.code === 'registration_required') {
    guest.patchSession(shortId, (s) => ({ registration: undefined, auth: undefined, vip: s.vip ? { ...s.vip, skipLogin: false } : undefined }))
  }
}

function withGuestRecovery(api: FramelineApi): FramelineApi {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      const pickShortId = SHORT_ID_ARG[prop as keyof FramelineApi]
      if (typeof value !== 'function' || !pickShortId) return value
      return (...args: unknown[]) => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args).catch((err: unknown) => {
        const shortId = pickShortId(args)
        if (typeof shortId === 'string' && shortId) onGuestError(shortId, err)
        throw err
      })
    },
  })
}

const ApiCtx = createContext<FramelineApi | null>(null)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, refetchOnWindowFocus: false,
      // Don't retry answers that won't change (not found, gates, blocked galleries).
      retry: (count, err) => count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
    mutations: { retry: 0 },
  },
})

/** Which query-key roots to refresh when the backend announces a change. */
const TOPIC_KEYS: Record<ChangeTopic, string[]> = {
  events: ['event'],
  albums: ['event'],
  photos: ['photos'],
  studio: ['studio'],
  usage: [],
  guests: [],
  activity: [],
  misc: ['event', 'watermark', 'prices'],
}

function LiveUpdates({ api }: { api: FramelineApi }) {
  const qc = useQueryClient()
  useEffect(() => api.subscribe((topic) => {
    for (const key of TOPIC_KEYS[topic]) qc.invalidateQueries({ queryKey: [key] })
  }), [api, qc])
  return null
}

export function ApiProvider({ children, api: given }: { children: ReactNode; api?: FramelineApi }) {
  const api = useMemo(() => withGuestRecovery(given ?? createApi()), [given])
  return (
    <ApiCtx.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        {/* The realtime socket needs a studio session; guests on the HTTP API refresh on navigation instead. */}
        {!isLiveApi && <LiveUpdates api={api} />}
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
