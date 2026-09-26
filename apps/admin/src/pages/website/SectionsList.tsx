import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { WebsiteSection } from '@frameline/shared'
import { Card, cn, Toggle } from '@frameline/ui'

interface Props {
  sections: WebsiteSection[]
  selected: string | null
  onSelect: (id: string) => void
  onChange: (sections: WebsiteSection[], message: string) => void
}

/** Section list: drag (or keyboard: focus the handle, Space, arrows) to reorder; switch sections on or off. */
export function SectionsList({ sections, selected, onSelect, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = sections.findIndex((s) => s.id === active.id)
    const to = sections.findIndex((s) => s.id === over.id)
    onChange(arrayMove(sections, from, to), 'Section order saved')
  }
  return (
    <Card className="self-start p-2.5">
      <div className="eyebrow px-1.5 pb-2 pt-1">Sections · drag to order</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-px">
            {sections.map((s) => (
              <Row key={s.id} section={s} active={selected === s.id} onSelect={() => onSelect(s.id)}
                onToggle={(v) => onChange(sections.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)), v ? `${s.label} is on` : `${s.label} is hidden`)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Card>
  )
}

function Row({ section, active, onSelect, onToggle }: { section: WebsiteSection; active: boolean; onSelect: () => void; onToggle: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-1.5 rounded-md px-1 py-1 text-[12.5px]', active ? 'bg-accent-soft font-extrabold text-accent-text' : 'font-semibold', isDragging && 'relative z-10 bg-surface shadow-card')}>
      <button type="button" className="cursor-grab touch-none rounded p-0.5 text-ink-3 hover:text-ink active:cursor-grabbing" aria-label={`Drag to reorder ${section.label}`} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <button type="button" onClick={onSelect} className={cn('min-w-0 flex-1 truncate text-left', !section.enabled && 'text-ink-3')}>{section.label}</button>
      <Toggle size="sm" checked={section.enabled} onCheckedChange={onToggle} label={`Show ${section.label}`} />
    </li>
  )
}
