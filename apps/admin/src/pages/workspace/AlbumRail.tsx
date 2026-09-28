import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, GripVertical, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { fmt, type Album, type ID, type PhotoEvent } from '@frameline/shared'
import { Chip, Input, Menu, Toggle, cn, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useNeedsYou } from '../../lib/queries'
import { trashWithUndo, usePendingDeletes } from './pending'
import { photosLabel } from './lib'

interface Props {
  event: PhotoEvent
  albums: Album[]
  selected?: ID
  onSelect: (albumId?: ID) => void
}

/** Albums in their saved order, without ones just trashed. */
export function useVisibleAlbums(albums: Album[]) {
  const pending = usePendingDeletes()
  return useMemo(() => albums.filter((a) => a.kind === 'album' && !pending.albums.has(a.id)).sort((a, b) => a.order - b.order), [albums, pending.albums])
}

function useRail(event: PhotoEvent, albums: Album[], selected: ID | undefined, onSelect: Props['onSelect']) {
  const api = useApi()
  const toast = useToast()
  const regular = useVisibleAlbums(albums)
  const guestAlbum = albums.find((a) => a.kind === 'guest')
  const needs = useNeedsYou().data
  const guestNew = needs?.find((n) => n.kind === 'guest-uploads' && n.eventId === event.id)?.count ?? 0
  const allCount = regular.reduce((s, a) => s + a.photoCount, 0)

  const create = async (name: string) => {
    try { const a = await api.createAlbum(event.id, name); onSelect(a.id); toast.success(`${a.name} created`) }
    catch (e) { toast.error('Couldn’t create the album', errorMessage(e)) }
  }
  const rename = async (a: Album, name: string) => {
    const before = a.name
    try {
      await api.renameAlbum(a.id, name)
      toast.undo(`Renamed to ${name}`, () => { api.renameAlbum(a.id, before).catch((e) => toast.error('Couldn’t undo the rename', errorMessage(e))) })
    } catch (e) { toast.error('Couldn’t rename the album', errorMessage(e)) }
  }
  const remove = (a: Album) => {
    if (selected === a.id) onSelect(undefined)
    const undo = trashWithUndo('albums', [a.id], () => api.deleteAlbum(a.id), () => api.restoreAlbum(a.id),
      (e, what) => toast.error(what === 'trash' ? `Couldn’t delete ${a.name}` : `Couldn’t bring back ${a.name}`, errorMessage(e)))
    toast.undo(`${a.name} deleted`, undo, a.photoCount ? `${photosLabel(a.photoCount)} went with it.` : undefined)
  }
  const highlights = (on: boolean) => api.updateEvent(event.id, { highlights: on })
    .then(() => toast.success(on ? 'Highlights on: the most-loved photos are picked for guests' : 'Highlights off'))
    .catch((e) => toast.error('Couldn’t change Highlights', errorMessage(e)))
  return { regular, guestAlbum, guestNew, allCount, create, rename, remove, highlights }
}

const rowCls = (on: boolean) => cn('flex min-h-[36px] w-full items-center gap-2 rounded-control px-2.5 text-left text-[13.5px]',
  on ? 'bg-accent-soft font-extrabold text-accent-text' : 'font-semibold text-ink-2 hover:bg-sunk hover:text-ink')

/** Desktop: the left list (albums, then Guest uploads and Highlights). Phone: albums as chips above the grid. */
export function AlbumRail({ event, albums, selected, onSelect }: Props) {
  const api = useApi()
  const r = useRail(event, albums, selected, onSelect)
  const [order, setOrder] = useState<ID[]>(() => r.regular.map((a) => a.id))
  const key = r.regular.map((a) => a.id).join()
  useEffect(() => setOrder(r.regular.map((a) => a.id)), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const ordered = order.map((id) => r.regular.find((a) => a.id === id)).filter(Boolean) as Album[]
  const [adding, setAdding] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)))
    setOrder(next)
    api.reorderAlbums(event.id, next).catch(() => setOrder(r.regular.map((a) => a.id)))
  }

  return (
    <>
      <nav aria-label="Albums" className="hidden w-[200px] shrink-0 flex-col gap-0.5 self-start md:sticky md:top-[76px] md:flex">
        <button type="button" onClick={() => onSelect(undefined)} className={rowCls(!selected)} aria-current={!selected || undefined}>
          <span className="flex-1 truncate">All photos</span><span className="text-[12px] tnum">{fmt.count(r.allCount)}</span>
        </button>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((a) => (
              <SortableAlbum key={a.id} album={a} active={selected === a.id} onSelect={() => onSelect(a.id)}
                onRename={(name) => void r.rename(a, name)} onDelete={() => r.remove(a)} />
            ))}
          </SortableContext>
        </DndContext>
        {adding
          ? <NewAlbumField onDone={(name) => { setAdding(false); if (name) void r.create(name) }} />
          : <button type="button" onClick={() => setAdding(true)} className="flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13.5px] font-bold text-accent-text hover:bg-accent-soft"><Plus size={14} />New album</button>}
        <div className="mx-2.5 my-1.5 h-px bg-line" />
        <GuestRow event={event} album={r.guestAlbum} fresh={r.guestNew} active={!!r.guestAlbum && selected === r.guestAlbum.id} onSelect={onSelect} />
        <label className="flex min-h-[36px] items-center gap-2 rounded-control px-2.5 text-[13.5px] font-semibold text-ink-2">
          <span className="flex-1">Highlights</span>
          <span className="text-[12px] text-ink-3">{event.highlights ? 'auto' : 'off'}</span>
          <Toggle size="sm" label="Highlights: most-loved photos picked automatically" checked={event.highlights} onCheckedChange={(v) => void r.highlights(v)} />
        </label>
      </nav>

      <PhoneChips event={event} rail={r} ordered={ordered} selected={selected} onSelect={onSelect} />
    </>
  )
}

function GuestRow({ event, album, fresh, active, onSelect }: { event: PhotoEvent; album?: Album; fresh: number; active: boolean; onSelect: (id?: ID) => void }) {
  if (!album || !event.settings.guestUploads) {
    return (
      <Link to={`/events/${event.id}/settings`} className={rowCls(false)}>
        <span className="flex-1">Guest uploads</span><span className="text-[12px] font-medium text-ink-3">off</span>
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => onSelect(album.id)} className={rowCls(active)} aria-current={active || undefined}>
      <span className="flex-1 truncate">Guest uploads</span>
      {fresh > 0 ? <Chip tone="accent">{fmt.count(fresh)} new</Chip> : <span className="text-[12px] tnum">{fmt.count(album.photoCount)}</span>}
    </button>
  )
}

function NewAlbumField({ onDone, className }: { onDone: (name: string) => void; className?: string }) {
  const [name, setName] = useState('')
  const done = useRef(false)
  const finish = (v: string) => { if (done.current) return; done.current = true; onDone(v.trim()) }
  return (
    <div className={cn('px-0.5 py-0.5', className)}>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Album name" aria-label="New album name" className="h-[34px]"
        onKeyDown={(e) => { if (e.key === 'Enter') finish(name); if (e.key === 'Escape') finish('') }} onBlur={() => finish(name)} />
      <div className="mt-1 px-1 text-[11.5px] text-ink-3">Enter to create · Esc to cancel</div>
    </div>
  )
}

function SortableAlbum({ album, active, onSelect, onRename, onDelete }: { album: Album; active: boolean; onSelect: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: album.id })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(album.name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  useEffect(() => setName(album.name), [album.name])
  const commit = () => {
    const n = name.trim()
    setEditing(false)
    if (n && n !== album.name) onRename(n); else setName(album.name)
  }
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative flex items-center rounded-control', active ? 'bg-accent-soft text-accent-text' : 'text-ink-2 hover:bg-sunk hover:text-ink', isDragging && 'z-10 bg-surface shadow-card')}>
      <button type="button" aria-label={`Drag to reorder ${album.name}`} {...attributes} {...listeners}
        className="absolute -left-4 grid h-full w-4 cursor-grab touch-none place-items-center text-ink-3 opacity-0 focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100">
        <GripVertical size={13} />
      </button>
      {editing ? (
        <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label="Album name"
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(album.name); setEditing(false) } }}
          className="my-0.5 h-8 min-w-0 flex-1 rounded-control border border-accent bg-surface px-2 text-[13.5px] text-ink outline-none" />
      ) : (
        <button type="button" onClick={onSelect} onDoubleClick={() => setEditing(true)} aria-current={active || undefined}
          className={cn('flex min-h-[36px] min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-[13.5px]', active ? 'font-extrabold' : 'font-semibold')}>
          <span className="flex-1 truncate">{album.name}</span>
          <span className="text-[12px] tnum group-focus-within:hidden group-hover:hidden group-has-[[data-state=open]]:hidden">{fmt.count(album.photoCount)}</span>
        </button>
      )}
      {!editing && (
        <span className="absolute right-1 hidden group-focus-within:flex group-hover:flex has-[[data-state=open]]:flex">
          <Menu width={200} trigger={<button type="button" aria-label={`${album.name} options`} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface hover:text-ink"><MoreHorizontal size={15} /></button>}
            items={[
              { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
              { label: 'Delete album', description: album.photoCount ? `And its ${photosLabel(album.photoCount)}. You can undo.` : 'You can undo.', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
            ]} />
        </span>
      )}
    </div>
  )
}

function PhoneChips({ event, rail, ordered, selected, onSelect }: { event: PhotoEvent; rail: ReturnType<typeof useRail>; ordered: Album[]; selected?: ID; onSelect: (id?: ID) => void }) {
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Album | null>(null)
  const current = ordered.find((a) => a.id === selected)
  const chips: { id?: ID; name: string; count: number }[] = [
    { id: undefined, name: 'All', count: rail.allCount },
    ...ordered.map((a) => ({ id: a.id, name: a.name, count: a.photoCount })),
    ...(rail.guestAlbum && event.settings.guestUploads ? [{ id: rail.guestAlbum.id, name: 'Guest uploads', count: rail.guestAlbum.photoCount }] : []),
  ]
  return (
    <div className="-mx-4 md:hidden">
      <div className="flex items-center gap-2 px-4">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 scrollbar-none" role="tablist" aria-label="Albums">
          {chips.map((c) => {
            const on = selected === c.id
            return (
              <button key={c.id ?? 'all'} type="button" role="tab" aria-selected={on} onClick={() => onSelect(c.id)}
                className={cn('inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold',
                  on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-2 bg-surface text-ink-2')}>
                {c.name}<span className="text-[11.5px] font-semibold opacity-70 tnum">{fmt.count(c.count)}</span>
              </button>
            )
          })}
        </div>
        <Menu width={240} trigger={<button type="button" aria-label="Album options" className="grid size-10 shrink-0 place-items-center rounded-control border border-line-2 bg-surface text-ink-2"><MoreHorizontal size={17} /></button>}
          items={[
            { label: 'New album', icon: <Plus size={15} />, onSelect: () => setAdding(true) },
            ...(current ? [
              { label: `Rename ${current.name}`, icon: <Pencil size={15} />, onSelect: () => setRenaming(current) },
              { label: `Delete ${current.name}`, description: 'You can undo.', icon: <Trash2 size={15} />, danger: true, onSelect: () => rail.remove(current) },
            ] : []),
            'separator',
            { label: event.highlights ? 'Turn Highlights off' : 'Turn Highlights on', description: 'Most-loved photos, picked automatically', icon: <Sparkles size={15} />, onSelect: () => void rail.highlights(!event.highlights) },
          ]} />
      </div>
      {adding && <PhoneNameRow initial="" label="New album name" onDone={(n) => { setAdding(false); if (n) void rail.create(n) }} />}
      {renaming && <PhoneNameRow initial={renaming.name} label="Album name" onDone={(n) => { if (n && n !== renaming.name) void rail.rename(renaming, n); setRenaming(null) }} />}
    </div>
  )
}

function PhoneNameRow({ initial, label, onDone }: { initial: string; label: string; onDone: (name: string) => void }) {
  const [v, setV] = useState(initial)
  return (
    <div className="mt-2 flex items-center gap-1.5 px-4">
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={label} placeholder={label} className="h-11"
        onKeyDown={(e) => { if (e.key === 'Enter') onDone(v.trim()); if (e.key === 'Escape') onDone('') }} />
      <button type="button" aria-label="Save" className="grid size-11 shrink-0 place-items-center rounded-control text-ok hover:bg-sunk" onClick={() => onDone(v.trim())}><Check size={18} /></button>
      <button type="button" aria-label="Cancel" className="grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-sunk" onClick={() => onDone('')}><X size={18} /></button>
    </div>
  )
}
