import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, EyeOff, Eye, FolderInput, ImageIcon, Info, MoreHorizontal, Pause, Play,
  Plus, RotateCw, Share2, Trash2, Wand2, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { ENHANCE_COST, fmt, type Album, type Photo } from '@frameline/shared'
import { Button, EmptyState, Menu, Modal, PhotoTile, Skeleton, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAlbums, useEvent, usePeople, usePhoto, usePhotos, useStudio, useWatermark } from '../../lib/queries'
import { GALLERY_URL, copyText, downloadBlob, liveUrl, parseSort, photosLabel } from '../workspace/lib'
import { trashWithUndo, usePendingDeletes } from '../workspace/pending'
import { useGridIds } from '../workspace/photoQuery'
import { NewAlbumModal, useMovePhotos } from '../workspace/SelectionBar'
import { downloadPhoto } from './download'
import { InfoPanel } from './InfoPanel'
import { INITIAL_VIEW, MIN_SCALE, Stage, type ViewState } from './Stage'
import { Kbd, VBtn } from './ViewerControls'

/**
 * /events/:eventId/photos/:photoId — the photo first, tools on demand. Dark, no app shell.
 * Top: back · "12 of 401 · filename" · Details / Share / Download ▾ / ⋯ / close. Side panel closed by default (?info=1).
 * Keys: ← → next · Space slideshow · D download · I details · Esc close.
 */
export default function PhotoViewer() {
  const { eventId: eventParam = '', photoId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const api = useApi()
  const toast = useToast()
  const albumParam = params.get('album') ?? undefined
  const sort = parseSort(params.get('sort'))
  const personId = params.get('person') ?? undefined
  const infoOpen = params.get('info') === '1'
  const setInfo = (v: boolean) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set('info', '1'); else n.delete('info'); return n }, { replace: true })

  const event = useEvent(eventParam).data
  const eventId = event?.id
  const photoQ = usePhoto(photoId)
  const photo = photoQ.data
  const pending = usePendingDeletes()
  const idsQ = useGridIds(eventId, sort, albumParam, personId)
  const ids = useMemo(() => (idsQ.data ?? []).filter((id) => !pending.photos.has(id) || id === photoId), [idsQ.data, pending.photos, photoId])
  const index = ids.indexOf(photoId)
  const albums = useAlbums(eventId).data ?? []
  const people = usePeople(eventId).data ?? []
  const studio = useStudio().data
  const wm = useWatermark().data
  const album = albums.find((a) => a.id === photo?.albumId)
  const url = liveUrl(photo?.url)
  const move = useMovePhotos(eventParam)

  /* ---------- Navigation ---------- */
  const qs = useMemo(() => {
    const q = new URLSearchParams()
    if (albumParam) q.set('album', albumParam)
    if (sort !== 'newest') q.set('sort', sort)
    if (personId) q.set('person', personId)
    return q
  }, [albumParam, sort, personId])
  const backUrl = `/events/${eventParam}${qs.size ? `?${qs}` : ''}`
  const close = useCallback(() => navigate(backUrl), [navigate, backUrl])
  const goTo = useCallback((id: string) => {
    const q = new URLSearchParams(qs)
    if (infoOpen) q.set('info', '1')
    navigate(`/events/${eventParam}/photos/${id}${q.size ? `?${q}` : ''}`, { replace: true })
  }, [navigate, eventParam, qs, infoOpen])
  const prev = index > 0 ? ids[index - 1] : undefined
  const next = index >= 0 && index < ids.length - 1 ? ids[index + 1] : undefined

  /* ---------- View ---------- */
  const [view, setView] = useState<ViewState>(INITIAL_VIEW)
  const [natural, setNatural] = useState(4)
  const maxScale = Math.max(8, natural)
  const [playing, setPlaying] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [newAlbum, setNewAlbum] = useState(false)
  const [coverGuard, setCoverGuard] = useState(false)
  useEffect(() => setView(INITIAL_VIEW), [photoId])
  // Rotation is stored on the photo (api.rotatePhotos), so every device and download sees it.
  const savedRotation = photo?.id === photoId ? photo.rotation : undefined
  useEffect(() => { if (savedRotation !== undefined) setView((v) => ({ ...v, rotate: savedRotation })) }, [savedRotation])
  const zoomBy = (k: number) => setView((v) => { const s = Math.min(maxScale, Math.max(MIN_SCALE, v.scale * k)); return s <= 1 ? { ...v, scale: s, x: 0, y: 0 } : { ...v, scale: s } })

  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => {
      if (next) goTo(next)
      else { setPlaying(false); toast.toast({ kind: 'info', title: 'Slideshow finished', body: 'That was the last photo.' }) }
    }, 3000)
    return () => clearTimeout(t)
  }, [playing, next, goTo, toast])

  /* ---------- Actions ---------- */
  const personName = useCallback((pid: string) => {
    const p = people.find((x) => x.id === pid)
    if (!p) return ''
    return p.name ?? `Guest ${people.filter((x) => !x.name).indexOf(p) + 1}`
  }, [people])

  const setCover = async (scope: 'event' | 'album') => {
    if (!eventId) return
    const before = scope === 'event' ? event?.coverPhotoId : album?.coverPhotoId
    try {
      await api.setCover(eventId, photoId, scope)
      const what = scope === 'event' ? 'Event cover' : `${album?.name ?? 'Album'} cover`
      if (before && before !== photoId) toast.undo(`${what} changed`, () => { api.setCover(eventId, before, scope).catch((e) => toast.error('Couldn’t undo', errorMessage(e))) })
      else toast.success(`${what} set`)
    } catch (e) { toast.error('Couldn’t set the cover', errorMessage(e)) }
  }
  const hide = async () => {
    if (!photo) return
    const hidden = !photo.hidden
    try {
      await api.updatePhotos([photoId], { hidden })
      toast.undo(hidden ? 'Hidden from guests' : 'Guests can see it again', () => { api.updatePhotos([photoId], { hidden: !hidden }).catch((e) => toast.error('Couldn’t undo', errorMessage(e))) })
    } catch (e) { toast.error('Couldn’t change who sees it', errorMessage(e)) }
  }
  const rotate = () => {
    const id = photoId
    setView((v) => ({ ...v, rotate: v.rotate + 90, x: 0, y: 0 }))
    api.rotatePhotos([id], 90).then(
      () => toast.undo('Rotated', () => { api.rotatePhotos([id], -90).catch((e) => toast.error('Couldn’t undo', errorMessage(e))) }),
      (e) => { setView((v) => ({ ...v, rotate: v.rotate - 90 })); toast.error('Couldn’t rotate the photo', errorMessage(e)) },
    )
  }
  const moveTo = async (a: Album) => {
    if (!photo) return
    setMoveOpen(false)
    await move([photoId], a, new Map([[photoId, photo]]))
  }
  const trashNow = () => {
    const id = photoId
    const undo = trashWithUndo('photos', [id], () => api.deletePhotos([id]), () => api.restorePhotos([id]),
      (e, what) => toast.error(what === 'trash' ? 'Couldn’t trash the photo' : 'Couldn’t bring the photo back', errorMessage(e)))
    toast.undo('Photo moved to trash', () => { undo(); goTo(id) }, 'It’s deleted for good after 30 days.')
    const to = next ?? prev
    if (to) goTo(to); else close()
  }
  const trash = () => (event?.coverPhotoId === photoId ? setCoverGuard(true) : trashNow())

  const shareUrl = event ? `${GALLERY_URL}/${event.shortId}/p/${photoId}` : ''
  const copyLink = async () => { if (await copyText(shareUrl)) toast.success('Link copied', shareUrl.replace(/^https?:\/\//, '')); else toast.error('Couldn’t copy the link', shareUrl) }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: photo?.filename, text: event?.name, url: shareUrl }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    await copyLink()
  }
  const [downloading, setDownloading] = useState(false)
  const download = useCallback(async (kind: 'web' | 'original') => {
    if (!photo) return
    setDownloading(true)
    try {
      const size = await downloadPhoto(api, photo, kind, { url, watermark: event?.settings.watermarkOff ? undefined : `© ${wm?.text || studio?.name || 'Studio'}`, save: downloadBlob })
      toast.success(kind === 'web' ? 'Web size downloaded' : 'Original downloaded', `${fmt.bytes(size)} · ${photo.filename}`)
    } catch (e) { toast.error('Download failed', errorMessage(e)) } finally { setDownloading(false) }
  }, [api, photo, url, event?.settings.watermarkOff, wm?.text, studio?.name, toast])

  /* ---------- Keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('[role="dialog"], [role="menu"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'ArrowLeft': if (prev) goTo(prev); break
        case 'ArrowRight': if (next) goTo(next); break
        case ' ': e.preventDefault(); setPlaying((p) => !p); break
        case 'd': case 'D': void download('web'); break
        case 'i': case 'I': setInfo(!infoOpen); break
        case '+': case '=': zoomBy(1.25); break
        case '-': zoomBy(0.8); break
        case 'Escape': if (infoOpen) setInfo(false); else close(); break
        default: return
      }
    }
    // Capture phase: runs before an open menu or dialog closes itself on Esc, so Esc only closes that.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (photoQ.isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-side px-4 text-side-ink">
        <EmptyState title="This photo isn’t here any more" body="It may have been moved to trash. Go back to the event to see what’s there now."
          action={<Button variant="primary" onClick={close}>Back to the event</Button>} />
      </div>
    )
  }

  const isEventCover = event?.coverPhotoId === photoId
  const isAlbumCover = !!album && album.coverPhotoId === photoId
  const downloadMenu = (trigger: ReactNode) => (
    <Menu tone="dark" align="end" width={240} trigger={trigger} items={[
      { label: 'Web size', description: `2048 px${event?.settings.watermarkOff ? '' : ', with your watermark'}`, icon: <Download size={15} />, onSelect: () => void download('web') },
      { label: 'Original', description: photo ? `${photo.exif.width} × ${photo.exif.height} · ${fmt.bytes(photo.exif.sizeBytes)}` : undefined, icon: <Download size={15} />, onSelect: () => void download('original') },
      'separator',
      { label: 'Copy link', icon: <Copy size={15} />, onSelect: () => void copyLink() },
    ]} />
  )
  const position = index >= 0 ? `${fmt.count(index + 1)} of ${fmt.count(ids.length)}` : ''

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-side text-side-ink">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <VBtn icon={<ArrowLeft size={17} />} aria-label="Back to the event" onClick={close} className="border-transparent" />
          <span className="min-w-0 truncate text-[13.5px] text-side-ink-2 tnum">{position}{photo && <span className="hidden sm:inline"> · {photo.filename}</span>}</span>
          {photo?.hidden && <span className="hidden shrink-0 rounded-full border border-side-line px-2 py-0.5 text-[12px] font-bold text-side-ink-2 sm:inline">Hidden</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <VBtn icon={<Info size={15} />} active={infoOpen} aria-pressed={infoOpen} onClick={() => setInfo(!infoOpen)}>Details</VBtn>
            <VBtn icon={<Share2 size={15} />} onClick={() => void share()}>Share</VBtn>
            {downloadMenu(<VBtn icon={<Download size={15} />} disabled={downloading}>{downloading ? 'Preparing…' : 'Download'}</VBtn>)}
          </div>
          <Menu tone="dark" align="end" width={270} trigger={<VBtn icon={<MoreHorizontal size={17} />} aria-label="More photo actions" />} items={[
            { label: 'Set as event cover', description: isEventCover ? 'This is the cover now' : 'Guests see it first', icon: <ImageIcon size={15} />, disabled: isEventCover, onSelect: () => void setCover('event') },
            { label: `Set as ${album?.name ?? 'album'} cover`, description: isAlbumCover ? 'This is the album cover now' : undefined, icon: <ImageIcon size={15} />, disabled: isAlbumCover || !album, onSelect: () => void setCover('album') },
            { label: 'Move to album…', icon: <FolderInput size={15} />, onSelect: () => setMoveOpen(true) },
            { label: 'Rotate', icon: <RotateCw size={15} />, onSelect: rotate },
            { label: photo?.hidden ? 'Show to guests' : 'Hide from guests', icon: photo?.hidden ? <Eye size={15} /> : <EyeOff size={15} />, onSelect: () => void hide() },
            { label: 'Improve with AI', description: `Uses your wallet: ${fmt.rupees(ENHANCE_COST)} a photo`, icon: <Wand2 size={15} />, onSelect: () => navigate(`/enhance/${photoId}`) },
            'separator',
            { label: 'Move to trash', description: isEventCover ? 'Pick a new cover first' : 'You can undo', icon: <Trash2 size={15} />, danger: true, onSelect: trash },
          ]} />
          <VBtn icon={<X size={18} />} aria-label="Close (Esc)" onClick={close} className="border-transparent" />
        </div>
      </header>

      {/* Stage + side panel */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {photo ? (
            <Stage photo={photo} url={url} view={view} setView={setView} showFaces={false} personName={personName} maxScale={maxScale}
              watermark={event?.settings.watermarkOff ? undefined : wm?.text || studio?.name} onNaturalScale={setNatural} />
          ) : <div className="grid h-full place-items-center"><Skeleton className="h-[60%] w-[70%] bg-side-2" /></div>}
          <NavArrow side="left" disabled={!prev} onClick={() => prev && goTo(prev)} />
          <NavArrow side="right" disabled={!next} onClick={() => next && goTo(next)} />
        </div>
        {infoOpen && photo && (
          <>
            <button type="button" aria-label="Close details" className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setInfo(false)} />
            <aside aria-label="Photo details"
              className="fixed inset-x-0 bottom-0 z-40 h-[70dvh] rounded-t-[22px] border-t border-side-line bg-side-2 md:static md:z-auto md:h-auto md:w-[330px] md:rounded-none md:border-l md:border-t-0">
              <span className="mx-auto mt-2.5 block h-1 w-9 rounded-full bg-side-line md:hidden" aria-hidden />
              <InfoPanel photo={photo} album={album} event={event} people={people} personName={personName} />
            </aside>
          </>
        )}
      </div>

      {/* Bottom row */}
      <footer className="flex flex-wrap items-center justify-center gap-2 px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] sm:gap-4 sm:py-3.5">
        <VBtn icon={playing ? <Pause size={15} /> : <Play size={15} />} onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Slideshow'}</VBtn>
        <div className="flex items-center gap-1">
          <VBtn icon={<ZoomOut size={15} />} aria-label="Zoom out" onClick={() => zoomBy(0.8)} className="border-transparent" />
          <button type="button" onClick={() => setView((v) => ({ ...v, scale: 1, x: 0, y: 0 }))} className="min-h-[34px] w-12 text-center text-[12.5px] font-bold text-side-ink-2 tnum hover:text-side-ink" aria-label="Fit to screen">
            {view.scale === 1 ? 'Fit' : `${Math.round((view.scale / natural) * 100)}%`}
          </button>
          <VBtn icon={<ZoomIn size={15} />} aria-label="Zoom in" onClick={() => zoomBy(1.25)} className="border-transparent" />
        </div>
        <div className="flex items-center gap-2 sm:hidden">
          <VBtn icon={<Info size={15} />} active={infoOpen} onClick={() => setInfo(!infoOpen)}>Details</VBtn>
          <VBtn icon={<Share2 size={15} />} onClick={() => void share()}>Share</VBtn>
          {downloadMenu(<VBtn icon={<Download size={15} />}>Download</VBtn>)}
        </div>
        <span className="hidden items-center gap-1.5 text-[12px] text-side-ink-2 lg:flex">
          <Kbd>←</Kbd><Kbd>→</Kbd> next · <Kbd>Space</Kbd> slideshow · <Kbd>D</Kbd> download · <Kbd>I</Kbd> details · <Kbd>Esc</Kbd> close
        </span>
      </footer>

      <Modal open={moveOpen} onOpenChange={setMoveOpen} title="Move to album" width={400}>
        <ul className="-mx-2 flex flex-col">
          {albums.filter((a) => a.kind === 'album' && !pending.albums.has(a.id)).sort((a, b) => a.order - b.order).map((a) => (
            <li key={a.id}>
              <button type="button" disabled={a.id === photo?.albumId} onClick={() => void moveTo(a)}
                className="flex min-h-[44px] w-full items-center justify-between rounded-control px-2.5 text-left text-[14px] font-bold hover:bg-sunk disabled:opacity-50">
                {a.name}<span className="text-[12.5px] font-medium text-ink-3">{a.id === photo?.albumId ? 'It’s here now' : photosLabel(a.photoCount)}</span>
              </button>
            </li>
          ))}
          <li className="mt-1 border-t border-line pt-1">
            <button type="button" onClick={() => { setMoveOpen(false); setNewAlbum(true) }} className="flex min-h-[44px] w-full items-center gap-2 rounded-control px-2.5 text-[14px] font-bold text-accent-text hover:bg-accent-soft"><Plus size={15} />New album…</button>
          </li>
        </ul>
      </Modal>
      <NewAlbumModal open={newAlbum} onOpenChange={setNewAlbum} eventId={eventParam} count={1} onCreated={(a) => void moveTo(a)} />
      <CoverGuard open={coverGuard} onOpenChange={setCoverGuard} eventId={eventParam} albumId={albumParam} currentId={photoId}
        onPicked={async (p) => {
          try { await api.setCover(eventParam, p.id, 'event'); setCoverGuard(false); toast.success('New event cover set'); trashNow() }
          catch (e) { toast.error('Couldn’t set the cover', errorMessage(e)) }
        }} />
    </div>
  )
}

/** Trashing the event cover: pick another photo as the cover first. */
function CoverGuard({ open, onOpenChange, eventId, albumId, currentId, onPicked }: {
  open: boolean; onOpenChange: (v: boolean) => void; eventId: string; albumId?: string; currentId: string; onPicked: (p: Photo) => Promise<void>
}) {
  const photos = usePhotos(open ? eventId : undefined, { albumId, limit: 13 }).data?.items.filter((p) => p.id !== currentId && p.status === 'ready').slice(0, 12)
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Pick a new cover first" width={560}
      description="This photo is the event cover, the first thing guests see. Choose another one, then this photo goes to trash.">
      {!photos ? <Skeleton className="h-40" /> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <button key={p.id} type="button" disabled={!!busy} onClick={async () => { setBusy(p.id); await onPicked(p); setBusy(null) }}
              aria-label={`Use ${p.filename} as the cover`} className="rounded-[8px] outline-offset-2 hover:outline hover:outline-2 hover:outline-accent disabled:opacity-60">
              <PhotoTile tone={p.tone} url={liveUrl(p.url)} alt={p.filename} rounded="rounded-[8px]" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

function NavArrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button type="button" aria-label={side === 'left' ? 'Previous photo (←)' : 'Next photo (→)'} disabled={disabled} onClick={onClick}
      className={`absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full text-side-ink/80 hover:bg-side-2 hover:text-side-ink disabled:opacity-0 ${side === 'left' ? 'left-2 sm:left-5' : 'right-2 sm:right-5'}`}>
      <Icon size={24} />
    </button>
  )
}
