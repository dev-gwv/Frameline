import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Film, GripVertical, Heart, Images, MoreHorizontal, Pencil, Plus, ScanFace, Sparkles, Trash2, Users, X } from 'lucide-react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { fmt, type Album, type ID, type PhotoEvent } from '@frameline/shared'
import { Chip, ConfirmDialog, Input, Menu, Meter, Tip, Toggle, cn } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useFilms, useGuests } from '../../lib/queries'
import { FilmsModal } from './FilmsModal'

interface RailProps {
  event: PhotoEvent
  albums: Album[]
  selected?: ID
  onSelect: (albumId?: ID) => void
}

function useRailActions(event: PhotoEvent, onSelect: RailProps['onSelect'], selected?: ID) {
  const api = useApi()
  const rename = useAction(({ id, name }: { id: ID; name: string }) => api.renameAlbum(id, name), { success: 'Album renamed' })
  const remove = useAction((a: Album) => api.deleteAlbum(a.id), {
    success: (_d, a) => `${a.name} deleted`,
    onSuccess: (_d, a) => { if (selected === a.id) onSelect(undefined) },
  })
  const create = useAction((name: string) => api.createAlbum(event.id, name), {
    success: (a) => `${a.name} created`,
    onSuccess: (a) => onSelect(a.id),
  })
  const highlights = useAction((on: boolean) => api.updateEvent(event.id, { highlights: on }), {
    success: (_d, on) => (on ? 'Highlights album on' : 'Highlights album off'),
  })
  return { rename, remove, create, highlights }
}

/** Simulated face indexing: counts up toward the photo total while the page is open. */
function useFaceIndex(event: PhotoEvent) {
  const total = event.photoCount
  const [done, setDone] = useState(() => Math.floor(total * 0.883))
  useEffect(() => {
    if (!event.settings.faceSearch) return
    if (done > total) { setDone(total); return }
    if (done === total) return
    const t = setTimeout(() => setDone((d) => Math.min(total, d + Math.max(1, Math.ceil(total / 300)))), 900)
    return () => clearTimeout(t)
  }, [done, total, event.settings.faceSearch])
  return { done: Math.min(done, total), total, on: event.settings.faceSearch }
}

export function AlbumRail({ event, albums, selected, onSelect }: RailProps) {
  const api = useApi()
  const actions = useRailActions(event, onSelect, selected)
  const films = useFilms(event.id).data
  const guests = useGuests(event.id).data
  const favCount = useMemo(() => new Set(guests?.flatMap((g) => g.favourites) ?? []).size, [guests])
  const face = useFaceIndex(event)

  const regular = useMemo(() => albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order), [albums])
  const guestAlbum = albums.find((a) => a.kind === 'guest')
  const [order, setOrder] = useState<ID[]>(regular.map((a) => a.id))
  useEffect(() => setOrder(regular.map((a) => a.id)), [regular])
  const ordered = order.map((id) => regular.find((a) => a.id === id)).filter(Boolean) as Album[]
  const allCount = regular.reduce((s, a) => s + a.photoCount, 0)

  const [filmsOpen, setFilmsOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [toDelete, setToDelete] = useState<Album | null>(null)
  const [renaming, setRenaming] = useState<Album | null>(null)
  const navigate = useNavigate()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)))
    setOrder(next)
    api.reorderAlbums(event.id, next).catch(() => setOrder(regular.map((a) => a.id)))
  }

  const submitNew = () => {
    const n = newName.trim()
    if (!n) { setAdding(false); return }
    actions.create.mutate(n)
    setNewName(''); setAdding(false)
  }

  const row = 'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13px]'
  return (
    <>
      <nav aria-label="Albums" className="hidden w-[220px] shrink-0 flex-col gap-px overflow-y-auto border-r border-line bg-surface px-2.5 py-3 scrollbar-thin md:flex">
        <div className="eyebrow px-2 pb-1.5">Albums · drag to reorder</div>
        <button type="button" onClick={() => onSelect(undefined)} className={cn(row, !selected ? 'bg-accent-soft font-extrabold text-accent-text' : 'font-semibold text-ink-2 hover:bg-sunk')}>
          <Images size={14} className="text-ink-3" />All photos<span className="ml-auto font-mono text-[11px] text-ink-3">{fmt.count(allCount)}</span>
        </button>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((a) => (
              <SortableAlbum key={a.id} album={a} active={selected === a.id} onSelect={() => onSelect(a.id)}
                onRename={(name) => actions.rename.mutate({ id: a.id, name })} onDelete={() => setToDelete(a)} />
            ))}
          </SortableContext>
        </DndContext>
        {adding ? (
          <div className="flex items-center gap-1 px-1 py-1">
            <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Album name" className="h-8"
              onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }} onBlur={submitNew} />
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={cn(row, 'font-bold text-accent-text hover:bg-accent-soft')}><Plus size={14} />New album</button>
        )}
        <div className="my-1.5 h-px bg-line" />
        {guestAlbum && (
          <button type="button" onClick={() => onSelect(guestAlbum.id)} className={cn(row, selected === guestAlbum.id ? 'bg-accent-soft font-extrabold text-accent-text' : 'font-semibold text-ink-2 hover:bg-sunk')}>
            <Users size={14} />Guest uploads
            {guestAlbum.photoCount > 0 && event.settings.reviewGuestUploads
              ? <Chip tone="accent" className="ml-auto">{guestAlbum.photoCount} new</Chip>
              : <span className="ml-auto font-mono text-[11px] text-ink-3">{guestAlbum.photoCount}</span>}
          </button>
        )}
        <div className={cn(row, 'font-semibold text-ink-2')}>
          <Sparkles size={14} /><span>Highlights</span>
          <span className="ml-auto"><Toggle size="sm" label="Highlights album" checked={event.highlights} onCheckedChange={(v) => actions.highlights.mutate(v)} /></span>
        </div>
        <button type="button" onClick={() => setFilmsOpen(true)} className={cn(row, 'font-semibold text-ink-2 hover:bg-sunk')}>
          <Film size={14} />Films<span className="ml-auto font-mono text-[11px] text-ink-3">{films?.length ?? '–'}</span>
        </button>
        <Link to={`/events/${event.id}/guests?tab=favourites`} className={cn(row, 'font-semibold text-ink-2 hover:bg-sunk')}>
          <Heart size={14} />Guest favourites<span className="ml-auto font-mono text-[11px] text-ink-3">{fmt.count(favCount)}</span>
        </Link>
        <FaceIndexCard face={face} eventId={event.id} />
      </nav>

      {/* Phone: horizontal album scroller + a menu for the extras */}
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-thin">
          {[{ id: undefined as ID | undefined, name: 'All photos', photoCount: allCount }, ...ordered, ...(guestAlbum ? [guestAlbum] : [])].map((a) => (
            <button key={a.id ?? 'all'} type="button" onClick={() => onSelect(a.id)}
              className={cn('shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-bold', selected === a.id ? 'border-transparent bg-accent-soft text-accent-text' : 'border-line text-ink-2')}>
              {a.name} <span className="font-mono text-[10.5px] text-ink-3">{fmt.count(a.photoCount)}</span>
            </button>
          ))}
        </div>
        <Menu
          trigger={<button type="button" aria-label="Album options" className="grid size-8 shrink-0 place-items-center rounded-control border border-line text-ink-2"><MoreHorizontal size={16} /></button>}
          items={[
            { label: 'New album', icon: <Plus size={14} />, onSelect: () => setAdding(true) },
            ...(selected && regular.some((a) => a.id === selected) ? [
              { label: 'Rename this album', icon: <Pencil size={14} />, onSelect: () => { const a = regular.find((x) => x.id === selected)!; setRenaming(a) } },
              { label: 'Delete this album', icon: <Trash2 size={14} />, danger: true, onSelect: () => setToDelete(regular.find((x) => x.id === selected)!) },
            ] : []),
            'separator',
            { label: event.highlights ? 'Turn Highlights off' : 'Turn Highlights on', icon: <Sparkles size={14} />, onSelect: () => actions.highlights.mutate(!event.highlights) },
            { label: 'Films', icon: <Film size={14} />, hint: String(films?.length ?? 0), onSelect: () => setFilmsOpen(true) },
            { label: 'Guest favourites', icon: <Heart size={14} />, hint: String(favCount), onSelect: () => navigate(`/events/${event.id}/guests?tab=favourites`) },
            { label: `Face index ${face.on ? `${fmt.pct(face.done, face.total)}%` : 'off'}`, icon: <ScanFace size={14} />, disabled: true },
          ]}
        />
      </div>
      {adding && (
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
          <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New album name"
            onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') setAdding(false) }} />
          <button type="button" aria-label="Create album" className="rounded p-1.5 text-ok" onClick={submitNew}><Check size={16} /></button>
          <button type="button" aria-label="Cancel" className="rounded p-1.5 text-ink-3" onClick={() => setAdding(false)}><X size={16} /></button>
        </div>
      )}
      {renaming && <MobileRename album={renaming} onDone={(name) => { if (name && name !== renaming.name) actions.rename.mutate({ id: renaming.id, name }); setRenaming(null) }} />}

      <FilmsModal eventId={event.id} open={filmsOpen} onOpenChange={setFilmsOpen} />
      <ConfirmDialog
        open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} danger
        title={`Delete ${toDelete?.name ?? 'album'}?`}
        body={<>This removes the album and its <b className="text-ink">{fmt.count(toDelete?.photoCount ?? 0)} photos</b> from the gallery. Guests lose their favourites in it. This can’t be undone.</>}
        confirmLabel="Delete album"
        onConfirm={() => toDelete && actions.remove.mutate(toDelete)}
      />
    </>
  )
}

function MobileRename({ album, onDone }: { album: Album; onDone: (name: string) => void }) {
  const [v, setV] = useState(album.name)
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label="Album name" onKeyDown={(e) => { if (e.key === 'Enter') onDone(v.trim()); if (e.key === 'Escape') onDone('') }} />
      <button type="button" aria-label="Save name" className="rounded p-1.5 text-ok" onClick={() => onDone(v.trim())}><Check size={16} /></button>
      <button type="button" aria-label="Cancel" className="rounded p-1.5 text-ink-3" onClick={() => onDone('')}><X size={16} /></button>
    </div>
  )
}

function SortableAlbum({ album, active, onSelect, onRename, onDelete }: { album: Album; active: boolean; onSelect: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: album.id })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(album.name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  const commit = () => {
    const n = name.trim()
    setEditing(false)
    if (n && n !== album.name) onRename(n); else setName(album.name)
  }
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative flex items-center gap-1 rounded-control', active ? 'bg-accent-soft text-accent-text' : 'text-ink-2 hover:bg-sunk', isDragging && 'z-10 bg-surface shadow-card')}>
      <button type="button" aria-label={`Drag to reorder ${album.name}`} className="cursor-grab touch-none py-1.5 pl-1.5 text-ink-3 active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical size={13} />
      </button>
      {editing ? (
        <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label="Album name"
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(album.name); setEditing(false) } }}
          className="my-0.5 h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-1.5 text-[13px] text-ink outline-none" />
      ) : (
        <button type="button" onClick={onSelect} onDoubleClick={() => setEditing(true)} className={cn('flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-[13px]', active ? 'font-extrabold' : 'font-semibold')}>
          <span className="truncate">{album.name}</span>
          <span className="ml-auto font-mono text-[11px] text-ink-3 group-hover:hidden group-focus-within:hidden">{fmt.count(album.photoCount)}</span>
        </button>
      )}
      {!editing && (
        <span className="absolute right-1 hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
          <Tip label="Rename"><button type="button" aria-label={`Rename ${album.name}`} className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink" onClick={() => setEditing(true)}><Pencil size={12} /></button></Tip>
          <Tip label="Delete"><button type="button" aria-label={`Delete ${album.name}`} className="rounded p-1 text-ink-3 hover:bg-bad-soft hover:text-bad" onClick={onDelete}><Trash2 size={12} /></button></Tip>
        </span>
      )}
    </div>
  )
}

function FaceIndexCard({ face, eventId }: { face: { done: number; total: number; on: boolean }; eventId: ID }) {
  const running = face.on && face.done < face.total
  return (
    <div className="mt-auto rounded-card border border-line p-3">
      <div className="eyebrow flex items-center gap-1.5"><ScanFace size={12} />Face index</div>
      {face.on ? (
        <>
          <div className="mt-1 flex items-center justify-between">
            <b className="font-mono text-[12.5px] tnum">{fmt.count(face.done)} / {fmt.count(face.total)}</b>
            {running ? <Chip tone="accent">Running</Chip> : <Chip tone="ok">Done</Chip>}
          </div>
          <Meter value={face.done} max={face.total || 1} className="mt-2" />
        </>
      ) : (
        <div className="mt-1 text-[12px] text-ink-2">Face search is off. <Link to={`/events/${eventId}/settings`} className="font-bold text-accent-text hover:underline">Turn it on</Link></div>
      )}
    </div>
  )
}
