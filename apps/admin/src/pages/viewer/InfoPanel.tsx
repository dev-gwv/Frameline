import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Heart, ScanFace, Upload, Wand2 } from 'lucide-react'
import { DEMO_NOW, fmt, toneCss, type Album, type Person, type Photo } from '@frameline/shared'
import { cn } from '@frameline/ui'
import { SOURCE_LABEL } from '../workspace/lib'

type Tab = 'details' | 'faces' | 'activity'

export function InfoPanel({ photo, album, position, total, people, personName, eventId }: {
  photo: Photo; album?: Album; position: number; total: number; people: Person[]; personName: (id: string) => string; eventId: string
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('details')
  const ids = [...new Set(photo.faces.map((f) => f.personId))]
  const inPhoto = ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[]
  const quality = photo.exif.width <= 2048 && photo.exif.height <= 2048 ? 'Web-ready 2K' : 'Standard'
  const rows: [string, string][] = [
    ['Captured', fmt.fullDateTime(photo.capturedAt)],
    ['Camera', photo.exif.camera ?? 'Unknown'],
    ['Lens', photo.exif.lens ?? '—'],
    ['Exposure', photo.exif.exposure ?? '—'],
    ['Size', `${photo.exif.width} × ${photo.exif.height} · ${fmt.bytes(photo.exif.sizeBytes)}`],
    ['Uploaded', `${quality} · by ${photo.uploadedBy} · via ${SOURCE_LABEL[photo.source]}`],
    ['Album', `${album?.name ?? 'Album'} · ${position > 0 ? `#${position} of ${fmt.count(total)}` : `#${photo.index}`}`],
  ]
  const tabs: { v: Tab; label: string }[] = [{ v: 'details', label: 'Details' }, { v: 'faces', label: `Faces · ${inPhoto.length}` }, { v: 'activity', label: 'Activity' }]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5 p-4 text-side-ink">
      <div role="tablist" className="flex gap-4 border-b border-side-line">
        {tabs.map((t) => (
          <button key={t.v} role="tab" type="button" aria-selected={tab === t.v} onClick={() => setTab(t.v)}
            className={cn('pb-2 text-[13px] font-bold', tab === t.v ? 'text-side-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-side-ink-2 hover:text-side-ink')}>{t.label}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'details' && (
          <dl className="flex flex-col gap-3">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[10px] uppercase tracking-[.09em] text-side-ink-2">{k}</dt>
                <dd className="text-[13px] font-semibold">{v}</dd>
              </div>
            ))}
            <div className="flex gap-4 text-[12px] text-side-ink-2">
              <span className="inline-flex items-center gap-1"><Heart size={13} />{photo.favourites} favourites</span>
              <span className="inline-flex items-center gap-1"><Download size={13} />{photo.downloads} downloads</span>
            </div>
          </dl>
        )}
        {tab === 'faces' && (
          photo.status === 'processing' ? <p className="text-[12.5px] text-side-ink-2">Faces are found once processing finishes, usually within a minute.</p>
            : !inPhoto.length ? <p className="text-[12.5px] text-side-ink-2"><ScanFace size={14} className="mr-1 inline" />No faces found in this photo.</p>
            : (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[.09em] text-side-ink-2">People in this photo</div>
                <div className="flex flex-wrap gap-3">
                  {inPhoto.map((p) => (
                    <button key={p.id} type="button" onClick={() => navigate(`/events/${eventId}?person=${p.id}`)} className="w-[64px] text-center hover:opacity-80" aria-label={`Show all photos of ${personName(p.id)}`}>
                      <span className="mx-auto block size-11 rounded-full border-[1.5px] border-accent" style={{ background: toneCss(p.tone) }} />
                      <span className="mt-1 block truncate text-[11px] font-semibold">{personName(p.id)}</span>
                      <span className="block font-mono text-[9.5px] text-side-ink-2">{p.photoCount} photos</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11.5px] text-side-ink-2">Pick a person to see every photo they’re in. Name people on the Guests page.</p>
              </div>
            )
        )}
        {tab === 'activity' && (
          <ul className="flex flex-col gap-2.5 text-[13px]">
            <li className="flex items-center gap-2"><Heart size={14} className="text-side-gold" /><b>{photo.favourites}</b> guests favourited this</li>
            <li className="flex items-center gap-2"><Download size={14} className="text-side-gold" /><b>{photo.downloads}</b> downloads</li>
            <li className="flex items-center gap-2"><Upload size={14} className="text-side-gold" />Added by {photo.uploadedBy} · {fmt.ago(photo.capturedAt, DEMO_NOW)}</li>
          </ul>
        )}
      </div>
      <button type="button" onClick={() => navigate(`/enhance/${photo.id}`)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-side-line bg-side-2 text-[13px] font-bold text-side-gold hover:brightness-110">
        <Wand2 size={14} />AI enhance this photo
      </button>
      <div className="font-mono text-[9.5px] text-side-ink-2">photo {photo.id} · album {photo.albumId}</div>
    </div>
  )
}
