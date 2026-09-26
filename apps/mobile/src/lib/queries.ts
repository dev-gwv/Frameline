import { useMutation, useQuery, type UseMutationOptions } from '@tanstack/react-query'
import { hash, type FramelineApi, type ID, type ListPhotosQuery, type Photo } from '@frameline/shared'
import { useApi } from './api'
import { toast } from './toast'

/*
 * Query hooks. Keys start with a root listed in TOPIC_KEYS (lib/api.tsx) so live change events refresh them.
 */

export const useStudio = () => { const api = useApi(); return useQuery({ queryKey: ['studio'], queryFn: () => api.getStudio() }) }
export const useUsage = () => { const api = useApi(); return useQuery({ queryKey: ['usage'], queryFn: () => api.getUsage() }) }
export const useEvents = () => { const api = useApi(); return useQuery({ queryKey: ['events'], queryFn: () => api.listEvents() }) }
export const useEvent = (id?: ID) => { const api = useApi(); return useQuery({ queryKey: ['event', id], queryFn: () => api.getEvent(id!), enabled: !!id }) }
export const useAlbums = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['albums', eventId], queryFn: () => api.listAlbums(eventId!), enabled: !!eventId }) }
export const usePhotos = (eventId: ID | undefined, q: ListPhotosQuery = {}) => {
  const api = useApi()
  return useQuery({ queryKey: ['photos', eventId, q], queryFn: () => api.listPhotos(eventId!, q), enabled: !!eventId, placeholderData: (prev) => prev })
}
export const usePhoto = (id?: ID) => { const api = useApi(); return useQuery({ queryKey: ['photo', id], queryFn: () => api.getPhoto(id!), enabled: !!id }) }
export const useFilms = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['films', eventId], queryFn: () => api.listFilms(eventId!), enabled: !!eventId }) }
export const useActivity = () => { const api = useApi(); return useQuery({ queryKey: ['activity'], queryFn: () => api.listActivity() }) }
export const useOrders = () => { const api = useApi(); return useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders() }) }
export const usePrices = () => { const api = useApi(); return useQuery({ queryKey: ['orders', 'prices'], queryFn: () => api.listPrices() }) }
export const useCameras = () => { const api = useApi(); return useQuery({ queryKey: ['cameras'], queryFn: () => api.listCameras() }) }

/** Photos a guest may see: ready and not hidden by the studio. */
export const guestVisible = (p: Photo) => !p.hidden && p.status === 'ready'

/** The guest persona the mock face matcher "finds" in every event. */
export const DEMO_PERSON = 'p_g1'

/**
 * Simulated face match: photos where the demo guest's face appears, thinned deterministically so the
 * sample wedding returns a believable few dozen (46 of 1,248). Replace with the server's
 * selfie-search endpoint when it exists.
 */
export async function fetchMyPhotos(api: FramelineApi, eventId: ID): Promise<Photo[]> {
  const { items } = await api.listPhotos(eventId, { personId: DEMO_PERSON })
  let mine = items.filter(guestVisible).filter((p) => hash(p.id) % 7 === 0)
  if (mine.length < 6) {
    const all = (await api.listPhotos(eventId)).items.filter(guestVisible)
    mine = all.filter((p) => hash(p.id) % 9 === 0).slice(0, 40)
    if (mine.length < 6) mine = all.slice(0, 12)
  }
  return mine
}

export const myPhotosQuery = (api: FramelineApi, eventId: ID) => ({ queryKey: ['my-photos', eventId], queryFn: () => fetchMyPhotos(api, eventId) })

export const useMyPhotos = (eventId: ID | undefined, enabled = true) => {
  const api = useApi()
  return useQuery({ ...myPhotosQuery(api, eventId ?? ''), enabled: !!eventId && enabled })
}

/** Most-favourited photos of an event, shown to guests as the "Highlights" album. */
export const useHighlights = (eventId: ID | undefined) => {
  const api = useApi()
  return useQuery({
    queryKey: ['highlights', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { items } = await api.listPhotos(eventId!, { filter: 'favourites' })
      return items.filter(guestVisible).sort((a, b) => b.favourites - a.favourites).slice(0, 24)
    },
  })
}

/** Fetches a set of photos by id (favourites across events). */
export const usePhotosById = (ids: ID[]) => {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'by-id', ids],
    queryFn: async () => {
      const out = await Promise.all(ids.map((id) => api.getPhoto(id).catch(() => null)))
      return out.filter((p): p is Photo => !!p)
    },
    placeholderData: (prev) => prev,
  })
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
      toast.error(error ?? 'That didn’t work', args[0].message)
      return onError?.(...args)
    },
    ...rest,
  })
}
