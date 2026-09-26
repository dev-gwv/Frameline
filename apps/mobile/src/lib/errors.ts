import { ApiError } from '@frameline/shared'

export interface FriendlyError { title: string; detail: string; code?: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Seconds until a rate-limited call may be retried (Retry-After header or problem.retryAfter). */
export function retryAfterSeconds(e: ApiError): number | undefined {
  const fromProblem = Number(e.problem.retryAfter)
  const s = e.retryAfter ?? (Number.isFinite(fromProblem) ? fromProblem : undefined)
  return s === undefined ? undefined : Math.max(1, Math.ceil(s))
}

function waitText(seconds: number | undefined) {
  if (seconds === undefined) return 'Wait a moment and try again.'
  if (seconds < 90) return `Try again in ${plural(seconds, 'second')}.`
  return `Try again in ${plural(Math.ceil(seconds / 60), 'minute')}.`
}

/**
 * Turns anything thrown by the API (HTTP client or mock — both throw `ApiError`) into plain words for a toast
 * or an inline form error.
 */
export function friendlyError(e: unknown): FriendlyError {
  if (!(e instanceof ApiError)) {
    const msg = e instanceof Error ? e.message : ''
    if (/network request failed|failed to fetch|network/i.test(msg)) return { title: 'You’re offline', detail: 'Check your connection and try again.' }
    return { title: 'That didn’t work', detail: msg || 'Something went wrong. Try again.' }
  }
  const code = e.code
  const out = (title: string, detail: string): FriendlyError => ({ title, detail, code })
  if (e.isNetworkError) {
    if (code === 'file_unreadable') return out('Couldn’t read a photo', e.detail)
    return out('You’re offline', 'Couldn’t reach Frameline. Check your connection and try again.')
  }
  switch (code) {
    case 'invalid_pin': {
      const left = Number(e.problem.attemptsRemaining)
      return out('That PIN is wrong', Number.isFinite(left)
        ? `${plural(left, 'try', 'tries')} left. The PIN is on your invitation, or ask the host.`
        : 'Check the 4-digit PIN on your invitation, or ask the host.')
    }
    case 'pin_locked': return out('Too many wrong PINs', `${waitText(retryAfterSeconds(e))} Or ask the photographer for the PIN.`)
    case 'pin_required':
    case 'guest_token_expired':
    case 'invalid_guest_token': return out('Enter the PIN again', 'Your gallery session has ended. Enter the PIN to keep browsing.')
    case 'registration_required': return out('Register first', 'Add your name and email to open this gallery.')
    case 'wrong_event': return out('Open the gallery again', 'This session belongs to a different gallery.')
    case 'face_privacy': return out('Take a selfie first', 'This gallery shows each guest only their own photos.')
    case 'face_search_disabled': return out('Selfie search is off', 'The studio turned off face search for this gallery.')
    case 'gallery_disabled': return out('Gallery closed', 'The studio has turned this gallery off.')
    case 'gallery_archived': return out('Gallery archived', 'Ask the photographer to restore it.')
    case 'gallery_expired': return out('Gallery expired', 'Ask the photographer to renew it.')
    case 'gallery_empty': return out('Photos aren’t ready yet', 'Check back soon.')
    case 'guest_uploads_disabled': return out('Guest uploads are off', 'The host isn’t collecting guest photos for this event.')
    case 'guest_upload_limit': {
      const left = Number(e.problem.remaining)
      return out('Too many photos', Number.isFinite(left) ? `This gallery has room for ${plural(left, 'more photo', 'more photos')}.` : 'This gallery can’t take more guest photos.')
    }
    case 'no_guest_album': return out('Guest uploads aren’t set up', 'Ask the studio to add a Guest uploads album.')
    case 'download_limit': return out('“Download all” used up', 'You’ve used all 5. Save single photos from the viewer, or ask for a ZIP by email.')
    case 'downloads_disabled': return out('Downloads are off', 'You can still buy prints or full-resolution photos.')
    case 'downloads_own_only': return out('Find yourself first', 'You can download only the photos you’re in. Take a selfie to find them.')
    case 'oauth_failed':
    case 'oauth_invalid':
    case 'oauth_state_mismatch': return out('Google sign-in didn’t finish', e.detail)
    case 'oauth_email_unverified': return out('Verify your Google email', e.detail)
    case 'not_configured':
    case 'http_501': return out('Not available yet', e.detail)
    case 'store_disabled': return out('Not for sale', 'This gallery isn’t selling photos.')
    case 'enquiries_disabled': return out('Enquiries are off', 'Contact the studio directly instead.')
    case 'otp_invalid': {
      const left = Number(e.problem.attemptsRemaining)
      return out('That code doesn’t match', Number.isFinite(left) ? `${plural(left, 'try', 'tries')} left. Check the latest email.` : 'Check the latest email, or ask for a new code.')
    }
    case 'otp_expired': return out('That code has expired', 'Ask for a new code.')
    case 'otp_locked': return out('Too many wrong codes', 'Ask for a new code and try again.')
    case 'otp_cooldown': return out('A code is on its way', `Check your inbox. ${waitText(retryAfterSeconds(e))}`)
    case 'invalid_credentials': return out('Email or password is wrong', 'Try again, or sign in with an email code.')
    case 'invalid_current_password': return out('Current password is wrong', 'Check it and try again.')
    case 'insufficient_credits': return out('Not enough credits', e.detail)
    case 'validation_failed': return out('Check the form', e.fieldErrors[0]?.message ?? e.detail)
  }
  if (e.status === 429) return out('Too many tries', waitText(retryAfterSeconds(e)))
  if (e.status === 401) return out('Sign in again', e.detail || 'Your session has ended.')
  if (e.status === 403) return out('Not allowed', e.detail)
  if (e.status === 404) return out('Not found', e.detail)
  if (e.status >= 500) return out('Frameline is having trouble', 'Try again in a minute.')
  return out('That didn’t work', e.detail)
}

/** One-line version for inline form errors. */
export const errorText = (e: unknown) => { const f = friendlyError(e); return `${f.title}. ${f.detail}` }

export const errorCode = (e: unknown) => (e instanceof ApiError ? e.code : undefined)
