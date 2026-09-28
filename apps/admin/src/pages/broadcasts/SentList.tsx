import { Ban, Copy, Megaphone, MoreHorizontal, Trash2 } from 'lucide-react'
import { fmt, type Broadcast, type PhotoEvent } from '@frameline/shared'
import { Card, CardHeader, Chip, EmptyState, Menu, Skeleton, type MenuItem } from '@frameline/ui'

export function SentList({ items, events, loading, onDuplicate, onCancel, onDelete, onWrite }: {
  items?: Broadcast[]
  events: PhotoEvent[]
  loading?: boolean
  onDuplicate: (b: Broadcast) => void
  onCancel: (b: Broadcast) => void
  onDelete: (b: Broadcast) => void
  onWrite: () => void
}) {
  const audience = (a: Broadcast['audience']) => (a === 'all' ? 'Everyone who follows you' : `Guests of ${events.find((e) => e.id === a)?.name ?? 'one event'}`)
  return (
    <Card padded={false} className="min-w-0">
      <CardHeader title="Sent" description="Messages you sent or scheduled." className="mb-0 px-[18px] pb-2 pt-[18px]" />
      {loading ? (
        <div className="flex flex-col gap-2 p-[18px]">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : !items?.length ? (
        <EmptyState className="py-10" icon={<Megaphone size={22} />} title="Nothing sent yet"
          body="Write your first message above. People who follow you get it as a notification and in the app’s Posts tab."
          action={<button type="button" onClick={onWrite} className="text-[13.5px] font-bold text-accent-text hover:underline">Write a message</button>} />
      ) : (
        <ul>
          {items.map((b) => {
            const scheduled = !b.sentAt && !!b.scheduledAt && !b.cancelledAt
            const menu: MenuItem[] = [
              { label: 'Duplicate', description: 'Copy it into the composer', icon: <Copy size={15} />, onSelect: () => onDuplicate(b) },
              ...(scheduled ? [{ label: 'Cancel sending', description: 'It won’t go out', icon: <Ban size={15} />, onSelect: () => onCancel(b) }] : []),
              { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => onDelete(b) },
            ]
            return (
              <li key={b.id} className="flex items-center gap-3 border-t border-line px-[18px] py-3">
                {b.imageUrl
                  ? <img src={b.imageUrl} alt="" className="h-10 w-14 shrink-0 rounded-md border border-line object-cover" />
                  : <span className="grid size-10 shrink-0 place-items-center rounded-control bg-sunk text-ink-2"><Megaphone size={16} /></span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold">{b.title}</div>
                  <div className="truncate text-[12.5px] text-ink-2">{audience(b.audience)}</div>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right text-[12.5px] sm:flex">
                  {b.cancelledAt ? <Chip tone="warn">Cancelled</Chip>
                    : scheduled ? <Chip tone="accent">Scheduled · {fmt.dateTime(b.scheduledAt!)}</Chip>
                    : <span className="text-ink-2">{b.sentAt ? fmt.dateTime(b.sentAt) : ''}</span>}
                  {b.openRate !== undefined && <span className="text-ink-3 tnum">{Math.round(b.openRate * 100)}% opened</span>}
                </div>
                <div className="flex shrink-0 flex-col items-end sm:hidden">
                  {b.cancelledAt ? <Chip tone="warn">Cancelled</Chip> : scheduled ? <Chip tone="accent">Scheduled</Chip>
                    : b.openRate !== undefined ? <span className="text-[12px] text-ink-3 tnum">{Math.round(b.openRate * 100)}% opened</span> : null}
                </div>
                <Menu trigger={<button type="button" className="grid size-9 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink" aria-label={`More for ${b.title}`}><MoreHorizontal size={17} /></button>}
                  items={menu} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
