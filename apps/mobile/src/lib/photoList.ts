import { useMemo } from 'react'
import type { ID, Photo } from '@frameline/shared'
import { useLocal } from './local'
import { useHighlights, useMyPhotos, usePhotos, usePublicPhotos } from './queries'

export type PhotoScope = 'mine' | 'album' | 'highlights' | 'favourites' | 'studio'

export interface PhotoListTarget {
  /** Studio scope: the event id (studio endpoints). */
  eventId?: ID
  /** Guest scopes: the gallery short id (public endpoints). */
  shortId?: string
  albumId?: ID
}

/**
 * One list of photos per (gallery, scope, album). The grid and the full-screen viewer both call this, so the
 * viewer pages through exactly what the grid showed (served from the react-query cache).
 *
 * - studio     → listPhotos (every photo, including hidden/processing)
 * - album      → listPublicPhotos (server excludes hidden, processing and pending-review)
 * - highlights → listPublicPhotos({ highlights })
 * - mine       → the stored searchFaces match
 * - favourites → local snapshots (there's no "list my favourites" endpoint)
 */
export function usePhotoList(scope: PhotoScope, { eventId, shortId, albumId }: PhotoListTarget): { photos: Photo[]; all: Photo[]; isLoading: boolean; error: unknown } {
  const studio = usePhotos(scope === 'studio' ? eventId : undefined, albumId ? { albumId } : {})
  const album = usePublicPhotos(shortId, albumId ? { albumId } : {}, scope === 'album')
  const highlights = useHighlights(shortId, scope === 'highlights')
  const mine = useMyPhotos(scope === 'mine' ? shortId : undefined, eventId)
  const favs = useLocal((s) => s.favourites)

  return useMemo(() => {
    let all: Photo[] = []
    let isLoading = false
    let error: unknown = null
    if (scope === 'mine') { all = mine.data ?? []; isLoading = mine.isLoading; error = mine.error }
    else if (scope === 'album') { all = album.data?.items ?? []; isLoading = album.isLoading; error = album.error }
    else if (scope === 'studio') { all = studio.data?.items ?? []; isLoading = studio.isLoading; error = studio.error }
    else if (scope === 'highlights') { all = highlights.data ?? []; isLoading = highlights.isLoading; error = highlights.error }
    else {
      const key = shortId?.toUpperCase()
      all = favs.filter((f) => f.photo && (!key || f.shortId?.toUpperCase() === key)).map((f) => f.photo!)
    }
    const photos = scope === 'mine' && albumId ? all.filter((p) => p.albumId === albumId) : all
    return { photos, all, isLoading, error }
  }, [scope, albumId, shortId, favs, mine.data, mine.isLoading, mine.error, album.data, album.isLoading, album.error, studio.data, studio.isLoading, studio.error, highlights.data, highlights.isLoading, highlights.error])
}
