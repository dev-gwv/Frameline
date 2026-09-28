import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Upload } from 'lucide-react'
import { Button, EmptyState, Page, Skeleton } from '@frameline/ui'
import { useAuth } from '../../lib/auth'
import { useEvents, useStudio, useWatermark } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { useUploads } from '../../layout/UploadDock'
import { QueryError } from '../system'
import { EventCard, EventCardSkeleton } from '../events/EventCard'
import { NewEventModal } from '../events/NewEventModal'
import { recentFirst, totalVisits } from '../events/lib'
import { useEventActions } from '../events/useEventActions'
import { focusEvent, GettingStarted, HeardAboutCard, NextStepCard, VideoCard } from './FirstRun'
import { FollowCard, HelpCard, PlanCard } from './HomeCards'
import { NeedsYouCard } from './NeedsYouCard'
import { UploadPicker } from './UploadPicker'
import { firstName, greeting, statusSentence } from './stats'

/**
 * Home answers one question: what do I do next? Greeting + status, your events, Needs you, and three
 * small cards. A studio that hasn't shared anything yet gets the first-run version instead.
 * Deep links: /?upload=1 (upload picker), /?new=1 (New event).
 */
export default function Home() {
  const { user } = useAuth()
  const [params, set] = useParamState()
  const studio = useStudio()
  const events = useEvents()
  const watermark = useWatermark()
  const { jobs } = useUploads()
  const list = useMemo(() => events.data ?? [], [events.data])
  const { actions, dialogs } = useEventActions(list)

  const name = firstName(user?.name) || studio.data?.name || ''
  // First run until guests have opened something: nothing is shared yet.
  // (Development: /?preview=firstrun shows it with the sample data.)
  const firstRun = !!events.data && (!list.some((e) => totalVisits(e) > 0) || (import.meta.env.DEV && params.get('preview') === 'firstrun'))
  const uploadingIds = new Set(jobs.filter((j) => j.state !== 'done' && j.done < j.total).map((j) => j.eventId))
  const recent = recentFirst(list.filter((e) => e.status !== 'archived')).slice(0, 3)

  const modals = <>
    <UploadPicker events={list} loading={events.isLoading} />
    <NewEventModal />
    {dialogs}
  </>

  if (events.error) {
    return <Page title={`${greeting()}${name ? `, ${name}` : ''}`}><QueryError error={events.error} retry={() => events.refetch()} what="your events" />{modals}</Page>
  }

  if (firstRun) {
    const ev = focusEvent(list)
    return (
      <Page title={`Welcome to Frameline${name ? `, ${name}` : ''}`}
        subtitle={ev ? 'Your studio is ready. Two steps to your first delivery.' : 'Your studio is ready. Create your first event to get going.'}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <NextStepCard event={ev} />
          <GettingStarted studio={studio.data} events={list} watermark={watermark.data} event={ev} />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {list.length > 0 && <HeardAboutCard studio={studio.data} />}
          <VideoCard />
        </div>
        {modals}
      </Page>
    )
  }

  return (
    <Page
      title={`${greeting()}${name ? `, ${name}` : ''}`}
      subtitle={events.data ? statusSentence(list, uploadingIds) : <Skeleton className="mt-1 h-4 w-72 max-w-full" />}
      actions={<>
        <Button icon={<Upload size={15} />} className="max-sm:h-[46px] max-sm:flex-1" onClick={() => set({ upload: '1' })}>Upload photos</Button>
        <Button variant="primary" icon={<Plus size={15} />} className="max-sm:h-[46px] max-sm:flex-1" onClick={() => set({ new: '1' })}>New event</Button>
      </>}>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section aria-labelledby="your-events" className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 id="your-events" className="font-sans text-[15px] font-extrabold tracking-normal">Your events</h2>
            {list.length > 0 && (
              <Link to="/events" className="inline-flex min-h-[32px] items-center gap-0.5 text-[13px] font-bold text-accent-text hover:underline">
                See all {list.length}<ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </div>
          {events.isLoading ? (
            <div className="grid gap-3.5 min-[480px]:grid-cols-2 md:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <EventCardSkeleton key={i} />)}</div>
          ) : recent.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-2">
              <EmptyState className="py-10" title="No events on show" body="Everything is archived. Create an event for your next shoot, or restore one from Events."
                action={<Link to="/events?f=archived" className="text-[13px] font-bold text-accent-text hover:underline">See archived events</Link>} />
            </div>
          ) : (
            <div className="grid gap-3.5 min-[480px]:grid-cols-2 md:grid-cols-3">
              {recent.map((e) => <EventCard key={e.id} event={e} actions={actions} />)}
            </div>
          )}
        </section>
        <NeedsYouCard className="max-lg:order-first" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <PlanCard />
        <FollowCard />
        <HelpCard />
      </div>
      {modals}
    </Page>
  )
}
