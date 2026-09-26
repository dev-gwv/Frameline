import { useEffect, useMemo } from 'react'
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { Archive, CalendarX, Clock, EyeOff, SearchX, WifiOff } from 'lucide-react'
import { Button, Skeleton } from '@frameline/ui'
import { fmt, type Photo, type PublicEvent, type PublicStudio } from '@frameline/shared'
import { useMatches, useMyOrders, usePublicEvent } from '../lib/queries'
import { rememberEvent, useSession, type EventSession } from '../lib/guest'
import { useBrandColor } from '../lib/brand'
import { canSeeAll, needsAppChoice, needsPin, needsRegistration } from '../lib/access'
import { friendlyError, isNotFound } from '../lib/errors'
import { AppInterstitial, PinGate, RegistrationGate } from '../components/Gates'
import { StatePage } from '../components/common'

export interface EventCtx {
  event: PublicEvent
  studio: PublicStudio
  session: EventSession
  /** "/6402f9f" */
  base: string
  seeAll: boolean
  matches: Photo[] | undefined
  matchesLoading: boolean
  matchesError: unknown
  retryMatches: () => void
  ownIds: Set<string>
}

export const useEventCtx = () => useOutletContext<EventCtx>()

export function EventLayout() {
  const { shortId = '' } = useParams()
  const eventQ = usePublicEvent(shortId)
  const session = useSession(shortId)
  const event = eventQ.data
  const gated = !event || !!event.blocked || needsAppChoice(event, session) || needsPin(event, session) || needsRegistration(event, session)
  const matchQ = useMatches(shortId, session.match, !gated)
  // Refreshes which photos this guest bought (unlocks their downloads on any device the orders show up on).
  useMyOrders(shortId, !gated && !!event?.settings.storeEnabled)
  useBrandColor(event?.studio.brandColor)

  useEffect(() => {
    if (event) {
      rememberEvent({ shortId: event.shortId, name: event.name, date: event.date, city: event.city, tone: event.coverTones[0] })
      document.title = `${event.name} · Photos`
    }
    return () => { document.title = 'Frameline · Your photos' }
  }, [event])

  const ownIds = useMemo(() => new Set((matchQ.data ?? []).map((p) => p.id)), [matchQ.data])

  if (eventQ.isLoading) {
    return (
      <main className="mx-auto w-full max-w-md" aria-busy aria-label="Loading gallery">
        <Skeleton className="h-[300px] rounded-none" />
        <div className="flex flex-col gap-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-40" /></div>
      </main>
    )
  }
  if (eventQ.isError || !event) {
    if (!eventQ.error || isNotFound(eventQ.error)) {
      return (
        <StatePage icon={<SearchX size={26} />} eyebrow={`Code ${shortId.toUpperCase()}`} title="We couldn't find this gallery"
          body="Check the link or the event code on your invite. Codes are 7 letters and numbers, like 6402F9F.">
          <Link to="/"><Button variant="primary" size="lg">Enter a code</Button></Link>
        </StatePage>
      )
    }
    const f = friendlyError(eventQ.error, 'The gallery didn’t load')
    return (
      <StatePage icon={<WifiOff size={26} />} eyebrow={`Code ${shortId.toUpperCase()}`} title={f.title} body={f.body}>
        <Button variant="primary" size="lg" loading={eventQ.isFetching} onClick={() => void eventQ.refetch()}>Try again</Button>
      </StatePage>
    )
  }
  const studio = event.studio

  if (event.blocked) {
    const contact = (
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`tel:${studio.phone.replace(/\s/g, '')}`}><Button size="lg">Call {studio.name}</Button></a>
        <a href={`mailto:${studio.email}?subject=${encodeURIComponent(event.name)}`}><Button size="lg">Email</Button></a>
      </div>
    )
    const block = event.blocked
    if (block === 'disabled') return <StatePage icon={<EyeOff size={26} />} eyebrow={studio.name} title="This gallery is turned off" body={`${studio.name} has paused ${event.name} for now. Your photos are safe; ask the studio when it will be back.`}>{contact}</StatePage>
    if (block === 'expired') return <StatePage icon={<CalendarX size={26} />} eyebrow={studio.name} title="This gallery has expired" body={`${event.name} was available until ${fmt.date(event.expiresAt)}. The studio can reopen it for you.`}>{contact}</StatePage>
    if (block === 'archived') return <StatePage icon={<Archive size={26} />} eyebrow={studio.name} title="This gallery has been archived" body={`${studio.name} has moved ${event.name} to their archive. Ask them to restore it or send you your photos.`}>{contact}</StatePage>
    return <StatePage icon={<Clock size={26} />} eyebrow={studio.name} title="Photos are on their way" body={`${event.name} (${fmt.date(event.date)}) has no photos yet. Save this link — it will fill up as soon as ${studio.name} uploads.`}>{contact}</StatePage>
  }

  // Gates, in order: app interstitial → PIN → registration.
  if (needsAppChoice(event, session)) return <AppInterstitial event={event} studio={studio} session={session} />
  if (needsPin(event, session)) return <PinGate event={event} studio={studio} session={session} />
  if (needsRegistration(event, session)) return <RegistrationGate event={event} studio={studio} session={session} />

  const ctx: EventCtx = {
    event, studio, session, base: `/${event.shortId.toLowerCase()}`,
    seeAll: canSeeAll(event, session),
    matches: matchQ.data, matchesLoading: matchQ.isLoading && !!session.match,
    matchesError: matchQ.error, retryMatches: () => void matchQ.refetch(),
    ownIds,
  }
  return <Outlet context={ctx} />
}
