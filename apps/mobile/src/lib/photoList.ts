import { useMemo } from 'react'
import type { ID, Photo } from '@frameline/shared'
import { useLocal } from './local'
import { guestVisible, useHighlights, useMyPhotos, usePhotos, usePhotosById } from './queries'

export type PhotoScope = 'mine' | 'album' | 'highlights' | 'favourites' | 'studio'

/**
 * One list of photos per (event, scope, album). The grid and the full-screen viewer both call this, so the
 * viewer pages through exactly what the grid showed (served from the react-query cache).
 */
export function usePhotoList(eventId: ID | undefined, scope: PhotoScope, albumId?: ID): { photos: Photo[]; all: Photo[]; isLoading: boolean } {
  const mine = useMyPhotos(scope === 'mine' ? eventId : undefined)
  const list = usePhotos(scope === 'album' || scope === 'studio' ? eventId : undefined, albumId ? { albumId } : {})
  const highlights = useHighlights(scope === 'highlights' ? eventId : undefined)
  const favs = useLocal((s) => s.favourites)
  const favIds = useMemo(() => (scope === 'favourites' ? favs.filter((f) => !eventId || f.eventId === eventId).map((f) => f.photoId) : []), [favs, scope, eventId])
  const byId = usePhotosById(favIds)

  return useMemo(() => {
    let all: Photo[] = []
    let isLoading = false
    if (scope === 'mine') { all = mine.data ?? []; isLoading = mine.isLoading }
    else if (scope === 'album') { all = (list.data?.items ?? []).filter(guestVisible); isLoading = list.isLoading }
    else if (scope === 'studio') { all = list.data?.items ?? []; isLoading = list.isLoading }
    else if (scope === 'highlights') { all = highlights.data ?? []; isLoading = highlights.isLoading }
    else { all = byId.data ?? []; isLoading = byId.isLoading }
    const photos = scope === 'mine' && albumId ? all.filter((p) => p.albumId === albumId) : all
    return { photos, all, isLoading }
  }, [scope, albumId, mine.data, mine.isLoading, list.data, list.isLoading, highlights.data, highlights.isLoading, byId.data, byId.isLoading])
}
