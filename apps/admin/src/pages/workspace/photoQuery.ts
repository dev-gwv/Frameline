import { useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { FramelineApi, ID, Photo, PhotoIdsQuery } from '@frameline/shared'
import { useApi } from '../../lib/api'
import type { GridSort } from './lib'

export const PAGE = 60

/** The API query behind a sort choice ("Newest" is the API's `newest` sort, capture time descending). */
export function sortQuery(sort: GridSort, albumId?: ID, personId?: ID): PhotoIdsQuery {
  const base = { albumId, personId }
  switch (sort) {
    case 'oldest': return { ...base, sort: 'capture' }
    case 'name': return { ...base, sort: 'name' }
    case 'people': return { ...base, sort: 'newest', filter: 'people' }
    case 'favourites': return { ...base, sort: 'newest', filter: 'favourites' }
    case 'hidden': return { ...base, sort: 'newest', filter: 'hidden' }
    default: return { ...base, sort: 'newest' }
  }
}

interface PageData { i: number; total: number; items: Photo[] }

async function fetchPage(api: FramelineApi, eventId: ID, q: PhotoIdsQuery, i: number): Promise<PageData> {
  const r = await api.listPhotos(eventId, { ...q, offset: i * PAGE, limit: PAGE })
  return { i, total: r.total, items: r.items }
}

/** Photos for the grid, loaded page by page as you scroll (no Scroll/Pages switch). */
export function usePhotoPages(eventId: ID | undefined, sort: GridSort, albumId?: ID, personId?: ID) {
  const api = useApi()
  const q = sortQuery(sort, albumId, personId)
  const query = useInfiniteQuery({
    queryKey: ['photos', eventId, 'grid', q],
    enabled: !!eventId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(api, eventId!, q, pageParam),
    getNextPageParam: (last, all): number | undefined => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total && last.items.length ? last.i + 1 : undefined
    },
  })
  const photos = useMemo(() => {
    const seen = new Set<ID>()
    const out: Photo[] = []
    for (const p of query.data?.pages ?? []) for (const ph of p.items) if (!seen.has(ph.id)) { seen.add(ph.id); out.push(ph) }
    return out
  }, [query.data])
  const total = query.data?.pages[0]?.total ?? 0
  return { ...query, photos, total, q }
}

/** Every id in grid order (select all, the viewer's previous/next). */
export function useGridIds(eventId: ID | undefined, sort: GridSort, albumId?: ID, personId?: ID) {
  const api = useApi()
  const q = sortQuery(sort, albumId, personId)
  return useQuery({
    queryKey: ['photos', eventId, 'ids', q],
    queryFn: () => api.listPhotoIds(eventId!, q),
    enabled: !!eventId,
    placeholderData: (prev) => prev,
  })
}
