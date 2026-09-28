import type { PhotoEvent } from '@frameline/shared'

export function greeting(now = Date.now()) {
  const h = new Date(now).getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const firstName = (name?: string) => (name ?? '').trim().split(/\s+/)[0] ?? ''

const are = (n: number, noun: string) => (n === 1 ? `1 ${noun} is` : `${n} ${noun}s are`)
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`)

/** Home's one-sentence status: "2 events are live. Tessera Labs Offsite is still uploading." */
export function statusSentence(events: PhotoEvent[], uploadingIds: Set<string>) {
  const active = events.filter((e) => e.status !== 'archived')
  const live = active.filter((e) => e.status === 'live' || e.status === 'expiring').length
  const uploading = active.filter((e) => e.status === 'uploading' || uploadingIds.has(e.id)).map((e) => e.name)
  const drafts = active.filter((e) => e.status === 'draft' && e.photoCount === 0)
  const parts: string[] = []
  if (live) parts.push(`${are(live, 'event')} live.`)
  if (uploading.length) parts.push(`${list(uploading)} ${uploading.length === 1 ? 'is' : 'are'} still uploading.`)
  if (!parts.length && drafts.length) parts.push(`${drafts[0].name} is waiting for photos.`)
  return parts.join(' ') || 'Nothing is live right now. Create an event when your next shoot is booked.'
}
