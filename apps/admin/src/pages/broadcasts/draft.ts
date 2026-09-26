import type { PhotoEvent } from '@frameline/shared'

export const TITLE_MAX = 60
export const BODY_MAX = 240

export interface Draft {
  title: string
  body: string
  /** Data URL of the chosen image (sent as imageUrl). */
  image?: string
  audience: 'all' | 'event'
  eventId: string
}

export const emptyDraft = (eventId = ''): Draft => ({ title: '', body: '', audience: 'all', eventId })

/** Guests of an event who have the app (and so can get a push). */
export const eventReach = (e: PhotoEvent) => e.visits.android + e.visits.ios

export function audienceSize(d: Draft, events: PhotoEvent[], followers: number) {
  if (d.audience === 'all') return followers
  const e = events.find((x) => x.id === d.eventId)
  return e ? eventReach(e) : 0
}
