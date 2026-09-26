import { useEffect, useMemo } from 'react'
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { Archive, CalendarX, Clock, EyeOff, SearchX } from 'lucide-react'
import { Button, Skeleton } from '@frameline/ui'
import { fmt, type Photo, type PhotoEvent, type Studio } from '@frameline/shared'
import { useEvent, useMatches, useStudio } from '../lib/queries'
import { rememberEvent, useSession, type EventSession } from '../lib/guest'
import { useBrandColor } from '../lib/brand'
import { canSeeAll, eventBlock, needsAppChoice, needsPin, needsRegistration } from '../lib/access'
import { AppInterstitial, PinGate, RegistrationGate } from '../components/Gates'
import { StatePage } from '../components/common'

export interface EventCtx {
  event: PhotoEvent
  studio: Studio
  session: EventSession
  /** "/6402f9f" */
  base: string
  seeAll: boolean
  matches: Photo[] | undefined
  matchesLoading: boolean
  ownIds: Set<string>
}

export const useEventCtx = () => useOutletContext<EventCtx>()

export function EventLayout() {
  const { shortId = '' } = useParams()
  const eventQ = useEvent(shortId)
  const studioQ = useStudio()
  const session = useSession(shortId)
  const event = eventQ.data
  const matchQ = useMatches(event?.id, session.match?.personId)
  useBrandColor(studioQ.data?.brandColor)

  useEffect(() => {
    if (event) {
      rememberEvent({ shortId: event.shortId, name: event.name, date: event.date, city: event.city, tone: event.coverTones[0] })
      document.title = `${event.name} · Photos`
    }
    return () => { document.title = 'Frameline · Your photos' }
  }, [event])

  const ownIds = useMemo(() => new Set((matchQ.data ?? []).map((p) => p.id)), [matchQ.data])

  if (eventQ.isLoading || studioQ.isLoading) {
    return (
      <main className="mx-auto w-full max-w-md" aria-busy aria-label="Loading gallery">
        <Skeleton className="h-[300px] rounded-none" />
        <div className="flex flex-col gap-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-40" /></div>
      </main>
    )
  }
  if (eventQ.isError || !event) {
    return (
      <StatePage icon={<SearchX size={26} />} eyebrow={`Code ${shortId.toUpperCase()}`} title="We couldn't find this gallery"
        body="Check the link or the event code on your invite. Codes are 7 letters and numbers, like 6402F9F.">
        <Link to="/"><Button variant="primary" size="lg">Enter a code</Button></Link>
      </StatePage>
    )
  }
  if (studioQ.isError || !studioQ.data) {
    return (
      <StatePage title="The gallery didn't load" body="Check your connection and try again.">
        <Button variant="primary" size="lg" onClick={() => { void eventQ.refetch(); void studioQ.refetch() }}>Try again</Button>
      </StatePage>
    )
  }
  const studio = studioQ.data

  const block = eventBlock(event)
  if (block) {
    const contact = (
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`tel:${studio.phone.replace(/\s/g, '')}`}><Button size="lg">Call {studio.name}</Button></a>
        <a href={`mailto:${studio.email}?subject=${encodeURIComponent(event.name)}`}><Button size="lg">Email</Button></a>
      </div>
    )
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
    ownIds,
  }
  return <Outlet context={ctx} />
}
