import { useCallback, useEffect } from 'react'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import type { FramelineApi, ID, Photo } from '@frameline/shared'
import { useApi } from './api'
import { errorCode, friendlyError } from './errors'
import { actions, local } from './local'
import { toast } from './toast'

/**
 * When a guest call says the gallery session is gone (12 h token expired, PIN needed again, registration needed),
 * forget that gate locally so the screen shows the PIN / registration form again.
 */
export function useGuestAccessGuard(eventId: ID | undefined, ...errors: unknown[]) {
  const codes = errors.map(errorCode).filter(Boolean).join(',')
  useEffect(() => {
    if (!eventId || !codes) return
    if (/pin_required|guest_token_expired|invalid_guest_token|wrong_event/.test(codes)) {
      actions.lock(eventId)
      toast.info('Enter the PIN again', 'Your gallery session ended')
    } else if (/registration_required/.test(codes)) {
      actions.unregister(eventId)
    }
  }, [eventId, codes])
}

/** Heart a photo: saved locally at once (for the Favourites tab), sent with setFavourite, rolled back on failure. */
export function useToggleFavourite() {
  const api = useApi()
  const qc = useQueryClient()
  return useCallback(async (photo: Photo, shortId: string | undefined) => {
    const on = !local.get().favourites.some((f) => f.photoId === photo.id)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    actions.setFavourite(photo, shortId, on)
    try {
      await api.setFavourite(photo.id, on, shortId)
      qc.invalidateQueries({ queryKey: ['highlights'] })
    } catch (e) {
      actions.setFavourite(photo, shortId, !on)
      const f = friendlyError(e)
      toast.error(f.title, f.detail)
    }
  }, [api, qc])
}

/** Counts downloads for the studio's stats. Best effort: a failure never blocks the saved photos. */
export function recordDownloads(api: FramelineApi, photos: Photo[], shortId?: string) {
  if (!photos.length) return
  api.recordDownload(photos.map((p) => p.id), shortId).catch(() => {})
}
