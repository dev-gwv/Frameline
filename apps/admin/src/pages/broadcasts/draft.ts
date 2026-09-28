import type { PhotoEvent } from '@frameline/shared'

export const TITLE_MAX = 60
export const BODY_MAX = 240

export interface Draft {
  title: string
  body: string
  /** URL of the uploaded image (sent as imageUrl). */
  image?: string
  audience: 'all' | 'event'
  /** Empty = the first event in the list. */
  eventId: string
}

export const emptyDraft = (eventId = ''): Draft => ({ title: '', body: '', audience: 'event', eventId })

/** Guests of an event who have the app (and so can get a push). */
export const eventReach = (e: PhotoEvent) => e.visits.android + e.visits.ios

/** The event the draft points at (falls back to the first event). */
export const draftEvent = (d: Draft, events: PhotoEvent[]) => events.find((x) => x.id === d.eventId) ?? events[0]

export function audienceSize(d: Draft, events: PhotoEvent[], followers: number) {
  if (d.audience === 'all' || !events.length) return followers
  const e = draftEvent(d, events)
  return e ? eventReach(e) : 0
}
