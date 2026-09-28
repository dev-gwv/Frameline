import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, ExternalLink, ImageIcon, Play, Share2, Upload } from 'lucide-react'
import { fmt, type PhotoEvent, type Studio, type WatermarkSettings } from '@frameline/shared'
import { Button, Card, ChecklistSteps, CoverMosaic, EventStatusChip, IconTile, Modal, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { daysLeft, recentFirst } from '../events/lib'

/** The event the next step is about: the newest one without photos, else the newest one. */
export function focusEvent(events: PhotoEvent[]) {
  const active = recentFirst(events.filter((e) => e.status !== 'archived'))
  return active.find((e) => e.photoCount === 0) ?? active[0]
}

/** First run: one clear next step instead of an events row. */
export function NextStepCard({ event }: { event?: PhotoEvent }) {
  const navigate = useNavigate()
  const [, set] = useParamState()
  if (!event) {
    return (
      <Card padded={false} className="grid overflow-hidden sm:grid-cols-[200px_1fr]">
        <div className="grid h-[120px] place-items-center bg-sunk text-ink-3 sm:h-auto"><CalendarPlus size={30} aria-hidden /></div>
        <div className="flex flex-col items-start gap-2.5 p-[18px]">
          <h2 className="font-sans text-[20px] font-extrabold tracking-normal leading-tight">Create your first event</h2>
          <p className="text-[14px] text-ink-2">An event is one gallery with one link. Three questions and you’re ready to add photos.</p>
          <Button variant="primary" className="max-sm:h-[46px] max-sm:w-full" icon={<CalendarPlus size={15} />} onClick={() => set({ new: '1' })}>New event</Button>
        </div>
      </Card>
    )
  }
  const empty = event.photoCount === 0
  return (
    <Card padded={false} className="grid overflow-hidden sm:grid-cols-[220px_1fr]">
      <CoverMosaic tones={event.coverTones} className="h-[120px] sm:h-auto sm:min-h-[180px]" empty={empty ? <ImageIcon size={30} aria-hidden /> : undefined} />
      <div className="flex flex-col items-start gap-2.5 p-[18px]">
        <EventStatusChip status={event.status} expiresInDays={daysLeft(event)} />
        <div>
          <h2 className="font-sans text-[20px] font-extrabold tracking-normal leading-tight">{event.name}</h2>
          <div className="text-[12.5px] text-ink-3">{fmt.date(event.date)} · {event.city}</div>
        </div>
        <p className="text-[14px] text-ink-2">
          {empty ? 'Next step: add photos. Guests can’t see anything until you do.' : 'Next step: share the link. Guests take a selfie and find their own photos.'}
        </p>
        <div className="flex w-full flex-wrap gap-2">
          {empty
            ? <Button variant="primary" className="max-sm:h-[46px] max-sm:flex-1" icon={<Upload size={15} />} onClick={() => navigate(`/events/${event.id}?modal=upload`)}>Add photos</Button>
            : <Button variant="primary" className="max-sm:h-[46px] max-sm:flex-1" icon={<Share2 size={15} />} onClick={() => navigate(`/events/${event.id}?modal=share`)}>Share with guests</Button>}
          <Button variant="ghost" className="max-sm:h-[46px]" onClick={() => navigate(`/events/${event.id}`)}>Open event</Button>
        </div>
      </div>
    </Card>
  )
}

/** Getting started: set up studio, first event, photos, share, watermark (optional). */
export function GettingStarted({ studio, events, watermark, event }: { studio?: Studio; events: PhotoEvent[]; watermark?: WatermarkSettings; event?: PhotoEvent }) {
  const navigate = useNavigate()
  const [, set] = useParamState()
  const hasPhotos = events.some((e) => e.photoCount > 0)
  const wmDone = !!watermark && (watermark.mode === 'logo' || !!watermark.text.trim()) && watermark.applyTo.previews
  const act = (label: string, onClick: () => void) => <Button size="sm" className="max-sm:h-10" onClick={onClick}>{label}</Button>
  return (
    <Card>
      <ChecklistSteps title="Getting started" steps={[
        { id: 'studio', title: 'Set up your studio', done: !!studio?.name.trim() && !!studio.handle, action: act('Set up', () => navigate('/setup')) },
        { id: 'event', title: 'Create your first event', done: events.length > 0, action: act('New event', () => set({ new: '1' })) },
        { id: 'photos', title: 'Add photos', done: hasPhotos, action: act('Add', () => (event ? navigate(`/events/${event.id}?modal=upload`) : set({ upload: '1' }))) },
        { id: 'share', title: 'Share with guests', done: false, action: event && hasPhotos ? act('Share', () => navigate(`/events/${event.id}?modal=share`)) : undefined },
        { id: 'wm', title: 'Set your watermark (optional)', done: wmDone, action: act('Set', () => navigate('/watermark')) },
      ]} />
    </Card>
  )
}

const VIDEOS = [
  { lang: 'English', url: 'https://www.youtube.com/results?search_query=frameline+first+event' },
  { lang: 'हिन्दी', url: 'https://www.youtube.com/results?search_query=frameline+first+event+hindi' },
]

export function VideoCard() {
  const [open, setOpen] = useState(false)
  return (
    <Card className="flex items-center gap-3">
      <IconTile><Play size={15} aria-hidden /></IconTile>
      <div className="min-w-0 flex-1">
        <b className="text-[14px]">Watch: your first event in 3 minutes</b>
        <div className="text-[13px] text-ink-2">English and हिन्दी</div>
      </div>
      <Button size="sm" className="max-sm:h-10" onClick={() => setOpen(true)}>Watch</Button>
      <Modal open={open} onOpenChange={setOpen} title="Your first event in 3 minutes" description="Create an event, add photos and share the link. Pick a language; it opens on YouTube." width={420}>
        <div className="flex flex-col gap-2">
          {VIDEOS.map((v) => (
            <a key={v.lang} href={v.url} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center gap-3 rounded-[10px] border border-line px-3.5 hover:bg-sunk">
              <Play size={16} className="text-accent-text" aria-hidden /><b className="flex-1 text-[14px]">Watch in {v.lang}</b><ExternalLink size={14} className="text-ink-3" aria-hidden />
            </a>
          ))}
        </div>
      </Modal>
    </Card>
  )
}

const HEARD = ['Instagram', 'A friend or another photographer', 'Google search', 'YouTube', 'A guest gallery I saw', 'Other']
const HEARD_SKIP = 'frameline.heard-skipped'

/** The one optional question, moved out of setup: shown after the first event exists. */
export function HeardAboutCard({ studio }: { studio?: Studio }) {
  const api = useApi()
  const toast = useToast()
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HEARD_SKIP) === '1' } catch { return false } })
  const save = useAction((referralSource: string) => api.updateStudio({ referralSource }), { onSuccess: () => toast.success('Thanks for telling us') })
  if (!studio || studio.referralSource || hidden) return null
  const skip = () => { try { localStorage.setItem(HEARD_SKIP, '1') } catch { /* ignore */ } setHidden(true) }
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sans text-[15px] font-extrabold tracking-normal">One quick question: how did you hear about Frameline?</h2>
        <button type="button" className="text-[12.5px] font-bold text-ink-3 hover:text-ink max-sm:min-h-[40px]" onClick={skip}>Skip</button>
      </div>
      <p className="mb-2.5 text-[13px] text-ink-2">Optional. It helps us reach more photographers like you.</p>
      <div className="flex flex-wrap gap-2">
        {HEARD.map((h) => (
          <Button key={h} size="sm" className="max-sm:h-10" disabled={save.isPending} loading={save.isPending && save.variables === h} onClick={() => save.mutate(h)}>{h}</Button>
        ))}
      </div>
    </Card>
  )
}
