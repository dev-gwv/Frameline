import { Copy, Megaphone, MoreHorizontal, Trash2 } from 'lucide-react'
import { fmt, type Broadcast, type PhotoEvent } from '@frameline/shared'
import { Card, Chip, EmptyState, Menu, Skeleton } from '@frameline/ui'

export function SentList({ items, events, loading, onDuplicate, onDelete }: {
  items?: Broadcast[]
  events: PhotoEvent[]
  loading?: boolean
  onDuplicate: (b: Broadcast) => void
  onDelete: (b: Broadcast) => void
}) {
  const audience = (a: Broadcast['audience']) => (a === 'all' ? 'All followers' : events.find((e) => e.id === a)?.name ?? 'One event')
  return (
    <Card padded={false} className="min-w-0 self-start">
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h3 className="font-display text-[15px] font-semibold">Sent</h3>
        {items && <span className="font-mono text-[11.5px] text-ink-3">{items.length}</span>}
      </div>
      {loading ? (
        <div className="flex flex-col gap-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !items?.length ? (
        <EmptyState className="py-10" icon={<Megaphone size={20} />} title="Nothing sent yet" body="Write your first update on the left. Followers get it as a push and in the app’s Posts tab." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] text-ink-3">
                <th className="px-4 py-2 font-semibold">Broadcast</th>
                <th className="px-2 py-2 font-semibold">When</th>
                <th className="px-2 py-2 text-right font-semibold">Opened</th>
                <th className="w-10 px-2 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-bold">{b.title}</div>
                    <div className="text-[11.5px] text-ink-3">{audience(b.audience)}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-[12px] text-ink-2">
                    {b.scheduledAt && !b.sentAt ? <Chip tone="accent">Scheduled · {fmt.dateTime(b.scheduledAt)}</Chip> : b.sentAt ? fmt.dateTime(b.sentAt) : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tnum">{b.openRate !== undefined ? `${Math.round(b.openRate * 100)}%` : <span className="text-ink-3">—</span>}</td>
                  <td className="px-2 py-2.5 text-right">
                    <Menu
                      trigger={<button type="button" className="rounded p-1 text-ink-2 hover:bg-sunk hover:text-ink" aria-label={`More for ${b.title}`}><MoreHorizontal size={15} /></button>}
                      items={[
                        { label: 'Duplicate into composer', icon: <Copy size={14} />, onSelect: () => onDuplicate(b) },
                        { label: b.sentAt ? 'Delete from list' : 'Cancel and delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => onDelete(b) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
