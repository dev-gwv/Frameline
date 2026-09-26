import type { PhotoEvent } from '@frameline/shared'

export const TITLE_MAX = 60
export const BODY_MAX = 240

/** Follower count is a constant until the API exposes followers. */
export const FOLLOWERS = 1920

export interface Draft {
  title: string
  body: string
  /** Object URL for the chosen image (the API has no image field yet). */
  image?: string
  audience: 'all' | 'event'
  eventId: string
}

export const emptyDraft = (eventId = ''): Draft => ({ title: '', body: '', audience: 'all', eventId })

/** Guests of an event who have the app (and so can get a push). */
export const eventReach = (e: PhotoEvent) => e.visits.android + e.visits.ios

export function audienceSize(d: Draft, events: PhotoEvent[]) {
  if (d.audience === 'all') return FOLLOWERS
  const e = events.find((x) => x.id === d.eventId)
  return e ? eventReach(e) : 0
}
