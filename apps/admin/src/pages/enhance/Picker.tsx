import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Wand2 } from 'lucide-react'
import { Card, Chip, EmptyState, Field, PageHeader, PhotoTile, Select, Skeleton } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { usePhotos, useEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { PRESETS } from './presets'
import { Tutorial } from './Tutorial'

/** /enhance without a photo: pick one of the recent photos. */
export function Picker({ credits }: { credits?: number }) {
  const navigate = useNavigate()
  const events = useEvents()
  const withPhotos = (events.data ?? []).filter((e) => e.photoCount > 0)
  const [eventId, setEventId] = useState<string>()
  useEffect(() => {
    if (!eventId && withPhotos.length) setEventId((withPhotos.find((e) => e.status === 'live') ?? withPhotos[0]).id)
  }, [eventId, withPhotos])
  const photos = usePhotos(eventId, { limit: 24, sort: 'sequence' })

  return (
    <div className="pb-10">
      <PageHeader title="AI enhance" subtitle="Hero-grade edits on single photos, without leaving Frameline."
        actions={credits !== undefined && <Chip tone="accent">Balance {fmt.count(credits)} credits</Chip>} />
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-[15px] font-semibold">Pick a photo</h3>
              <p className="text-[12px] text-ink-2">Recent photos from the event. Click one to open the editor.</p>
            </div>
            <Field label="Event" htmlFor="enh-event" className="w-full sm:w-64">
              <Select id="enh-event" value={eventId ?? ''} onChange={(e) => setEventId(e.target.value)}>
                {withPhotos.map((e) => <option key={e.id} value={e.id}>{e.name}{e.status === 'live' ? ' · live' : ''}</option>)}
              </Select>
            </Field>
          </div>
          {events.error ? <QueryError error={events.error} retry={() => events.refetch()} />
            : photos.error ? <QueryError error={photos.error} retry={() => photos.refetch()} />
            : events.isLoading || photos.isLoading || !photos.data ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
            ) : !photos.data.items.length ? (
              <EmptyState icon={<Wand2 size={22} />} title="No photos to enhance yet" body="Upload photos to an event first, then come back here or use the wand on any photo." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {photos.data.items.map((p) => (
                  <PhotoTile key={p.id} tone={p.tone} url={p.url} label={p.filename} alt={p.filename}
                    onClick={() => navigate(`/enhance/${p.id}`)}
                    overlay={<span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-accent-ink"><Sparkles size={11} />Enhance</span>} />
                ))}
              </div>
            )}
        </Card>
        <div className="flex flex-col gap-3">
          <Tutorial defaultOpen />
          <Card>
            <h3 className="mb-2 font-display text-[15px] font-semibold">What it can do</h3>
            <ul className="flex flex-col gap-1.5 text-[12.5px]">
              {PRESETS.map((p) => <li key={p.id}><b>{p.label}</b> <span className="text-ink-2">— {p.hint}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
