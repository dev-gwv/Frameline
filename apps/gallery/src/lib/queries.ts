import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { hash, type Album, type ID, type Photo, type PhotoEvent } from '@frameline/shared'
import { useApi } from './api'

/** Guests never see hidden or still-processing photos. */
export const visible = (p: Photo) => !p.hidden && p.status === 'ready'

export function useEvent(shortId: string | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['event', shortId?.toUpperCase()],
    queryFn: () => api.getEvent(shortId!),
    enabled: !!shortId,
    retry: false,
  })
}

export function useStudio() {
  const api = useApi()
  return useQuery({ queryKey: ['studio'], queryFn: () => api.getStudio() })
}

export function useEvents() {
  const api = useApi()
  return useQuery({ queryKey: ['events'], queryFn: () => api.listEvents() })
}

export function useAlbums(eventId: ID | undefined) {
  const api = useApi()
  return useQuery({ queryKey: ['albums', eventId], queryFn: () => api.listAlbums(eventId!), enabled: !!eventId })
}

export function useFilms(eventId: ID | undefined) {
  const api = useApi()
  return useQuery({ queryKey: ['films', eventId], queryFn: () => api.listFilms(eventId!), enabled: !!eventId })
}

export function usePrices() {
  const api = useApi()
  return useQuery({ queryKey: ['prices'], queryFn: () => api.listPrices() })
}

export function useWatermark() {
  const api = useApi()
  return useQuery({ queryKey: ['watermark'], queryFn: () => api.getWatermark() })
}

/**
 * Selfie match. The mock has no face search, so a "match" is the deterministic subset of photos whose
 * faces include the matched person (about 1 in 8 of them, so counts read like a real guest: ~30–50).
 * TODO(api): replace with api.searchFaces(eventId, selfie) → personId + photo ids (Vectorize).
 */
export function useMatches(eventId: ID | undefined, personId: ID | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'match', eventId, personId],
    enabled: !!eventId && !!personId,
    queryFn: async () => {
      const { items } = await api.listPhotos(eventId!, { personId })
      return items.filter((p) => visible(p) && hash(p.id + personId) % 8 === 0)
    },
  })
}

/** Most-favourited photos; shown as the "Highlights" album. */
export function useHighlights(eventId: ID | undefined, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'highlights', eventId],
    enabled: !!eventId && enabled,
    queryFn: async () => {
      const { items } = await api.listPhotos(eventId!, {})
      return items.filter(visible).sort((a, b) => b.favourites - a.favourites || a.capturedAt.localeCompare(b.capturedAt)).slice(0, 36)
    },
  })
}

/** A full list of photo ids for a collection (used by the viewer for "12 / 38" and next/previous). */
export function usePhotoList(eventId: ID | undefined, albumId: string | undefined, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'list', eventId, albumId ?? 'all'],
    enabled: !!eventId && enabled,
    queryFn: async () => {
      const { items } = await api.listPhotos(eventId!, { albumId: albumId && albumId !== 'all' ? albumId : undefined })
      return items.filter(visible)
    },
  })
}

export const PAGE = 48

/** Paged album grid (api.listPhotos limit/offset). `albumId` undefined = every album. */
export function useInfinitePhotos(eventId: ID | undefined, albumId: ID | undefined, enabled = true) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: ['photos', 'page', eventId, albumId ?? 'all'],
    enabled: !!eventId && enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.listPhotos(eventId!, { albumId, offset: pageParam, limit: PAGE }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * PAGE
      return loaded < last.total ? loaded : undefined
    },
  })
}

export function usePhoto(id: ID | undefined) {
  const api = useApi()
  return useQuery({ queryKey: ['photo', id], queryFn: () => api.getPhoto(id!), enabled: !!id, retry: false })
}

/** Albums a guest can browse: regular albums, plus guest uploads when they don't need review. */
export function guestAlbums(albums: Album[] | undefined, event: PhotoEvent) {
  return (albums ?? []).filter((a) => a.kind === 'album' || (a.kind === 'guest' && a.photoCount > 0 && !event.settings.reviewGuestUploads))
}

/** The guest's favourites (ids stored on this device), resolved to photos in the order they were added. */
export function useFavouritePhotos(eventId: ID | undefined, ids: ID[]) {
  const api = useApi()
  return useQuery({
    queryKey: ['photos', 'favs', eventId, ids.join(',')],
    enabled: !!eventId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await Promise.all(ids.map((id) => api.getPhoto(id).catch(() => null)))
      return res.filter((p): p is Photo => !!p && visible(p)).reverse()
    },
  })
}
