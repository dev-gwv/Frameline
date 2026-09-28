import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useEventContext } from '../event/EventLayout'
import { AddPhotosModal } from './AddPhotosModal'
import { DetailsModal } from './DetailsModal'
import { DownloadLogModal, DownloadsModal } from './DownloadsModal'
import { HostsCard, LimitCard, LookCard, SellingCard, TurnOffCard } from './LowerCards'
import { guestSentence, SaveIndicator, type CardProps } from './parts'
import { AccessCard, DownloadsCard, FacesCard, GuestUploadsCard } from './TopCards'
import { useEventSaver } from './useEventSaver'

type Dialog = 'downloads' | 'log' | 'add-photos' | 'details' | null

/**
 * /events/:eventId/settings — a tab inside EventLayout (no own header).
 * "Guests can: …" sentence + autosave indicator, then a two-column grid of cards with toggle rows (one column on phones).
 * Every change saves straight away; only a new PIN and turning the gallery off ask first.
 */
export default function EventSettings() {
  const { eventId } = useParams()
  const { event } = useEventContext()
  const { hash } = useLocation()
  const { saveSettings, saveEvent, saving } = useEventSaver(eventId)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dlSession, setDlSession] = useState(0)
  const props: CardProps = { event, set: saveSettings, update: saveEvent }
  const close = (v: boolean) => { if (!v) setDialog(null) }

  // Links like /settings#hosts (from Guests) jump to that card.
  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [hash])

  return (
    <div className="flex flex-col gap-3.5 pb-12">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3.5">
        <p className="flex-1 rounded-card bg-accent-soft px-4 py-[11px] text-[13.5px]" aria-live="polite">
          <b>Guests can:</b> <span className="text-ink-2">{guestSentence(event.settings)}</span>
        </p>
        <SaveIndicator saving={saving} />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <AccessCard {...props} />
        <FacesCard {...props} />
        <DownloadsCard {...props} onChange={() => { setDlSession((n) => n + 1); setDialog('downloads') }} />
        <GuestUploadsCard {...props} />
        <LookCard {...props} />
        <SellingCard {...props} />
        <HostsCard {...props} />
        <LimitCard {...props} onAdd={() => setDialog('add-photos')} onDetails={() => setDialog('details')} />
        <TurnOffCard {...props} />
      </div>

      <DownloadsModal open={dialog === 'downloads'} onOpenChange={close} event={event} set={saveSettings} onLog={() => setDialog('log')} session={dlSession} />
      <DownloadLogModal open={dialog === 'log'} onOpenChange={close} eventId={event.id} onBack={() => setDialog('downloads')} />
      <AddPhotosModal open={dialog === 'add-photos'} onOpenChange={close} event={event} />
      <DetailsModal open={dialog === 'details'} onOpenChange={close} event={event} update={saveEvent} />
    </div>
  )
}
