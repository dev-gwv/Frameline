import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Eye, Heart, ScanFace, Sparkles, Upload } from 'lucide-react'
import { DEMO_NOW, fmt, toneCss, type Album, type Person, type Photo, type PhotoEvent } from '@frameline/shared'
import { cn } from '@frameline/ui'
import { SOURCE_LABEL } from '../workspace/lib'

type Tab = 'details' | 'people' | 'activity'

/** The viewer's side panel: Details · People · Activity (closed by default; I toggles it). */
export function InfoPanel({ photo, album, event, people, personName }: {
  photo: Photo; album?: Album; event?: PhotoEvent; people: Person[]; personName: (id: string) => string
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('details')
  const ids = [...new Set(photo.faces.map((f) => f.personId))]
  const inPhoto = ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[]
  const original = photo.quality === 'original'
  const uploadedAs = `${original ? 'Original file' : 'Standard'}${event && !event.settings.watermarkOff && !original ? ', watermarked' : ''}`
  const rows: [string, string][] = [
    ['Album', album?.name ?? 'Album'],
    ['Taken', `${fmt.date(photo.capturedAt)}, ${fmt.time(photo.capturedAt)}`],
    ['Camera', [photo.exif.camera, photo.exif.lens, photo.exif.exposure].filter(Boolean).join(' · ') || 'Not recorded'],
    ['Size', `${photo.exif.width} × ${photo.exif.height} · ${fmt.bytes(photo.exif.sizeBytes)}`],
    ['Uploaded as', uploadedAs],
    ['Guests', `${fmt.count(photo.views)} views · ${fmt.count(photo.downloads)} downloads · ${fmt.count(photo.favourites)} ♥`],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-[18px] text-side-ink">
      <div role="tablist" aria-label="Photo information" className="flex gap-5 border-b border-side-line">
        {([['details', 'Details'], ['people', `People${inPhoto.length ? ` ${inPhoto.length}` : ''}`], ['activity', 'Activity']] as [Tab, string][]).map(([v, label]) => (
          <button key={v} role="tab" type="button" aria-selected={tab === v} onClick={() => setTab(v)}
            className={cn('min-h-[36px] pb-2 text-[13.5px] font-bold', tab === v ? 'text-side-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-side-ink-2 hover:text-side-ink')}>{label}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'details' && (
          <dl className="flex flex-col gap-3.5">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-side-ink-2">{k}</dt>
                <dd className="text-[14px] font-semibold tnum">{v}</dd>
              </div>
            ))}
            {inPhoto.length > 0 && (
              <div>
                <dt className="mb-1.5 text-[12px] text-side-ink-2">People in this photo</dt>
                <dd className="flex flex-wrap gap-2">
                  {inPhoto.map((p) => <span key={p.id} title={personName(p.id)} className="size-9 rounded-full" style={{ background: toneCss(p.tone) }} />)}
                </dd>
              </div>
            )}
          </dl>
        )}
        {tab === 'people' && (
          photo.status === 'processing' ? <p className="text-[13px] text-side-ink-2">Faces are found a minute or two after the photo finishes uploading.</p>
            : !inPhoto.length ? <p className="flex items-center gap-2 text-[13px] text-side-ink-2"><ScanFace size={15} />No faces found in this photo.</p>
            : (
              <ul className="flex flex-col gap-1">
                {inPhoto.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => navigate(`/events/${photo.eventId}?person=${p.id}`)} className="flex w-full items-center gap-3 rounded-control px-1.5 py-1.5 text-left hover:bg-side">
                      <span className="size-10 shrink-0 rounded-full" style={{ background: toneCss(p.tone) }} />
                      <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px]">{personName(p.id)}</b><span className="text-[12px] text-side-ink-2">In {fmt.count(p.photoCount)} photos · see them all</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )
        )}
        {tab === 'activity' && (
          <ul className="flex flex-col gap-3 text-[13.5px]">
            <li className="flex items-center gap-2.5"><Upload size={15} className="text-side-gold" />Added by {photo.uploadedBy} via {SOURCE_LABEL[photo.source].toLowerCase()} · {fmt.ago(photo.capturedAt, DEMO_NOW)}</li>
            <li className="flex items-center gap-2.5"><Eye size={15} className="text-side-gold" />{fmt.count(photo.views)} guest {photo.views === 1 ? 'view' : 'views'}</li>
            <li className="flex items-center gap-2.5"><Download size={15} className="text-side-gold" />{fmt.count(photo.downloads)} downloads</li>
            <li className="flex items-center gap-2.5"><Heart size={15} className="text-side-gold" />{fmt.count(photo.favourites)} guests added it to favourites</li>
            {photo.enhancedFrom && <li className="flex items-center gap-2.5"><Sparkles size={15} className="text-side-gold" />Improved with AI</li>}
            {photo.hidden && <li className="flex items-center gap-2.5 text-side-ink-2">Hidden from guests</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
