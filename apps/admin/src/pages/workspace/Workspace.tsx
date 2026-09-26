import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImagePlus, Images, Upload } from 'lucide-react'
import { fmt, type ID, type Photo, type PhotoFilter, type PhotoSort } from '@frameline/shared'
import { Button, EmptyState, Select, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAlbums, useEvent, usePeople, usePhotos } from '../../lib/queries'
import { QueryError } from '../system'
import { AlbumRail } from './AlbumRail'
import { ImportModal } from './ImportModal'
import { captureRange } from './lib'
import { GRID_COLS, PhotoGrid } from './PhotoGrid'
import { SelectionBar } from './SelectionBar'
import { SHARE_TABS, ShareModal, type ShareTab } from './share/ShareModal'
import { Toolbar, type ViewMode } from './Toolbar'
import { UploadModal, isImage } from './UploadModal'
import { WorkspaceHeader } from './WorkspaceHeader'

const SORTS: PhotoSort[] = ['capture', 'name', 'sequence']
const FILTERS: PhotoFilter[] = ['all', 'people', 'favourites', 'hidden']
const SCROLL_STEP = 64
const MODE_KEY = 'frameline.workspace.view'

function readView(): { mode: ViewMode; perPage: number } {
  try { const v = JSON.parse(localStorage.getItem(MODE_KEY) ?? ''); if (v.mode && v.perPage) return v } catch { /* default */ }
  return { mode: 'scroll', perPage: 64 }
}

export default function Workspace() {
  const { eventId: eventParam = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const api = useApi()
  const eventQ = useEvent(eventParam)
  const event = eventQ.data
  const id = event?.id
  const albumsQ = useAlbums(id)
  const albums = useMemo(() => albumsQ.data ?? [], [albumsQ.data])
  const people = usePeople(id).data

  /* ---------- URL state ---------- */
  const albumId = params.get('album') ?? undefined
  const sort = (SORTS.includes(params.get('sort') as PhotoSort) ? params.get('sort') : 'capture') as PhotoSort
  const filter = (FILTERS.includes(params.get('filter') as PhotoFilter) ? params.get('filter') : 'all') as PhotoFilter
  const personId = params.get('person') ?? undefined
  const modal = params.get('modal')
  const shareTab = (SHARE_TABS.includes(params.get('tab') as ShareTab) ? params.get('tab') : 'link') as ShareTab
  const setParam = useCallback((patch: Record<string, string | undefined>, replace = false) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '') n.delete(k); else n.set(k, v) }
      return n
    }, { replace })
  }, [setParams])
  const openModal = (m: string, extra: Record<string, string | undefined> = {}) => setParam({ modal: m, ...extra })
  const closeModal = () => setParam({ modal: undefined, tab: undefined })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<number | null>(null)
  const [selectingAll, setSelectingAll] = useState(false)

  /* ---------- Paging ---------- */
  const [view, setView] = useState(readView)
  useEffect(() => { try { localStorage.setItem(MODE_KEY, JSON.stringify(view)) } catch { /* ignore */ } }, [view])
  const [page, setPage] = useState(0)
  const [scrollLimit, setScrollLimit] = useState(SCROLL_STEP)
  const baseQ = useMemo(() => ({ albumId, sort, filter: filter === 'all' ? undefined : filter, personId }), [albumId, sort, filter, personId])
  const baseKey = JSON.stringify(baseQ)
  useEffect(() => { setPage(0); setScrollLimit(SCROLL_STEP); setSelected(new Set()); anchor.current = null }, [baseKey])
  const q = view.mode === 'pages' ? { ...baseQ, offset: page * view.perPage, limit: view.perPage } : { ...baseQ, offset: 0, limit: scrollLimit }
  const photosQ = usePhotos(id, q)
  const photos = useMemo(() => photosQ.data?.items ?? [], [photosQ.data])
  const total = photosQ.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / view.perPage))
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [page, pages])

  // Capture-time range for the section title.
  const firstQ = usePhotos(id, { ...baseQ, sort: 'capture', limit: 1 })
  const lastQ = usePhotos(total > 1 ? id : undefined, { ...baseQ, sort: 'capture', offset: Math.max(0, (firstQ.data?.total ?? 1) - 1), limit: 1 })
  const range = captureRange(firstQ.data?.items[0]?.capturedAt, (lastQ.data?.items[0] ?? firstQ.data?.items[0])?.capturedAt)

  // Endless scroll: load the next batch when the sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const canLoadMore = view.mode === 'scroll' && photos.length < total
  useEffect(() => {
    const el = sentinel.current
    if (!el || !canLoadMore) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !photosQ.isFetching) setScrollLimit((l) => l + SCROLL_STEP)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [canLoadMore, photosQ.isFetching, total])

  /* ---------- Selection ---------- */
  const toggle = (index: number, rangeSel: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (rangeSel && anchor.current !== null) {
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
  const clear = useCallback(() => { setSelected(new Set()); anchor.current = null }, [])
  const selectAll = async () => {
    if (!id) return
    setSelectingAll(true)
    try { const all = await api.listPhotos(id, baseQ); setSelected(new Set(all.items.map((p) => p.id))) } finally { setSelectingAll(false) }
  }
  // Drop ids that no longer exist (deleted / moved out) — keep only what's loaded or explicitly all-selected.
  const [hiddenMap, setHiddenMap] = useState<Map<string, boolean>>(new Map())
  useEffect(() => { setHiddenMap((m) => { const n = new Map(m); photos.forEach((p) => n.set(p.id, p.hidden)); return n }) }, [photos])
  const selectedIds = useMemo(() => [...selected], [selected])
  const allHidden = selectedIds.length > 0 && selectedIds.every((sid) => hiddenMap.get(sid) ?? filter === 'hidden')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !modal && selected.size) clear() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, selected.size, clear])

  /* ---------- Files: drop anywhere / choose ---------- */
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const takeFiles = useCallback((list: FileList | File[] | null) => {
    const imgs = Array.from(list ?? []).filter(isImage)
    if (!imgs.length) return
    setFiles((f) => [...f, ...imgs])
    setParam({ modal: 'upload' })
  }, [setParam])
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
  if (eventQ.isError) return <div className="p-6"><QueryError error={eventQ.error} retry={() => eventQ.refetch()} /></div>
  if (!event) return <WorkspaceSkeleton />

  const album = albums.find((a) => a.id === albumId)
  const regularAlbums = albums.filter((a) => a.kind === 'album')
  const uploadTarget = album?.kind === 'album' ? album : undefined
  const person = people?.find((p) => p.id === personId)
  const sectionTitle = album?.name ?? 'All photos'
  const open = (p: Photo) => {
    const qs = new URLSearchParams()
    if (albumId) qs.set('album', albumId)
    if (sort !== 'capture') qs.set('sort', sort)
    navigate(`/events/${event.id}/photos/${p.id}${qs.size ? `?${qs}` : ''}`)
  }
  const selectAlbum = (aid?: ID) => setParam({ album: aid, person: undefined })

  return (
    <div className="relative flex min-h-full flex-col md:h-full">
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { takeFiles(e.target.files); e.target.value = '' }} />
      <WorkspaceHeader event={event} onImport={() => openModal('import')} onShare={() => openModal('share', { tab: 'link' })} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {albumsQ.isLoading ? <Skeleton className="m-3 hidden h-64 w-[200px] md:block" /> : (
          <AlbumRail event={event} albums={albums} selected={albumId} onSelect={selectAlbum} />
        )}
        <section className="min-w-0 flex-1 px-4 pb-24 pt-3 sm:px-5 md:overflow-y-auto md:scrollbar-thin" aria-label="Photos">
          <Toolbar
            eventId={event.id} sort={sort} onSort={(s) => setParam({ sort: s === 'capture' ? undefined : s }, true)}
            filter={filter} onFilter={(f) => setParam({ filter: f === 'all' ? undefined : f }, true)}
            personId={personId} onPerson={(pid) => setParam({ person: pid }, true)}
            mode={view.mode} onMode={(m) => setView((v) => ({ ...v, mode: m }))}
            onUpload={() => fileInput.current?.click()}
          />
          <div className="mb-2.5 mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <b className="font-display text-[16px]">{sectionTitle}</b>{' '}
              <span className="text-[12.5px] text-ink-3">
                {fmt.count(total)} photo{total === 1 ? '' : 's'}{person ? ` with ${person.name ?? 'this guest'}` : ''}{filter !== 'all' ? ` · ${filter}` : ''}{range ? ` · ${range}` : ''}
              </span>
            </div>
            <span className="hidden text-[12px] text-ink-3 sm:inline">Drop photos anywhere to add them</span>
          </div>

          {photosQ.isError ? <QueryError error={photosQ.error} retry={() => photosQ.refetch()} />
            : photosQ.isLoading ? <div className={GRID_COLS}>{Array.from({ length: 21 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
            : !photos.length ? (
              filter !== 'all' || personId ? (
                <EmptyState icon={<Images size={22} />} title="No photos match" body="Try another filter, or show every photo in this album."
                  action={<Button onClick={() => setParam({ filter: undefined, person: undefined }, true)}>Show all photos</Button>} />
              ) : (
                <EmptyState icon={<ImagePlus size={22} />} title={regularAlbums.length ? `${sectionTitle} is empty` : 'Add your first photos'}
                  body={regularAlbums.length ? 'Drop photos anywhere on this page, choose them from your computer, or import a Google Drive folder.' : 'Create an album in the left rail, then drop photos here.'}
                  action={<div className="flex flex-wrap justify-center gap-2"><Button variant="primary" icon={<Upload size={14} />} onClick={() => fileInput.current?.click()}>Choose photos</Button><Button onClick={() => openModal('import')}>Import from Drive</Button></div>} />
              )
            ) : (
              <PhotoGrid photos={photos} selected={selected} onToggle={toggle} onOpen={open} />
            )}

          {view.mode === 'scroll' && canLoadMore && (
            <div ref={sentinel} className="flex justify-center py-5">
              <Button loading={photosQ.isFetching} onClick={() => setScrollLimit((l) => l + SCROLL_STEP)}>
                Load more · {fmt.count(total - photos.length)} left
              </Button>
            </div>
          )}
          {view.mode === 'pages' && total > 0 && (
            <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                Per page
                <Select value={view.perPage} onChange={(e) => { setView((v) => ({ ...v, perPage: Number(e.target.value) })); setPage(0) }} className="h-8 w-[80px]">
                  {[32, 64, 128].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </label>
              <div className="flex items-center gap-2">
                <Button size="sm" icon={<ChevronLeft size={13} />} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="font-mono text-[12px] text-ink-2">Page {page + 1} of {pages}</span>
                <Button size="sm" iconRight={<ChevronRight size={13} />} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </nav>
          )}
        </section>
      </div>

      {selected.size > 0 && (
        <SelectionBar eventId={event.id} ids={selectedIds} total={total} allHidden={allHidden} albums={albums} currentAlbumId={albumId}
          onSelectAll={selectAll} selectingAll={selectingAll} onClear={clear} />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-side/70 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 rounded-modal border-2 border-dashed border-side-gold px-12 py-10 text-center text-side-ink">
            <Upload size={30} className="text-side-gold" />
            <b className="font-display text-[22px]">Drop to add to {uploadTarget?.name ?? 'this event'}</b>
            <span className="text-[13px] text-side-ink-2">{uploadTarget ? 'You’ll review quality and duplicates before anything uploads.' : 'You’ll choose the album next.'}</span>
          </div>
        </div>
      )}

      <UploadModal open={modal === 'upload'} onOpenChange={(v) => { if (!v) { closeModal(); setFiles([]) } }} event={event} albums={albums}
        albumId={uploadTarget?.id} files={files} onFiles={setFiles} />
      <ImportModal open={modal === 'import'} onOpenChange={(v) => !v && closeModal()} event={event} albums={albums} albumId={uploadTarget?.id} />
      <ShareModal open={modal === 'share'} onOpenChange={(v) => !v && closeModal()} event={event} albums={albums} tab={shareTab} onTab={(t) => setParam({ tab: t }, true)} />
    </div>
  )
}

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-7" aria-busy="true" aria-label="Loading event">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="mt-2 flex gap-4">
        <Skeleton className="hidden h-80 w-[200px] md:block" />
        <div className={`${GRID_COLS} flex-1`}>{Array.from({ length: 21 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
      </div>
    </div>
  )
}
