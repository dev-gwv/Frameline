import { useMutation, useQuery, type UseMutationOptions } from '@tanstack/react-query'
import { ApiError, type ID, type ListPhotosQuery, type NeedsYouItem, type PhotoIdsQuery } from '@frameline/shared'
import { useToast } from '@frameline/ui'
import { errorMessage, useApi } from './api'

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
/** A 404 (trashed or gone) is final: no retry, so the viewer shows its “isn’t here any more” state at once. */
export const usePhoto = (id?: ID) => {
  const api = useApi()
  return useQuery({ queryKey: ['photo', id], queryFn: () => api.getPhoto(id!), enabled: !!id, retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1 })
}
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
  opts: { success?: string | ((data: TData, vars: TVars) => string); error?: string; /** Set false when the screen shows the error inline instead. */ errorToast?: boolean } & Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'> = {},
) {
  const toast = useToast()
  const { success, error, errorToast = true, onSuccess, onError, ...rest } = opts
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: (data, vars, ctx, m) => {
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success)
      onSuccess?.(data, vars, ctx, m)
    },
    onError: (err, vars, ctx, m) => {
      if (errorToast) toast.error(error ?? 'That didn’t work', errorMessage(err))
      onError?.(err, vars, ctx, m)
    },
    ...rest,
  })
}

// ── Money, settings & tools (keys sit under TOPIC_KEYS roots so live updates refresh them) ──
export const useStoreSettings = () => { const api = useApi(); return useQuery({ queryKey: ['orders', 'store-settings'], queryFn: () => api.getStoreSettings() }) }
export const usePurchases = () => { const api = useApi(); return useQuery({ queryKey: ['ledger', 'purchases'], queryFn: () => api.listPurchases() }) }
export const useUsageBreakdown = (enabled = true) => { const api = useApi(); return useQuery({ queryKey: ['usage', 'breakdown'], queryFn: () => api.getUsageBreakdown(), enabled }) }
/** Polls every 3 s while the report is still processing (live updates usually beat it). */
export const useUsageReport = () => {
  const api = useApi()
  return useQuery({ queryKey: ['usage', 'report'], queryFn: () => api.getUsageReport(), refetchInterval: (q) => (q.state.data?.status === 'processing' ? 3000 : false) })
}
export const useNotificationPrefs = () => { const api = useApi(); return useQuery({ queryKey: ['team', 'notification-prefs'], queryFn: () => api.getNotificationPrefs() }) }
export const useCameraUploads = (cameraId?: ID, refetchInterval?: number | false) => {
  const api = useApi()
  return useQuery({ queryKey: ['cameras', cameraId, 'uploads'], queryFn: () => api.listCameraUploads(cameraId!), enabled: !!cameraId, refetchInterval })
}

/** Every matching photo id (select-all, the viewer's previous/next). */
export const usePhotoIds = (eventId: ID | undefined, q: PhotoIdsQuery = {}) => {
  const api = useApi()
  return useQuery({ queryKey: ['photos', eventId, 'ids', q], queryFn: () => api.listPhotoIds(eventId!, q), enabled: !!eventId, placeholderData: (prev) => prev })
}
/** "Email me every photo" requests for an event; polls while one is still being prepared. */
export const useZipRequests = (eventId?: ID) => {
  const api = useApi()
  return useQuery({
    queryKey: ['zips', eventId], queryFn: () => api.listZipRequests(eventId!), enabled: !!eventId,
    refetchInterval: (q) => (q.state.data?.some((z) => z.status === 'queued') ? 2500 : false),
  })
}
/** Events in the trash (soft-deleted; purged 30 days after deletion). */
export const useDeletedEvents = (enabled = true) => {
  const api = useApi()
  return useQuery({ queryKey: ['events', 'deleted'], queryFn: () => api.listDeletedEvents(), enabled })
}
/** One event's totals (visits, downloads, favourites, face finding progress). Refreshes on live changes. */
export const useEventStats = (eventId?: ID) => {
  const api = useApi()
  return useQuery({
    queryKey: ['event-stats', eventId], queryFn: () => api.getEventStats(eventId!), enabled: !!eventId,
    // While faces are still being found, check again every few seconds.
    refetchInterval: (q) => ((q.state.data?.faces.pending ?? 0) > 0 || (q.state.data?.processing ?? 0) > 0 ? 4000 : false),
  })
}
/** Studio totals for Reports (`month` 'YYYY-MM', default this month). */
export const useStudioStats = (month?: string) => { const api = useApi(); return useQuery({ queryKey: ['studio-stats', month], queryFn: () => api.getStudioStats(month ? { month } : undefined) }) }
export const useCarts = () => { const api = useApi(); return useQuery({ queryKey: ['orders', 'carts'], queryFn: () => api.listCarts() }) }

// ── Redesign foundation (contract v4) ────────────────────────────────────────

/**
 * The studio's money (owner only; other roles get a 403 → `isError`). Show `data.balance` as "Wallet",
 * cap Withdraw at `data.withdrawable`. Never derive the wallet from ledger rows.
 */
export const useWalletBalance = (enabled = true) => { const api = useApi(); return useQuery({ queryKey: ['wallet'], queryFn: () => api.getWallet(), enabled }) }

/** Where each "Needs you" item goes in the admin, and the button label for it. */
export function needsYouTarget(item: NeedsYouItem): { to: string; actionLabel: string } {
  switch (item.kind) {
    case 'access-request': return { to: `/events/${item.eventId}/guests?f=requests`, actionLabel: 'Review' }
    case 'guest-uploads': return { to: `/events/${item.eventId}/guests?f=uploads`, actionLabel: 'Review' }
    case 'event-expiring': return { to: `/plan?renew=${item.eventId}`, actionLabel: 'Renew' }
    case 'face-data-expiring': return { to: `/plan?renew=${item.eventId}&faces=1`, actionLabel: 'Renew' }
  }
}
export type NeedsYouEntry = NeedsYouItem & { to: string; actionLabel: string }

/**
 * Home "Needs you": pending access requests, guest uploads awaiting review, events expiring within 14 days
 * (or in the 7-day grace period) and face data about to lapse, most recent/urgent first. Each item has
 * `to` (admin link) and `actionLabel` ("Review" / "Renew"); access requests also carry `accessRequestId`
 * so Home can approve/decline in place with `api.resolveAccessRequest`.
 */
export const useNeedsYou = () => {
  const api = useApi()
  return useQuery({
    queryKey: ['needs-you'], queryFn: () => api.listNeedsYou(),
    select: (items): NeedsYouEntry[] => items.map((i) => ({ ...i, ...needsYouTarget(i) })),
    // Uploaders can't see it (403); don't retry.
    retry: false,
  })
}

/** Count for the event's Guests tab badge: pending access requests + guest photos awaiting review. */
export const useGuestsAttention = (eventId?: ID) => {
  const q = useNeedsYou()
  return (q.data ?? []).filter((i) => i.eventId === eventId).reduce((n, i) => n + (i.kind === 'access-request' ? 1 : i.kind === 'guest-uploads' ? i.count ?? 0 : 0), 0)
}

/**
 * Refund an order in full (owner). Ask first with ConfirmDialog (rule 8), then:
 *   const refund = useRefundOrder()
 *   <ConfirmDialog danger confirmLabel={`Refund ${fmt.rupees(o.paid)}`} onConfirm={() => refund.mutateAsync({ orderId: o.id, reason })} … />
 * Errors: 409 `order_not_refundable` (already refunded / not paid through Frameline) → toast with the server's detail.
 */
export const useRefundOrder = () => {
  const api = useApi()
  return useAction((v: { orderId: ID; reason: string }) => api.refundOrder(v.orderId, v.reason), {
    success: (o) => `Refunded ${o.currency === 'USD' ? `$${o.paid}` : `₹${o.paid.toLocaleString('en-IN')}`} to ${o.buyer}`,
    error: 'Couldn’t refund this order',
  })
}
