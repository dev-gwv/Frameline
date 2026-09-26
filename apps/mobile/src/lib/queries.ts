import { useMutation, useQuery, type UseMutationOptions } from '@tanstack/react-query'
import type { FramelineApi, ID, ListPhotosQuery, Photo, PublicPhotosQuery } from '@frameline/shared'
import { useApi } from './api'
import { friendlyError } from './errors'
import { useLocal, type SelfieMatch } from './local'
import { toast } from './toast'

/*
 * Query hooks. Keys start with a root listed in TOPIC_KEYS (lib/api.tsx) so live change events refresh them.
 * Studio hooks use the studio session; guest hooks (usePublic…, useMyPhotos, useHighlights, useStudioProfile)
 * use the public endpoints keyed by the event's short id.
 */

// ── Studio ──────────────────────────────────────────────────────────────────
export const useStudio = () => { const api = useApi(); return useQuery({ queryKey: ['studio'], queryFn: () => api.getStudio() }) }
export const useUsage = () => { const api = useApi(); return useQuery({ queryKey: ['usage'], queryFn: () => api.getUsage() }) }
export const useEvents = () => { const api = useApi(); return useQuery({ queryKey: ['events'], queryFn: () => api.listEvents() }) }
export const useEvent = (id?: ID) => { const api = useApi(); return useQuery({ queryKey: ['event', id], queryFn: () => api.getEvent(id!), enabled: !!id }) }
export const useAlbums = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['albums', eventId], queryFn: () => api.listAlbums(eventId!), enabled: !!eventId }) }
export const usePhotos = (eventId: ID | undefined, q: ListPhotosQuery = {}) => {
  const api = useApi()
  return useQuery({ queryKey: ['photos', eventId, q], queryFn: () => api.listPhotos(eventId!, q), enabled: !!eventId, placeholderData: (prev) => prev })
}
export const useActivity = () => { const api = useApi(); return useQuery({ queryKey: ['activity'], queryFn: () => api.listActivity() }) }
export const useOrders = () => { const api = useApi(); return useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders() }) }
export const useCameras = () => { const api = useApi(); return useQuery({ queryKey: ['cameras'], queryFn: () => api.listCameras() }) }

// ── Guest ───────────────────────────────────────────────────────────────────
const upper = (s?: string) => (s ? s.toUpperCase() : undefined)

/** Gallery landing: event, settings (no PIN), albums, films and studio branding. */
export const usePublicEvent = (shortId?: string) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({ queryKey: ['public-event', key], queryFn: () => api.getPublicEvent(key!), enabled: !!key })
}

/** Photos a guest may see (the server leaves out hidden, processing and pending-review photos). */
export const usePublicPhotos = (shortId: string | undefined, q: PublicPhotosQuery = {}, enabled = true) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({ queryKey: ['public-photos', key, q], queryFn: () => api.listPublicPhotos(key!, q), enabled: !!key && enabled, placeholderData: (prev) => prev })
}

/** Most-favourited photos, shown to guests as the "Highlights" album. */
export const useHighlights = (shortId: string | undefined, enabled = true) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({
    queryKey: ['highlights', key],
    enabled: !!key && enabled,
    queryFn: async () => (await api.listPublicPhotos(key!, { highlights: true, limit: 24 })).items.filter((p) => p.favourites > 0),
  })
}

/** Photos from the stored selfie match: by person when the server found one, else by the matched ids. */
export async function fetchMatchedPhotos(api: FramelineApi, shortId: string, match: Pick<SelfieMatch, 'personId' | 'photoIds'>): Promise<Photo[]> {
  if (match.personId) return (await api.listPublicPhotos(shortId, { personId: match.personId })).items
  const ids = new Set(match.photoIds ?? [])
  if (!ids.size) return []
  return (await api.listPublicPhotos(shortId)).items.filter((p) => ids.has(p.id))
}

/** "My photos": the guest's selfie match for this gallery (empty until they take a selfie). */
export const useMyPhotos = (shortId: string | undefined, eventId: ID | undefined) => {
  const api = useApi()
  const key = upper(shortId)
  const match = useLocal((s) => (eventId ? s.selfie[eventId] : undefined))
  return useQuery({
    queryKey: ['my-photos', key, match?.personId ?? null, match?.photoIds?.length ?? 0, match?.at],
    enabled: !!key && !!match,
    queryFn: () => fetchMatchedPhotos(api, key!, match!),
  })
}

export const useStudioProfile = (code?: string) => {
  const api = useApi()
  const key = upper(code)
  return useQuery({ queryKey: ['studio-profile', key], queryFn: () => api.getStudioProfile(key!), enabled: !!key })
}

/** Store prices for a gallery (public endpoint; the server prices the order from the same list). */
export const usePublicPrices = (shortId?: string) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({ queryKey: ['orders', 'public-prices', key], queryFn: () => api.listPublicPrices(key!), enabled: !!key })
}

/** The studio's watermark as guests see it on previews. */
export const usePublicWatermark = (shortId?: string) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({ queryKey: ['public-watermark', key], queryFn: () => api.getPublicWatermark(key!), enabled: !!key, staleTime: 10 * 60_000 })
}

/** Studios this device follows (keyed by X-Guest-Device on the API). */
export const useFollowedStudios = () => {
  const api = useApi()
  return useQuery({ queryKey: ['studio-profile', 'followed'], queryFn: () => api.listFollowedStudios() })
}

/** Galleries this device has opened. */
export const useMyGalleries = () => {
  const api = useApi()
  return useQuery({ queryKey: ['public-event', 'mine'], queryFn: () => api.listMyGalleries() })
}

/** A registered guest's favourites in one gallery (needs a guest session with a guest id). */
export const useMyFavourites = (shortId: string | undefined, enabled = true) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({ queryKey: ['public-photos', 'favourites', key], queryFn: () => api.listMyFavourites(key!), enabled: !!key && enabled })
}

/** Orders this guest placed in one gallery. */
export const useMyOrders = (shortId: string | undefined) => {
  const api = useApi()
  const key = upper(shortId)
  return useQuery({ queryKey: ['orders', 'mine', key], queryFn: () => api.listMyOrders(key!), enabled: !!key })
}

/**
 * Mutation with a toast on success and a plain-words error on failure (mirrors apps/admin `useAction`).
 */
export function useAction<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string | ((data: TData, vars: TVars) => string); error?: string } & Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'> = {},
) {
  const { success, error, onSuccess, onError, ...rest } = opts
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: (...args) => {
      const [data, vars] = args
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success)
      return onSuccess?.(...args)
    },
    onError: (...args) => {
      const f = friendlyError(args[0])
      toast.error(error ?? f.title, f.detail)
      return onError?.(...args)
    },
    ...rest,
  })
}
