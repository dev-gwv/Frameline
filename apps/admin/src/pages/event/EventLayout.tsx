import type { ReactNode } from 'react'
import { NavLink, Outlet, useMatch, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Archive, Eye, Film, HardDriveDownload, MoreHorizontal, ScanFace, Share2, Upload } from 'lucide-react'
import { fmt, type EventStats, type PhotoEvent } from '@frameline/shared'
import { Button, CountBadge, EventStatusChip, Menu, Skeleton, cn, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useEvent, useEventStats, useGuestsAttention } from '../../lib/queries'
import { BackLink, galleryUrl, useModalParam } from '../../lib/url'
import { EventModals } from '../workspace/EventModals'
import { QueryError } from '../system'

/** What EventLayout gives its tabs: `const { event } = useEventContext()`. */
export interface EventContext { event: PhotoEvent }
export const useEventContext = () => useOutletContext<EventContext>()

/** Words for face finding still running, e.g. "finding faces in 212 new photos" (null when done or off). */
export function findingFaces(e: PhotoEvent, stats?: EventStats) {
  const n = stats?.faces.pending ?? 0
  return e.settings.faceSearch && n > 0 ? `finding faces in ${fmt.count(n)} new ${n === 1 ? 'photo' : 'photos'}` : null
}

/** "12–14 Sep 2026 · Udaipur · 1,248 of 2,000 photos · PIN 5211" (+ "finding faces in N new photos" while that runs). */
export function eventFacts(e: PhotoEvent, stats?: EventStats) {
  return [
    fmt.dateRange(e.date, e.endDate),
    e.city,
    `${fmt.count(e.photoCount)} of ${fmt.count(e.photoLimit)} photos`,
    findingFaces(e, stats),
    e.settings.access === 'link-pin' && e.settings.pin ? `PIN ${e.settings.pin}` : null,
  ].filter(Boolean).join(' · ')
}

/**
 * /events/:eventId — shared header + tabs for Photos (index), Guests and Settings.
 * Header: Back to Events · name + status chip · one facts line · ⋯ menu · Upload · Share (the gold button).
 * Modals open with `?modal=` (see EventModals) so they work from every tab and from links.
 * Tabs read the event with `useEventContext()` instead of fetching it again.
 */
export default function EventLayout() {
  const { eventId = '' } = useParams()
  const q = useEvent(eventId)
  const event = q.data

  if (q.isError) return <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6"><BackLink to="/events">Events</BackLink><QueryError error={q.error} retry={() => q.refetch()} /></div>
  if (!event) return <HeaderSkeleton />

  return (
    <>
      <EventHeader event={event} />
      <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-1 flex-col px-4 py-[18px] sm:px-6">
        <Outlet context={{ event } satisfies EventContext} />
      </div>
      <EventModals event={event} />
    </>
  )
}

function EventHeader({ event }: { event: PhotoEvent }) {
  const m = useModalParam()
  const navigate = useNavigate()
  const api = useApi()
  const toast = useToast()
  const badge = useGuestsAttention(event.id)
  const stats = useEventStats(event.id).data
  const finding = findingFaces(event, stats)

  const archive = async () => {
    const before = event.status
    try {
      await api.updateEvent(event.id, { status: 'archived' })
      toast.undo(`${event.name} archived. Guests can’t open it now.`, () => {
        api.updateEvent(event.id, { status: before }).catch((e) => toast.error('Couldn’t restore the event', errorMessage(e)))
      })
      navigate('/events')
    } catch (e) {
      toast.error('Couldn’t archive the event', errorMessage(e))
    }
  }
  const restore = () => api.updateEvent(event.id, { status: event.photoCount ? 'live' : 'draft' })
    .then(() => toast.success(`${event.name} is back`)).catch((e) => toast.error('Couldn’t restore the event', errorMessage(e)))

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <BackLink to="/events">Events</BackLink>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="font-display text-[20px] font-semibold leading-tight sm:text-[24px]">{event.name}</h1>
              <EventStatusChip status={event.status} expiresInDays={fmt.daysUntil(event.expiresAt)} />
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-2 tnum">{eventFacts(event, stats)}</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Menu
              width={300}
              items={[
                { label: 'Preview as a guest', description: 'Opens the gallery in a new tab', icon: <Eye size={16} />, onSelect: () => window.open(galleryUrl(event.shortId), '_blank', 'noopener') },
                { label: 'Import from Google Drive', description: 'Bring in a finished shoot', icon: <HardDriveDownload size={16} />, onSelect: () => m.open('import') },
                { label: 'Films', description: 'Add YouTube videos to the gallery', icon: <Film size={16} />, onSelect: () => m.open('films') },
                { label: 'Face finding', description: !event.settings.faceSearch ? 'Off for this event' : finding ? finding[0].toUpperCase() + finding.slice(1) : `${fmt.count(stats?.faces.total ?? event.photoCount)} photos done`, icon: <ScanFace size={16} />, onSelect: () => m.open('faces') },
                'separator',
                event.status === 'archived'
                  ? { label: 'Restore event', description: 'Guests can open it again', icon: <Archive size={16} />, onSelect: () => void restore() }
                  : { label: 'Archive event', description: 'Hides it from guests; restore any time', icon: <Archive size={16} />, onSelect: () => void archive() },
              ]}
              trigger={<Button variant="ghost" size="icon" aria-label="More event actions" className="max-sm:h-11 max-sm:w-11"><MoreHorizontal size={18} /></Button>}
            />
            <Button icon={<Upload size={15} />} onClick={() => m.open('upload')} className="max-sm:h-11 max-sm:flex-1">Upload</Button>
            <Button variant="primary" icon={<Share2 size={15} />} onClick={() => m.open('share', { tab: 'link' })} className="max-sm:h-11 max-sm:flex-1">Share</Button>
          </div>
        </div>
        <nav aria-label="Event sections" className="mt-3 flex gap-[22px] overflow-x-auto scrollbar-none sm:mt-3.5">
          <Tab to={`/events/${event.id}`} end>Photos</Tab>
          <Tab to={`/events/${event.id}/guests`}>Guests{badge > 0 && <CountBadge n={badge} className="ml-1.5" />}</Tab>
          <Tab to={`/events/${event.id}/settings`}>Settings</Tab>
        </nav>
      </div>
    </div>
  )
}

function Tab({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  const active = !!useMatch({ path: to, end: !!end })
  return (
    <NavLink to={to} end={end} className={cn('inline-flex min-h-[40px] shrink-0 items-center pb-2.5 pt-1 text-[14px] font-bold transition-colors',
      active ? 'text-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-ink-3 hover:text-ink-2')}>
      {children}
    </NavLink>
  )
}

function HeaderSkeleton() {
  return (
    <div className="border-b border-line bg-surface" aria-busy="true" aria-label="Loading event">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 pb-3 pt-4 sm:px-6">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="mt-2 flex gap-5"><Skeleton className="h-5 w-14" /><Skeleton className="h-5 w-14" /><Skeleton className="h-5 w-14" /></div>
      </div>
    </div>
  )
}
