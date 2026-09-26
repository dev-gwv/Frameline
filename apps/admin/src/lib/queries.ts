import { useMutation, useQuery, type UseMutationOptions } from '@tanstack/react-query'
import type { ID, ListPhotosQuery } from '@frameline/shared'
import { useToast } from '@frameline/ui'
import { useApi } from './api'

/*
 * Query hooks for every screen. Keys start with a root listed in TOPIC_KEYS (lib/api.tsx)
 * so live change events refresh them automatically.
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
export const usePeople = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['people', eventId], queryFn: () => api.listPeople(eventId!), enabled: !!eventId }) }
export const useFilms = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['films', eventId], queryFn: () => api.listFilms(eventId!), enabled: !!eventId }) }
export const useGuests = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['guests', eventId], queryFn: () => api.listGuests(eventId!), enabled: !!eventId }) }
export const useAccessRequests = (eventId?: ID) => { const api = useApi(); return useQuery({ queryKey: ['access-requests', eventId], queryFn: () => api.listAccessRequests(eventId!), enabled: !!eventId }) }

export const useActivity = () => { const api = useApi(); return useQuery({ queryKey: ['activity'], queryFn: () => api.listActivity() }) }
export const useOrders = () => { const api = useApi(); return useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders() }) }
export const useLedger = () => { const api = useApi(); return useQuery({ queryKey: ['ledger'], queryFn: () => api.listLedger() }) }
export const usePrices = () => { const api = useApi(); return useQuery({ queryKey: ['orders', 'prices'], queryFn: () => api.listPrices() }) }
export const useCameras = () => { const api = useApi(); return useQuery({ queryKey: ['cameras'], queryFn: () => api.listCameras() }) }
export const useQRs = () => { const api = useApi(); return useQuery({ queryKey: ['qrs'], queryFn: () => api.listQRs() }) }
export const useBroadcasts = () => { const api = useApi(); return useQuery({ queryKey: ['broadcasts'], queryFn: () => api.listBroadcasts() }) }
export const useTickets = () => { const api = useApi(); return useQuery({ queryKey: ['tickets'], queryFn: () => api.listTickets() }) }
export const useTeam = () => { const api = useApi(); return useQuery({ queryKey: ['team'], queryFn: () => api.listTeam() }) }
export const useWatermark = () => { const api = useApi(); return useQuery({ queryKey: ['watermark'], queryFn: () => api.getWatermark() }) }
export const useWebsite = () => { const api = useApi(); return useQuery({ queryKey: ['website'], queryFn: () => api.getWebsite() }) }
export const useEnquiries = () => { const api = useApi(); return useQuery({ queryKey: ['enquiries'], queryFn: () => api.listEnquiries() }) }

/**
 * Mutation with consistent success/error toasts. Pass `success` text to confirm the
 * action in words ("Album created"); errors always explain what failed.
 */
export function useAction<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string | ((data: TData, vars: TVars) => string); error?: string } & Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'> = {},
) {
  const toast = useToast()
  const { success, error, onSuccess, onError, ...rest } = opts
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: (data, vars, ctx, m) => {
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success)
      onSuccess?.(data, vars, ctx, m)
    },
    onError: (err, vars, ctx, m) => {
      toast.error(error ?? 'That didn’t work', err.message)
      onError?.(err, vars, ctx, m)
    },
    ...rest,
  })
}
