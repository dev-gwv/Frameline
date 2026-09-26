import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import type { Album, FramelineApi, Photo, PublicEvent, PublicStudio, PublicWatermark, WatermarkSettings } from '@frameline/shared'
import { useApi } from './api'
import { guest, snapshot, type FaceMatch } from './guest'

const up = (shortId: string | undefined) => (shortId ?? '').toUpperCase()

/** Event landing data: safe subset of the event + albums + films + studio branding + `blocked`. */
export function usePublicEvent(shortId: string | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['event', up(shortId)],
    queryFn: () => api.getPublicEvent(shortId!),
    enabled: !!shortId,
    retry: false,
  })
}

export function usePrices(shortId: string) {
  const api = useApi()
  return useQuery({ queryKey: ['prices', up(shortId)], queryFn: () => api.listPublicPrices(shortId), retry: false })
}

/** Watermark for generated downloads (canvas fallback). `enabled: false` = no watermark on this gallery. */
export const watermarkQuery = (api: FramelineApi, shortId: string) => ({
  queryKey: ['watermark', up(shortId)],
  queryFn: () => api.getPublicWatermark(shortId).catch((): PublicWatermark | null => null),
  staleTime: 10 * 60_000,
})
export const ensureWatermark = (qc: QueryClient, api: FramelineApi, shortId: string) => qc.ensureQueryData(watermarkQuery(api, shortId))
export function useWatermark(shortId: string) {
  const api = useApi()
  return useQuery(watermarkQuery(api, shortId))
}
/** Used only when the watermark didn't load: a text mark with the studio name, so downloads are never left bare. */
export function fallbackWatermark(studio: PublicStudio): WatermarkSettings {
  return {
    mode: 'text', text: studio.name, subtitle: '', position: 'br', size: 'normal', opacity: 70, font: 'Fraunces', edgeOffset: 3,
    applyTo: { previews: false, downloads: true, guestUploads: false, originals: true },
  }
}

/**
 * Registered guests' favourites from the API (source of truth). The result also refreshes the device copy,
 * which stays the instant cache and the only list for guests who haven't registered.
 */
export function useMyFavourites(shortId: string, enabled: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'favs', up(shortId)],
    enabled,
    retry: false,
    queryFn: async () => {
      const items = await api.listMyFavourites(shortId)
      guest.patchSession(shortId, { favourites: items.map((p) => p.id), favPhotos: Object.fromEntries(items.map((p) => [p.id, snapshot(p)])) })
      return items
    },
  })
}

/** Orders placed from this device / by this registered guest. Paid digital orders (no shipping) unlock their photos for download. */
export function useMyOrders(shortId: string, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['orders', up(shortId)],
    enabled,
    retry: false,
    queryFn: async () => {
      const orders = await api.listMyOrders(shortId)
      const paid = orders.filter((o) => !o.shipping && (o.status === 'paid' || o.status === 'paid-direct')).flatMap((o) => o.photoIds ?? [])
      if (paid.length) guest.patchSession(shortId, (s) => ({ purchased: [...new Set([...s.purchased, ...paid])] }))
      return orders
    },
  })
}

/**
 * The guest's matched photos. Face links without a person id resolve it here (after the gates) with
 * searchFaces; the person id is then remembered for this event.
 */
export function useMatches(shortId: string, match: FaceMatch | undefined, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'match', up(shortId), match?.at],
    enabled: !!match && enabled,
    queryFn: async (): Promise<Photo[]> => {
      let personId = match!.personId
      let ids = match!.photoIds
      if (!personId && match!.key && !ids) {
        const r = await api.searchFaces(shortId, { key: match!.key })
        personId = r.personId ?? undefined
        ids = personId ? undefined : r.photoIds
        guest.patchSession(shortId, (s) => (s.match?.at === match!.at ? { match: { ...s.match, personId, photoIds: ids } } : {}))
      }
      if (personId) return (await api.listPublicPhotos(shortId, { personId })).items
      if (!ids?.length) return []
      // No person (events without face data): the API returned ids only.
      const wanted = new Set(ids)
      try { return (await api.listPublicPhotos(shortId)).items.filter((p) => wanted.has(p.id)) } catch { return [] }
    },
  })
}

/** Most-favourited photos; shown as the "Highlights" album. */
export function useHighlights(shortId: string, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'highlights', up(shortId)],
    enabled,
    queryFn: async () => (await api.listPublicPhotos(shortId, { highlights: true, limit: 36 })).items,
  })
}

/** Every photo in a collection (viewer next/previous, Download all). `albumId` 'all'/undefined = every album. */
export function usePhotoList(shortId: string, albumId: string | undefined, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'list', up(shortId), albumId ?? 'all'],
    enabled,
    queryFn: async () => (await api.listPublicPhotos(shortId, { albumId: albumId && albumId !== 'all' ? albumId : undefined })).items,
  })
}

/** First photo of an album, for its cover. */
export function useAlbumCover(shortId: string, albumId: string, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'cover', up(shortId), albumId],
    enabled,
    queryFn: async () => (await api.listPublicPhotos(shortId, { albumId, limit: 1 })).items[0] ?? null,
  })
}

export const PAGE = 48

/** Paged album grid (listPublicPhotos offset/limit). `albumId` undefined = every album. */
export function useInfinitePhotos(shortId: string, albumId: string | undefined, enabled = true) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: ['photos', 'page', up(shortId), albumId ?? 'all'],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.listPublicPhotos(shortId, { albumId, offset: pageParam, limit: PAGE }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total && last.items.length > 0 ? loaded : undefined
    },
  })
}

export function useStudioProfile(code: string | undefined) {
  const api = useApi()
  return useQuery({ queryKey: ['studio', 'profile', (code ?? '').toLowerCase()], queryFn: () => api.getStudioProfile(code!), enabled: !!code, retry: false })
}

/** Albums a guest can browse: regular albums, plus guest uploads when they don't need review. */
export function guestAlbums(albums: Album[] | undefined, event: PublicEvent) {
  return (albums ?? []).filter((a) => a.kind === 'album' || (a.kind === 'guest' && a.photoCount > 0 && !event.settings.reviewGuestUploads))
}
