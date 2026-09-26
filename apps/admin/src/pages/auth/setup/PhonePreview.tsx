import { ScanFace } from 'lucide-react'
import { fmt, tone, toneCss } from '@frameline/shared'
import { PhotoTile } from '@frameline/ui'
import type { SetupDraft } from './draft'
import { isHex } from './draft'

/** Live guest view of the gallery on a phone, driven by the wizard draft. */
export function PhonePreview({ draft }: { draft: SetupDraft }) {
  const color = isHex(draft.brandColor) ? draft.brandColor : '#8C2F39'
  const name = draft.name.trim() || 'Your studio'
  const contact = [name, draft.phone.trim(), draft.instagram.trim()].filter(Boolean).join(' · ')
  const eventName = draft.eventName.trim() || 'Your event name'
  const dateLine = draft.eventName.trim() && draft.eventDate ? `${fmt.date(draft.eventDate)} · ${draft.city || 'City'}` : 'Date · City'
  return (
    <div className="w-[260px] overflow-hidden rounded-[30px] border-[7px] border-side bg-surface shadow-float" aria-label="Live guest preview">
      <div
        className="relative flex h-[220px] items-end bg-cover bg-center p-4 text-white"
        style={{ backgroundImage: draft.coverUrl ? `linear-gradient(to bottom, transparent 40%, rgba(0,0,0,.55)), url(${draft.coverUrl})` : `linear-gradient(to bottom, transparent 40%, rgba(0,0,0,.45)), ${toneCss(tone(3))}` }}
      >
        <div className="absolute inset-x-0 top-3.5 flex justify-center">
          {draft.logoUrl
            ? <img src={draft.logoUrl} alt="" className="h-7 max-w-[120px] object-contain" />
            : <span className="font-display text-[11px] uppercase tracking-[.2em]">{name}</span>}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[21px] font-semibold leading-tight">{eventName}</div>
          <div className="text-[11px] opacity-85">{dateLine}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5">
        <span className="flex h-10 items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white" style={{ background: color }}>
          <ScanFace size={15} /> Find my photos
        </span>
        <div className="grid grid-cols-3 gap-1">
          {[0, 2, 6, 7, 10, 11].map((t) => <PhotoTile key={t} tone={tone(t)} aspect="1 / 1" rounded="rounded-[3px]" />)}
        </div>
        <div className="truncate text-center text-[10.5px] text-ink-3">{contact}</div>
      </div>
    </div>
  )
}
