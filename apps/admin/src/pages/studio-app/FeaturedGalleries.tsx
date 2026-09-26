import { useState } from 'react'
import { GripVertical, Plus, Star, X } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { fmt, toneCss, type PhotoEvent } from '@frameline/shared'
import { Button, Card, CardHeader, cn, EmptyState, Modal, Tip } from '@frameline/ui'

const MAX_FEATURED = 8

function Row({ event, onRemove }: { event: PhotoEvent; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2.5 border-t border-line bg-surface py-2', isDragging && 'relative z-10 rounded-control shadow-card')}>
      <button type="button" className="cursor-grab touch-none rounded p-0.5 text-ink-3 hover:text-ink active:cursor-grabbing" aria-label={`Drag to reorder ${event.name}`} {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>
      <div className="h-8 w-[46px] shrink-0 rounded" style={{ background: toneCss(event.coverTones[0]) }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold">{event.name}</div>
        <div className="text-[11.5px] text-ink-3">{fmt.date(event.date)} · {fmt.count(event.photoCount)} photos</div>
      </div>
      <Tip label="Remove from featured">
        <button type="button" onClick={onRemove} className="rounded p-1 text-ink-3 hover:bg-sunk hover:text-ink" aria-label={`Remove ${event.name} from featured`}><X size={14} /></button>
      </Tip>
    </div>
  )
}

export function FeaturedGalleries({ events, featured, onChange }: { events: PhotoEvent[]; featured: string[]; onChange: (ids: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const byId = new Map(events.map((e) => [e.id, e]))
  const rows = featured.map((id) => byId.get(id)).filter((e): e is PhotoEvent => !!e)
  const candidates = events.filter((e) => !featured.includes(e.id) && e.status !== 'draft')
  const room = MAX_FEATURED - rows.length

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = rows.map((r) => r.id)
    onChange(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  const openAdd = () => { setPicked([]); setAdding(true) }
  const confirmAdd = () => { onChange([...rows.map((r) => r.id), ...picked]); setAdding(false) }

  return (
    <Card>
      <CardHeader title="Featured galleries" action={<Button size="sm" icon={<Plus size={12} />} onClick={openAdd} disabled={room <= 0 || candidates.length === 0}>Add</Button>} />
      <p className="mb-2 text-[12px] text-ink-2">Fill the row at the top of your app. Drag to reorder. Up to {MAX_FEATURED}.</p>
      {rows.length === 0 ? (
        <EmptyState className="py-8" icon={<Star size={20} />} title="No featured galleries" body="Pick your best work so new followers see it first." action={<Button variant="primary" icon={<Plus size={14} />} onClick={openAdd}>Add galleries</Button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((e) => <Row key={e.id} event={e} onRemove={() => onChange(rows.filter((r) => r.id !== e.id).map((r) => r.id))} />)}
          </SortableContext>
        </DndContext>
      )}

      <Modal open={adding} onOpenChange={setAdding} title="Add featured galleries" description={`Pick up to ${room} more. Drafts are hidden until they have photos.`} width={520}
        footer={<>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="primary" disabled={!picked.length} onClick={confirmAdd}>Add {picked.length || ''} {picked.length === 1 ? 'gallery' : 'galleries'}</Button>
        </>}>
        <div className="flex flex-col gap-1 px-4 py-3 sm:px-5">
          {candidates.length === 0 && <p className="py-6 text-center text-[13px] text-ink-2">Every event is already featured.</p>}
          {candidates.map((e) => {
            const on = picked.includes(e.id)
            const full = !on && picked.length >= room
            return (
              <label key={e.id} className={cn('flex cursor-pointer items-center gap-3 rounded-control border p-2', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk', full && 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} disabled={full}
                  onChange={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))} />
                <div className="h-8 w-[46px] shrink-0 rounded" style={{ background: toneCss(e.coverTones[0]) }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{e.name}</div>
                  <div className="text-[11.5px] text-ink-3">{fmt.date(e.date)} · {e.city} · {fmt.count(e.photoCount)} photos</div>
                </div>
              </label>
            )
          })}
        </div>
      </Modal>
    </Card>
  )
}
