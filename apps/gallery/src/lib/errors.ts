import { ApiError } from '@frameline/shared'

/**
 * Plain-language messages for API errors. The mock and the HTTP client both throw `ApiError`
 * (status, code, detail, problem), so screens never show raw codes.
 */
export interface Friendly {
  title: string
  body: string
  code: string
  /** Seconds until the guest may try again (429s). */
  retryAfter?: number
}

const asApiError = (err: unknown): ApiError | null => (err instanceof ApiError ? err : null)

export const errorCode = (err: unknown) => asApiError(err)?.code ?? (err instanceof TypeError ? 'network_error' : 'unknown')
export const isNotFound = (err: unknown) => { const e = asApiError(err); return !!e && (e.status === 404 || e.code === 'not_found') }
export const isNetwork = (err: unknown) => { const e = asApiError(err); return e ? e.status === 0 || e.code === 'network_error' : err instanceof TypeError }
/** 401/403 from an endpoint the guest can't call (studio-only in the HTTP API). */
export const isStudioOnly = (err: unknown) => {
  const e = asApiError(err)
  return !!e && (e.code === 'missing_token' || e.code === 'invalid_token' || e.code === 'token_expired' || e.code === 'not_a_member' || e.code === 'no_studio')
}

export function retrySeconds(err: unknown): number | undefined {
  const e = asApiError(err)
  if (!e) return undefined
  const fromProblem = typeof e.problem.retryAfter === 'number' ? e.problem.retryAfter : undefined
  const s = e.retryAfter ?? fromProblem
  return s !== undefined ? Math.max(1, Math.ceil(s)) : undefined
}

export const attemptsRemaining = (err: unknown): number | undefined => {
  const v = asApiError(err)?.problem.attemptsRemaining
  return typeof v === 'number' ? v : undefined
}

const waitText = (s: number) => (s >= 90 ? `${Math.ceil(s / 60)} minutes` : `${s} ${s === 1 ? 'second' : 'seconds'}`)

export function friendlyError(err: unknown, fallbackTitle = 'Something went wrong'): Friendly {
  const e = asApiError(err)
  if (isNetwork(err)) return { code: 'network_error', title: 'You seem to be offline', body: 'We couldn’t reach Frameline. Check your internet connection and try again.' }
  if (!e) return { code: 'unknown', title: fallbackTitle, body: err instanceof Error ? err.message : 'Try again in a moment.' }
  const retry = retrySeconds(e)
  switch (e.code) {
    case 'invalid_pin': {
      const left = attemptsRemaining(e)
      return { code: e.code, title: 'That PIN didn’t match', body: left !== undefined ? `Check the message from the host. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Check the message from the host and try again.' }
    }
    case 'pin_locked':
      return { code: e.code, retryAfter: retry ?? 900, title: 'Too many wrong PINs', body: `For your safety this gallery is locked on this device. Try again in ${waitText(retry ?? 900)}, or ask the host for the PIN.` }
    case 'pin_required':
    case 'guest_token_expired':
    case 'invalid_guest_token':
      return { code: e.code, title: 'Enter the gallery PIN again', body: 'Your gallery session has ended. Enter the PIN to keep going.' }
    case 'registration_required':
      return { code: e.code, title: 'Tell us who you are', body: 'The host asked guests to sign in with their name and email first.' }
    case 'gallery_disabled': return { code: e.code, title: 'This gallery is turned off', body: 'The studio has paused this gallery for now. Your photos are safe.' }
    case 'gallery_archived': return { code: e.code, title: 'This gallery has been archived', body: 'Ask the studio to restore it or send you your photos.' }
    case 'gallery_expired': return { code: e.code, title: 'This gallery has expired', body: 'The studio can reopen it for you.' }
    case 'gallery_empty': return { code: e.code, title: 'Photos are on their way', body: 'The studio hasn’t uploaded photos yet. Check back soon.' }
    case 'face_privacy': return { code: e.code, title: 'Find your photos first', body: 'This gallery shows each guest only the photos they are in. Take a selfie to find yours.' }
    case 'face_search_disabled': return { code: e.code, title: 'Face search is off', body: 'The photographer turned off selfie search for this gallery. Browse the albums instead.' }
    case 'face_search_unavailable': return { code: e.code, title: 'Face search is busy', body: 'We couldn’t search right now. Try again in a minute.' }
    case 'store_disabled': return { code: e.code, title: 'Photos aren’t for sale here', body: 'This gallery isn’t selling photos or prints.' }
    case 'enquiries_disabled': return { code: e.code, title: 'Enquiries are off', body: 'This gallery doesn’t take enquiries. Contact the studio directly.' }
    case 'wrong_event': return { code: e.code, title: 'This link is for another gallery', body: 'Open the gallery from its own link or enter its code.' }
    case 'guest_uploads_disabled': return { code: e.code, title: 'Guest uploads are off', body: 'The photographer isn’t taking guest photos for this gallery.' }
    case 'no_guest_album': return { code: e.code, title: 'Guest uploads aren’t set up', body: 'This gallery has no album for guest photos yet. Ask the studio.' }
    case 'guest_upload_limit': {
      const left = typeof e.problem.remaining === 'number' ? e.problem.remaining : undefined
      return { code: e.code, title: 'That’s more than the gallery can take', body: left === 0 ? 'This gallery has reached its limit of guest photos.' : left !== undefined ? `There’s room for ${left} more ${left === 1 ? 'photo' : 'photos'}. Remove some and try again.` : e.detail }
    }
    case 'download_limit': return { code: e.code, title: 'Download all is used up', body: 'You’ve used all your “Download all” tries. Download single photos, or ask the studio for a ZIP.' }
    case 'downloads_disabled': return { code: e.code, title: 'Downloads are off', body: 'The photographer has turned off downloads for this gallery.' }
    case 'downloads_own_only': return { code: e.code, title: 'Only your photos can be downloaded', body: 'Find your photos with a selfie first, then download those.' }
    case 'validation_failed': return { code: e.code, title: 'Check your details', body: e.fieldErrors[0]?.message ?? e.detail }
  }
  if (isNotFound(e)) return { code: 'not_found', title: 'We couldn’t find that', body: e.detail || 'The link may be out of date.' }
  if (isStudioOnly(e)) return { code: e.code, title: 'Not available yet', body: 'This isn’t open to guests yet. Contact the studio and they can help.' }
  if (e.status === 429) return { code: e.code, retryAfter: retry, title: 'Too many tries', body: retry ? `Please wait ${waitText(retry)} and try again.` : 'Please wait a moment and try again.' }
  if (e.status >= 500) return { code: e.code, title: 'Frameline is having trouble', body: 'It’s not you — try again in a minute.' }
  return { code: e.code, title: fallbackTitle, body: e.detail || 'Try again in a moment.' }
}
