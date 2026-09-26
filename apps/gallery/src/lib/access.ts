import { DEMO_NOW, type Photo, type PhotoEvent } from '@frameline/shared'
import type { EventSession } from './guest'

export const MAX_PIN_TRIES = 5
export const PIN_LOCK_MS = 15 * 60_000
export const MAX_DOWNLOAD_ALL = 5
/** Bigger batches are offered as an emailed ZIP instead of one-by-one downloads. */
export const DIRECT_DOWNLOAD_LIMIT = 12

/** Sample data is dated around DEMO_NOW; use whichever is later so demo events don't expire early. */
export const now = () => Math.max(Date.now(), DEMO_NOW)

export type EventBlock = 'disabled' | 'expired' | 'archived' | 'draft' | null
export function eventBlock(e: PhotoEvent): EventBlock {
  if (e.settings.disabled) return 'disabled'
  if (e.status === 'archived') return 'archived'
  if (new Date(e.expiresAt).getTime() < now()) return 'expired'
  if (e.status === 'draft' && e.photoCount === 0) return 'draft'
  return null
}

export const needsPin = (e: PhotoEvent, s: EventSession) => e.settings.access === 'link-pin' && !s.pin
export const needsRegistration = (e: PhotoEvent, s: EventSession) =>
  (e.settings.requireRegistration || e.settings.access === 'registered') && !s.registration && !s.vip?.skipLogin
export const needsAppChoice = (e: PhotoEvent, s: EventSession) => !e.settings.skipAppLanding && !s.webChosen && !s.vip?.skipLogin

/**
 * Whether the guest may browse every photo. With face privacy on, only their own matches are visible —
 * unless they typed the PIN (the PIN "shows every photo") or hold a VIP link with "See all photos".
 */
export const canSeeAll = (e: PhotoEvent, s: EventSession) =>
  !e.settings.facePrivacy || !e.settings.faceSearch || s.pin === 'typed' || !!s.vip?.all

export type Verdict = { ok: true } | { ok: false; reason: string; buy?: boolean; selfie?: boolean }

/** Single-photo download policy. `own` = the guest is in this photo (selfie match). */
export function canDownload(e: PhotoEvent, s: EventSession, photo: Photo, own: boolean): Verdict {
  if (s.purchased.includes(photo.id)) return { ok: true }
  const d = e.settings.downloads
  if (d === 'none') {
    return { ok: false, reason: 'The photographer has turned off downloads for this event.', buy: e.settings.storeEnabled }
  }
  if (d === 'all') return { ok: true }
  if (own) return { ok: true }
  return { ok: false, reason: 'You can download the photos you are in. Take a selfie to find them.', selfie: e.settings.faceSearch, buy: e.settings.storeEnabled }
}

/** Download all (an album or the whole event): PIN-gated, 5 uses per guest. */
export function canDownloadAll(e: PhotoEvent, s: EventSession): Verdict & { needsPin?: boolean; left?: number } {
  if (e.settings.downloads === 'none') {
    return { ok: false, reason: 'The photographer has turned off downloads for this event.', buy: e.settings.storeEnabled }
  }
  const left = MAX_DOWNLOAD_ALL - s.downloadAllUses
  if (left <= 0) return { ok: false, reason: `Download all has been used ${MAX_DOWNLOAD_ALL} times on this device. Ask the studio to send you a ZIP.` }
  return { ok: true, needsPin: s.pin !== 'embedded', left }
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
