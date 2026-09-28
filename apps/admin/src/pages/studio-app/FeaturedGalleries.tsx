import { useEffect, useState } from 'react'
import { GripVertical, Plus, Star } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { fmt, toneCss, type PhotoEvent } from '@frameline/shared'
import { Button, Card, CardHeader, cn, EmptyState, Modal } from '@frameline/ui'

export const MAX_FEATURED = 8

/** Events that can be featured: not deleted, not drafts, not already featured. */
export const featurable = (events: PhotoEvent[], featured: string[]) =>
  events.filter((e) => !e.deletedAt && !featured.includes(e.id) && e.status !== 'draft')

function Row({ event, onRemove }: { event: PhotoEvent; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2.5 border-t border-line bg-surface py-2 first:border-t-0', isDragging && 'relative z-10 rounded-control shadow-card')}>
      <button type="button" className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded text-ink-3 hover:text-ink active:cursor-grabbing max-sm:size-10"
        aria-label={`Drag to reorder ${event.name}`} {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>
      <div className="h-9 w-[52px] shrink-0 rounded" style={{ background: toneCss(event.coverTones[0]) }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold">{event.name}</div>
        <div className="text-[12px] text-ink-3 tnum">{fmt.date(event.date)} · {fmt.count(event.photoCount)} photos</div>
      </div>
      <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${event.name} from featured`}>Remove</Button>
    </div>
  )
}

export function FeaturedGalleries({ events, featured, onReorder, onRemove, onAddClick }: {
  events: PhotoEvent[]; featured: string[]; onReorder: (ids: string[]) => void; onRemove: (id: string) => void; onAddClick: () => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const byId = new Map(events.map((e) => [e.id, e]))
  const rows = featured.map((id) => byId.get(id)).filter((e): e is PhotoEvent => !!e)
  const canAdd = rows.length < MAX_FEATURED && featurable(events, featured).length > 0

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = rows.map((r) => r.id)
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <Card>
      <CardHeader title="Featured galleries" description={`The row at the top of your app. Drag to change the order. Up to ${MAX_FEATURED}.`} />
      {rows.length === 0 ? (
        <EmptyState className="py-8" icon={<Star size={20} />} title="Nothing featured yet" body="Pick your best events so new followers see them first."
          action={canAdd ? <Button icon={<Plus size={14} />} onClick={onAddClick}>Add galleries</Button> : undefined} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((e) => <Row key={e.id} event={e} onRemove={() => onRemove(e.id)} />)}
          </SortableContext>
        </DndContext>
      )}
    </Card>
  )
}

export function AddFeaturedModal({ open, onOpenChange, events, featured, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void; events: PhotoEvent[]; featured: string[]; onAdd: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => { if (open) setPicked([]) }, [open])
  const candidates = featurable(events, featured)
  const room = MAX_FEATURED - featured.length

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add featured galleries"
      description={room > 0 ? `Pick up to ${room}. Drafts show up once they have photos.` : `You already feature ${MAX_FEATURED}. Remove one to add another.`} width={520}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" disabled={!picked.length} onClick={() => { onAdd(picked); onOpenChange(false) }}>
          {picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'gallery' : 'galleries'}` : 'Add galleries'}
        </Button>
      </>}>
      {candidates.length === 0 && <p className="py-6 text-center text-[13.5px] text-ink-2">Every event is already featured.</p>}
      <div className="flex flex-col gap-1.5">
        {candidates.map((e) => {
          const on = picked.includes(e.id)
          const full = !on && picked.length >= room
          return (
            <label key={e.id} className={cn('flex min-h-[48px] cursor-pointer items-center gap-3 rounded-control border p-2', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk', full && 'cursor-not-allowed opacity-50')}>
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} disabled={full}
                onChange={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))} />
              <div className="h-9 w-[52px] shrink-0 rounded" style={{ background: toneCss(e.coverTones[0]) }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{e.name}</div>
                <div className="truncate text-[12px] text-ink-3 tnum">{fmt.date(e.date)} · {e.city} · {fmt.count(e.photoCount)} photos</div>
              </div>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
