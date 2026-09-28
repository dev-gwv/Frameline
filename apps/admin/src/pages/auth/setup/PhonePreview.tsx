import { ScanFace } from 'lucide-react'
import { fmt, tone, toneCss } from '@frameline/shared'
import { PhotoTile } from '@frameline/ui'
import { isHex, type SetupDraft } from './draft'

/** Live guest view of the gallery on a phone, driven by the wizard draft. */
export function PhonePreview({ draft }: { draft: SetupDraft }) {
  const color = isHex(draft.brandColor) ? draft.brandColor : '#B8862B'
  const name = draft.name.trim() || 'Your studio'
  const eventName = draft.eventName.trim() || 'Your first event'
  const city = draft.eventCity.trim() || draft.city.trim() || 'City'
  const dateLine = draft.eventDate ? `${fmt.date(draft.eventDate)} · ${city}` : city
  const address = `${draft.handle.trim() || 'yourstudio'}.frameline.in`
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-[260px] overflow-hidden rounded-[30px] border-[7px] border-inverse bg-surface shadow-float ring-1 ring-inverse-line" aria-label="Preview of your guest gallery" role="img">
        <div className="bg-surface px-3 py-1.5 text-center text-[10px] text-ink-3">{address}</div>
        <div className="relative flex h-[220px] items-end p-4 text-white"
          style={{ background: `linear-gradient(to bottom, transparent 40%, rgba(0,0,0,.5)), ${toneCss(tone(3))}` }}>
          <div className="absolute inset-x-0 top-3.5 flex justify-center">
            {draft.logoUrl
              ? <img src={draft.logoUrl} alt="" className="h-8 max-w-[120px] rounded bg-white/90 object-contain p-0.5" />
              : <span className="text-[11px] font-extrabold tracking-[.14em]">{name}</span>}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[21px] font-semibold leading-tight">{eventName}</div>
            <div className="text-[11px] opacity-85">{dateLine}</div>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 p-3.5">
          <span className="flex h-10 items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white" style={{ background: color }}>
            <ScanFace size={15} aria-hidden /> Find my photos
          </span>
          <div className="grid grid-cols-3 gap-1">
            {[0, 2, 6, 7, 10, 11].map((t) => <PhotoTile key={t} tone={tone(t)} aspect="1 / 1" rounded="rounded-[3px]" />)}
          </div>
          <div className="truncate text-center text-[10.5px] text-ink-3">{[name, draft.phone.trim()].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <span className="text-[12px] text-ink-3">Preview of your guest gallery</span>
    </div>
  )
}
