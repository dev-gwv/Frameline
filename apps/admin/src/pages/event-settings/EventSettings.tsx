import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarX2, CheckCircle2, Eye } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Chip, EmptyState, PageHeader, Skeleton } from '@frameline/ui'
import { useEvent } from '../../lib/queries'
import { GALLERY_URL } from '../events/lib'
import { QueryError } from '../system'
import { GuestSummary } from './GuestSummary'
import { SectionNavDesktop, SectionNavMobile, useScrollSpy } from './SectionNav'
import { BrandingSection, GuestUploadsSection, StoreSection, WatermarkSection, WebsiteSection } from './SectionsContent'
import { DownloadsSection } from './SectionsDownloads'
import { DangerSection, HostsSection } from './SectionsHosts'
import { AccessSection, FacesSection, GeneralSection, type SectionProps } from './SectionsPrivacy'
import { useEventSaver } from './useEventSaver'

function SaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 20_000); return () => clearInterval(t) }, [])
  if (saving) return <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status"><span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />Saving…</span>
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
      <CheckCircle2 size={13} className="text-ok" aria-hidden />
      All changes saved{savedAt ? ` · ${fmt.ago(new Date(savedAt).toISOString(), Date.now())}` : ''}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-7" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-4 w-40" /><Skeleton className="h-8 w-56" />
      <div className="grid gap-5 xl:grid-cols-[168px_1fr_290px]">
        <Skeleton className="hidden h-80 xl:block" />
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

export default function EventSettings() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const q = useEvent(eventId)
  const event = q.data
  const { saveSettings, saveEvent, saving, savedAt } = useEventSaver(eventId)
  const { active, jump } = useScrollSpy(!!event)

  // Deep links may use the short ID; settle on the internal ID so edits to the short ID keep working.
  useEffect(() => {
    if (event && eventId && eventId !== event.id) navigate(`/events/${event.id}/settings`, { replace: true })
  }, [event, eventId, navigate])

  if (q.isLoading) return <LoadingState />
  if (q.error || !event) {
    const notFound = q.error instanceof Error && /not found/i.test(q.error.message)
    if (notFound || !q.error) {
      return (
        <EmptyState
          icon={<CalendarX2 size={24} />} title="We couldn’t find this event"
          body="It may have been deleted, or the link has an old event ID."
          action={<Button variant="primary" onClick={() => navigate('/events')}>Go to Events</Button>}
        />
      )
    }
    return <QueryError error={q.error} retry={() => q.refetch()} />
  }

  const props: SectionProps = { event, set: saveSettings, update: saveEvent }

  return (
    <div className="pb-16">
      <PageHeader
        crumb={<Link to={`/events/${event.id}`} className="hover:text-ink hover:underline">{event.name} /</Link>}
        title={<span className="inline-flex flex-wrap items-center gap-2.5">Event settings{event.settings.disabled && <Chip tone="warn" className="font-sans">Disabled</Chip>}</span>}
        actions={<>
          <SaveIndicator saving={saving} savedAt={savedAt} />
          <Button icon={<Eye size={14} />} onClick={() => window.open(`${GALLERY_URL}/${event.shortId}`, '_blank', 'noopener,noreferrer')}>Preview as guest</Button>
        </>}
      />
      <SectionNavMobile active={active} onJump={jump} />
      <div className="grid items-start gap-5 px-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[168px_minmax(0,1fr)_290px]">
        <SectionNavDesktop active={active} onJump={jump} />
        <div className="flex min-w-0 flex-col gap-3">
          <GeneralSection {...props} />
          <AccessSection {...props} />
          <FacesSection {...props} />
          <DownloadsSection {...props} />
          <GuestUploadsSection {...props} />
          <WatermarkSection {...props} />
          <BrandingSection />
          <StoreSection {...props} />
          <HostsSection {...props} />
          <WebsiteSection {...props} />
          <DangerSection {...props} />
        </div>
        <aside className="flex flex-col gap-3 lg:sticky lg:top-16 xl:top-6" aria-label="Summary">
          <GuestSummary event={event} onManageHosts={() => jump('hosts')} />
        </aside>
      </div>
    </div>
  )
}
