import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpDown, Check, HardDriveDownload, Images, Upload, Camera, X } from 'lucide-react'
import { fmt, type ID, type Photo } from '@frameline/shared'
import { Button, EmptyState, Menu, Skeleton, useToast } from '@frameline/ui'
import { errorMessage } from '../../lib/api'
import { useAlbums, usePeople } from '../../lib/queries'
import { useModalParam, useParamState } from '../../lib/url'
import { useEventContext } from '../event/EventLayout'
import { QueryError } from '../system'
import { AlbumRail, useVisibleAlbums } from './AlbumRail'
import { GRID_SORTS, parseSort, photosLabel, type GridSort } from './lib'
import { isImage, setPendingFiles, usePendingDeletes } from './pending'
import { GRID_COLS, PhotoGrid } from './PhotoGrid'
import { useGridIds, usePhotoPages } from './photoQuery'
import { PhotoSelectionBar } from './SelectionBar'
import { UploadStrip } from './UploadStrip'
import { useEventUploads } from '../../layout/UploadDock'

/**
 * /events/:eventId (index): the Photos tab. Left rail of albums, a grid that loads as you scroll, one Sort menu
 * (newest, oldest, name, people, favourites, hidden) and Select. Drop photos anywhere on the tab to upload.
 * The event header, tabs and every modal (?modal=upload|share|import|films|faces) come from EventLayout / EventModals.
 */
export default function Workspace() {
  const { event } = useEventContext()
  const navigate = useNavigate()
  const toast = useToast()
  const m = useModalParam()
  const [params, setParams] = useParamState()
  const albumsQ = useAlbums(event.id)
  const albums = useMemo(() => albumsQ.data ?? [], [albumsQ.data])
  const regular = useVisibleAlbums(albums)
  const people = usePeople(event.id).data
  const pending = usePendingDeletes()
  const uploads = useEventUploads(event.id)

  /* ---------- URL state ---------- */
  const albumParam = params.get('album') ?? undefined
  const album = albums.find((a) => a.id === albumParam && !pending.albums.has(a.id))
  const albumId = album?.id
  const sort = parseSort(params.get('sort'))
  const personId = params.get('person') ?? undefined
  const person = people?.find((p) => p.id === personId)
  const setAlbum = (id?: ID) => setParams({ album: id, person: undefined })
  const setSort = (s: GridSort) => setParams({ sort: s === 'newest' ? undefined : s }, true)

  /* ---------- Photos ---------- */
  const q = usePhotoPages(event.id, sort, albumId, personId)
  const idsQ = useGridIds(event.id, sort, albumId, personId)
  const photos = useMemo(() => q.photos.filter((p) => !pending.photos.has(p.id)), [q.photos, pending.photos])
  const allIds = useMemo(() => (idsQ.data ?? []).filter((id) => !pending.photos.has(id)), [idsQ.data, pending.photos])
  const total = idsQ.data ? allIds.length : Math.max(0, q.total - (q.photos.length - photos.length))
  const known = useMemo(() => new Map<ID, Photo>(photos.map((p) => [p.id, p])), [photos])

  // Automatic paging: load the next page when the sentinel nears the viewport.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage() }, { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, photos.length])

  /* ---------- Selection ---------- */
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)
  const anchor = useRef<number | null>(null)
  const scope = `${albumId}|${sort}|${personId}`
  useEffect(() => { setSelected(new Set()); setSelectMode(false); anchor.current = null }, [scope])
  // Drop ids that were trashed.
  useEffect(() => { setSelected((s) => { const n = new Set([...s].filter((id) => !pending.photos.has(id))); return n.size === s.size ? s : n }) }, [pending.photos])
  const toggle = (index: number, range: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (range && anchor.current !== null) {
        const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)]
        photos.slice(a, b + 1).forEach((p) => next.add(p.id))
      } else {
        const pid = photos[index].id
        if (next.has(pid)) next.delete(pid); else next.add(pid)
      }
      return next
    })
    anchor.current = index
  }
  const clear = useCallback(() => { setSelected(new Set()); setSelectMode(false); anchor.current = null }, [])
  const selectAll = async () => {
    setSelectingAll(true)
    try { const r = await idsQ.refetch(); setSelected(new Set((r.data ?? []).filter((id) => !pending.photos.has(id)))) }
    catch (e) { toast.error('Couldn’t select every photo', errorMessage(e)) }
    finally { setSelectingAll(false) }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !m.modal && (selected.size || selectMode)) clear() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [m.modal, selected.size, selectMode, clear])

  /* ---------- Files: drop anywhere on the tab, or choose ---------- */
  const uploadTarget = album?.kind === 'album' ? album : undefined
  const fileInput = useRef<HTMLInputElement>(null)
  const takeFiles = useCallback((list: FileList | File[] | null) => {
    const all = Array.from(list ?? [])
    const imgs = all.filter(isImage)
    if (!imgs.length) { if (all.length) toast.error('Those aren’t photos', 'Choose JPG, PNG, HEIC or WebP files.'); return }
    setPendingFiles(imgs)
    m.open('upload', uploadTarget ? { album: uploadTarget.id } : {})
  }, [m, toast, uploadTarget?.id])
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true) }
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const drop = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; setDragging(false); takeFiles(e.dataTransfer?.files ?? null) }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [takeFiles])

  /* ---------- Render ---------- */
  const eventEmpty = !albumsQ.isLoading && regular.every((a) => a.photoCount === 0) && !albumId && !uploads.jobs.length && !personId && sort === 'newest'
  const title = person ? `Photos of ${person.name ?? 'this guest'}` : album?.name ?? 'All photos'
  const sortLabel = GRID_SORTS.find((s) => s.value === sort)!.label
  const open = (p: Photo) => {
    const qs = new URLSearchParams()
    if (albumId) qs.set('album', albumId)
    if (sort !== 'newest') qs.set('sort', sort)
    if (personId) qs.set('person', personId)
    navigate(`/events/${event.id}/photos/${p.id}${qs.size ? `?${qs}` : ''}`)
  }
  const choose = () => fileInput.current?.click()

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-[22px]">
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { takeFiles(e.target.files); e.target.value = '' }} />
      {albumsQ.isLoading ? <Skeleton className="hidden h-64 w-[200px] md:block" /> : albumsQ.isError ? null : (
        <AlbumRail event={event} albums={albums} selected={albumId} onSelect={setAlbum} />
      )}

      <section className="min-w-0 flex-1 pb-28 md:pb-20" aria-label="Photos">
        <UploadStrip eventId={event.id} />
        {albumsQ.isError ? <QueryError error={albumsQ.error} retry={() => albumsQ.refetch()} />
          : eventEmpty ? <EmptyEvent onChoose={choose} onImport={() => m.open('import')} />
          : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <b className="truncate text-[16px] font-extrabold">{title}</b>
                  <span className="text-[13px] text-ink-3 tnum">{photosLabel(total)}</span>
                  {person && (
                    <button type="button" onClick={() => setParams({ person: undefined }, true)} className="inline-flex items-center gap-1 self-center rounded-full border border-line-2 px-2 py-0.5 text-[12px] font-bold text-ink-2 hover:bg-sunk">
                      <X size={12} />Show everyone
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Menu width={250} trigger={<Button size="sm" icon={<ArrowUpDown size={13} />} className="max-sm:h-10">{sortLabel}</Button>}
                    items={GRID_SORTS.map((s) => ({
                      label: s.label, description: s.description,
                      icon: sort === s.value ? <Check size={14} /> : <span className="inline-block w-3.5" />,
                      onSelect: () => setSort(s.value),
                    }))} />
                  <Button size="sm" className="max-sm:h-10" aria-pressed={selectMode || selected.size > 0}
                    onClick={() => (selectMode || selected.size ? clear() : setSelectMode(true))}>
                    {selectMode || selected.size ? 'Done' : 'Select'}
                  </Button>
                </div>
              </div>

              {q.isError ? <QueryError error={q.error} retry={() => q.refetch()} />
                : q.isLoading ? <div className={GRID_COLS}>{Array.from({ length: 18 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-[8px] sm:aspect-[3/2]" />)}</div>
                : !photos.length ? (
                  sort !== 'newest' && sort !== 'oldest' && sort !== 'name' || personId ? (
                    <EmptyState icon={<Images size={22} />} title={personId ? 'No photos of this person here' : sort === 'hidden' ? 'Nothing is hidden' : sort === 'favourites' ? 'No favourites yet' : 'No faces found yet'}
                      body={personId ? 'Try All photos, or another album.' : sort === 'hidden' ? 'Every photo here is visible to guests.' : sort === 'favourites' ? 'Guests’ hearts show up here once they start picking.' : 'Faces are found a minute or two after photos upload.'}
                      action={<Button onClick={() => setParams({ sort: undefined, person: undefined }, true)}>Show all, newest first</Button>} />
                  ) : album?.kind === 'guest' ? (
                    <EmptyState icon={<Images size={22} />} title="No guest photos yet" body="Photos guests add from the gallery appear here." />
                  ) : (
                    <EmptyState icon={<Upload size={22} />} title={`${title} is empty`} body="Drop photos anywhere on this page, or choose them from your computer."
                      action={<Button icon={<Upload size={14} />} onClick={choose}>Choose photos</Button>} />
                  )
                ) : (
                  <PhotoGrid photos={photos} selected={selected} selecting={selectMode} onToggle={(i, r) => { setSelectMode(true); toggle(i, r) }} onOpen={open} />
                )}

              {hasNextPage && photos.length > 0 && (
                <div ref={sentinel} className="flex justify-center py-6">
                  <Button variant="ghost" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                    {isFetchingNextPage ? 'Loading more photos' : `Show more · ${fmt.count(Math.max(0, total - photos.length))} left`}
                  </Button>
                </div>
              )}
            </>
          )}
      </section>

      {(selected.size > 0 || selectMode) && (
        <PhotoSelectionBar event={event} ids={[...selected]} total={total} known={known} albums={regular} currentAlbumId={album?.kind === 'album' ? albumId : undefined}
          onSelectAll={() => void selectAll()} selectingAll={selectingAll} onClear={clear} />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-paper/85 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 rounded-modal border-2 border-dashed border-accent bg-surface px-12 py-10 text-center shadow-float">
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-text"><Upload size={22} /></span>
            <b className="font-display text-[22px] font-semibold">Drop to add to {uploadTarget?.name ?? event.name}</b>
            <span className="text-[13.5px] text-ink-2">You’ll check the options before anything uploads.</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** ev-empty: one big drop zone with one button. Drive import and camera sync are offered here. */
function EmptyEvent({ onChoose, onImport }: { onChoose: () => void; onImport: () => void }) {
  return (
    <div className={'grid min-h-[360px] place-items-center rounded-[14px] border-2 border-dashed border-line-2 bg-surface px-5 py-10 text-center sm:min-h-[520px]'}>
      <div className="flex max-w-[420px] flex-col items-center gap-2.5">
        <span className="grid size-[52px] place-items-center rounded-full bg-accent-soft text-accent-text"><Upload size={24} /></span>
        <h2 className="text-[22px] font-extrabold leading-tight">Add your first photos</h2>
        <p className="text-[14px] text-ink-2"><span className="hidden sm:inline">Drag a folder here, or choose photos. </span>You can leave this page while they upload.</p>
        <Button variant="primary" size="lg" icon={<Upload size={16} />} onClick={onChoose} className="mt-1 max-sm:w-full">Choose photos</Button>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] text-ink-3">
          or
          <button type="button" onClick={onImport} className="inline-flex min-h-[32px] items-center gap-1 font-bold text-ink-2 hover:text-ink hover:underline"><HardDriveDownload size={14} />Import from Google Drive</button>
          ·
          <Link to="/camera-sync" className="inline-flex min-h-[32px] items-center gap-1 font-bold text-ink-2 hover:text-ink hover:underline"><Camera size={14} />Connect your camera</Link>
        </p>
      </div>
    </div>
  )
}
