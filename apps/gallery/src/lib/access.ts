import type { Photo, PublicEvent } from '@frameline/shared'
import { authValid, type EventSession } from './guest'

/**
 * Client-side mirror of the API's guest rules, used to pick the right screen. The API enforces them
 * (401 pin_required / registration_required, 403 face_privacy, 429 pin_locked); api.tsx resets the
 * matching gate when it answers that way.
 */

/** Not tracked by the API: counted per guest on this device. */
export const MAX_DOWNLOAD_ALL = 5
/** Bigger batches are offered as an emailed ZIP instead of one-by-one downloads. */
export const DIRECT_DOWNLOAD_LIMIT = 12

export const needsPin = (e: PublicEvent, s: EventSession) => e.settings.access === 'link-pin' && !(s.pin && authValid(s))

export function needsRegistration(e: PublicEvent, s: EventSession) {
  if (!(e.settings.requireRegistration || e.settings.access === 'registered') || s.vip?.skipLogin) return false
  if (!s.registration) return true
  // 'registered' galleries need a live session with a guest id (tokens last 12 hours).
  return e.settings.access === 'registered' && !(authValid(s) && s.auth?.guestId)
}

export const needsAppChoice = (e: PublicEvent, s: EventSession) => !e.settings.skipAppLanding && !s.webChosen && !s.vip?.skipLogin

/**
 * Whether the guest may browse every photo. With face privacy on, only their own matches are visible —
 * unless the API session says "see all" (a typed PIN, or a VIP link with "See all photos").
 */
export const canSeeAll = (e: PublicEvent, s: EventSession) =>
  !e.settings.facePrivacy || !e.settings.faceSearch || (authValid(s) && !!s.auth?.seeAll)

export type Verdict = { ok: true } | { ok: false; reason: string; buy?: boolean; selfie?: boolean }

/** Single-photo download policy. `own` = the guest is in this photo (selfie match). */
export function canDownload(e: PublicEvent, s: EventSession, photo: Photo, own: boolean): Verdict {
  if (s.purchased.includes(photo.id)) return { ok: true }
  const d = e.settings.downloads
  if (d === 'none') {
    return { ok: false, reason: 'The photographer has turned off downloads for this event.', buy: e.settings.storeEnabled }
  }
  if (d === 'all') return { ok: true }
  if (own) return { ok: true }
  return { ok: false, reason: 'You can download the photos you are in. Take a selfie to find them.', selfie: e.settings.faceSearch, buy: e.settings.storeEnabled }
}

/**
 * Download all (an album or the whole event): 5 uses per guest on this device. PIN galleries ask for the PIN
 * each time (checked by api.verifyPin) unless it came embedded in a VIP link. Galleries without a PIN gate skip
 * the PIN step: the API can only check a PIN for 'link-pin' galleries.
 */
export function canDownloadAll(e: PublicEvent, s: EventSession): Verdict & { needsPin?: boolean; left?: number } {
  if (e.settings.downloads === 'none') {
    return { ok: false, reason: 'The photographer has turned off downloads for this event.', buy: e.settings.storeEnabled }
  }
  const left = MAX_DOWNLOAD_ALL - s.downloadAllUses
  if (left <= 0) return { ok: false, reason: `Download all has been used ${MAX_DOWNLOAD_ALL} times on this device. Ask the studio to send you a ZIP.` }
  return { ok: true, needsPin: e.settings.access === 'link-pin' && s.pin !== 'embedded', left }
}

/** Returns white or near-black, whichever reads better on the given hex colour. */
export function inkOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  return L > 0.4 ? '#1B1712' : '#FFFFFF'
}
