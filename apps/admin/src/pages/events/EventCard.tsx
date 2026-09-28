import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, CalendarDays, CreditCard, ImageIcon, Link2, MoreHorizontal, Share2, Trash2 } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { CoverMosaic, EventStatusChip, Menu, Skeleton, type MenuItem } from '@frameline/ui'
import { daysLeft, photoLine } from './lib'
import type { EventActions } from './useEventActions'

/** The event card used on Events and Home: cover, status, name, date · city, photo count, ⋯ menu. */
export function EventCard({ event: e, actions }: { event: PhotoEvent; actions: EventActions }) {
  const archived = e.status === 'archived'
  const items: (MenuItem | 'separator')[] = [
    { label: 'Share', icon: <Share2 size={14} />, onSelect: () => actions.share(e) },
    { label: 'Copy link', icon: <Link2 size={14} />, onSelect: () => actions.copyLink(e) },
    { label: 'Rename or change date', icon: <CalendarDays size={14} />, onSelect: () => actions.edit(e) },
    { label: 'Renew', icon: <CreditCard size={14} />, onSelect: () => actions.renew(e) },
    'separator',
    archived
      ? { label: 'Restore', icon: <ArchiveRestore size={14} />, onSelect: () => actions.restoreArchived(e) }
      : { label: 'Archive', icon: <Archive size={14} />, onSelect: () => actions.archive(e) },
    { label: 'Move to trash', icon: <Trash2 size={14} />, danger: true, onSelect: () => actions.trash(e) },
  ]

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition hover:border-line-2">
      <Link to={`/events/${e.id}`} className="relative block h-[118px]" aria-label={`Open ${e.name}`}>
        <CoverMosaic tones={e.coverTones} className="h-full" empty={e.photoCount === 0 ? <ImageIcon size={22} aria-hidden /> : undefined} />
        <span className="absolute left-2.5 top-2.5"><EventStatusChip status={e.status} expiresInDays={daysLeft(e)} className="bg-surface/95" /></span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/events/${e.id}`} className="min-w-0 flex-1 truncate text-[14px] font-bold hover:underline">{e.name}</Link>
          <Menu width={230} items={items} trigger={
            <button type="button" aria-label={`More for ${e.name}`} className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-sunk hover:text-ink max-sm:size-10">
              <MoreHorizontal size={17} />
            </button>
          } />
        </div>
        <div className="truncate text-[12.5px] text-ink-2">{fmt.date(e.date)} · {e.city}</div>
        <div className="mt-1.5 text-[12px] text-ink-3 tnum">{photoLine(e)}</div>
      </div>
    </article>
  )
}

/** Grey card shapes while events load. */
export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <Skeleton className="h-[118px] rounded-none" />
      <div className="flex flex-col gap-2 px-3.5 py-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
    </div>
  )
}
