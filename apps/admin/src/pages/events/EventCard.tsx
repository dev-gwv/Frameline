import { Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, CalendarDays, CreditCard, Eye, ImageIcon, Link2, MoreHorizontal, Share2, ShoppingBag, Trash2 } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Chip, CoverMosaic, EventStatusChip, Menu, Tip, type MenuItem } from '@frameline/ui'
import { daysLeft, totalVisits } from './lib'

export interface CardActions {
  onCopyLink: (e: PhotoEvent) => void
  onEdit: (e: PhotoEvent) => void
  onSell: (e: PhotoEvent) => void
  onArchive: (e: PhotoEvent, archived: boolean) => void
  onDelete: (e: PhotoEvent) => void
}

export function EventCard({ event: e, actions }: { event: PhotoEvent; actions: CardActions }) {
  const navigate = useNavigate()
  const archived = e.status === 'archived'
  const items: (MenuItem | 'separator')[] = [
    { label: 'Open', icon: <Eye size={14} />, onSelect: () => navigate(`/events/${e.id}`) },
    { label: 'Share', icon: <Share2 size={14} />, onSelect: () => navigate(`/events/${e.id}?modal=share`) },
    { label: 'Copy gallery link', icon: <Link2 size={14} />, onSelect: () => actions.onCopyLink(e) },
    { label: 'Rename or change date', icon: <CalendarDays size={14} />, onSelect: () => actions.onEdit(e) },
    { label: 'Renew or add photos', icon: <CreditCard size={14} />, onSelect: () => navigate(`/plan?renew=${e.id}`) },
    { label: e.settings.storeEnabled ? 'Open in Store' : 'Sell photos from this event', icon: <ShoppingBag size={14} />, onSelect: () => actions.onSell(e) },
    'separator',
    archived
      ? { label: 'Restore', icon: <ArchiveRestore size={14} />, onSelect: () => actions.onArchive(e, false) }
      : { label: 'Archive', icon: <Archive size={14} />, onSelect: () => actions.onArchive(e, true) },
    { label: 'Move to trash', icon: <Trash2 size={14} />, danger: true, onSelect: () => actions.onDelete(e) },
  ]

  return (
    <article className="group relative overflow-hidden rounded-card border border-line bg-surface transition hover:shadow-card">
      <div className="relative h-32">
        <Link to={`/events/${e.id}`} aria-label={`Open ${e.name}`} className="absolute inset-0">
          <CoverMosaic tones={e.coverTones} className="h-full" empty={e.photoCount === 0 ? <ImageIcon size={22} /> : undefined} />
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          <EventStatusChip status={e.status} expiresInDays={daysLeft(e)} />
          {e.plan === 'trial' && <Chip tone="accent">Free trial</Chip>}
        </div>
        <div className="absolute right-2 top-2">
          <Menu width={230} items={items} trigger={
            <button type="button" aria-label={`Actions for ${e.name}`} className="grid size-7 place-items-center rounded-md bg-black/45 text-white backdrop-blur-sm hover:bg-black/60">
              <Tip label="More actions"><span className="inline-flex"><MoreHorizontal size={15} /></span></Tip>
            </button>
          } />
        </div>
      </div>
      <Link to={`/events/${e.id}`} className="block px-3 pb-3 pt-2.5">
        <b className="block truncate text-[13.5px] font-bold">{e.name}</b>
        <div className="truncate text-[12px] text-ink-2">{fmt.date(e.date)} · {e.city}</div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
          <span className="font-mono">{e.shortId}</span>
          <span className="truncate font-mono tnum">{fmt.count(e.photoCount)} photos · {fmt.count(totalVisits(e))} visits</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-ink-3">
          <span className="tnum">Limit {fmt.count(e.photoLimit)}</span>
          <span>{archived ? 'Archived' : `Valid till ${fmt.date(e.expiresAt)}`}</span>
        </div>
      </Link>
    </article>
  )
}
