import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, FolderInput, ImageIcon, Info, Share2, Trash2, X,
} from 'lucide-react'
import { fmt, type PhotoSort } from '@frameline/shared'
import { Button, ConfirmDialog, EmptyState, Menu, Modal, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useAlbums, useEvent, usePeople, usePhoto, usePhotoIds, usePhotos, useStudio, useWatermark } from '../../lib/queries'
import { GALLERY_URL, copyText, downloadBlob, liveUrl } from '../workspace/lib'
import { renderPhoto } from './download'
import { InfoPanel } from './InfoPanel'
import { INITIAL_VIEW, MIN_SCALE, Stage, type ViewState } from './Stage'
import { BottomToolbar, Filmstrip, Sep, VBtn } from './ViewerControls'

const SORTS: PhotoSort[] = ['capture', 'name', 'sequence']

export default function PhotoViewer() {
  const { eventId: eventParam = '', photoId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const api = useApi()
  const toast = useToast()
  const albumParam = params.get('album') ?? undefined
  const sort = (SORTS.includes(params.get('sort') as PhotoSort) ? params.get('sort') : 'capture') as PhotoSort

  const event = useEvent(eventParam).data
  const eventId = event?.id
  const photoQ = usePhoto(photoId)
  const photo = photoQ.data
  // Every id in this album/sort for previous/next; only the photos around this one are loaded for the filmstrip.
  const idsQ = usePhotoIds(eventId, { albumId: albumParam, sort })
  const ids = useMemo(() => idsQ.data ?? [], [idsQ.data])
  const index = ids.indexOf(photoId)
  const windowStart = Math.max(0, index - 5)
  const stripQ = usePhotos(index >= 0 ? eventId : undefined, { albumId: albumParam, sort, offset: windowStart, limit: 11 })
  const albums = useAlbums(eventId).data ?? []
  const people = usePeople(eventId).data ?? []
  const studio = useStudio().data
  const wm = useWatermark().data

  const album = albums.find((a) => a.id === photo?.albumId)
  const url = liveUrl(photo?.url)

  /* ---------- Navigation ---------- */
  const qs = useMemo(() => { const q = new URLSearchParams(); if (albumParam) q.set('album', albumParam); if (sort !== 'capture') q.set('sort', sort); return q.size ? `?${q}` : '' }, [albumParam, sort])
  const backUrl = `/events/${eventParam}${qs}`
  const close = useCallback(() => navigate(backUrl), [navigate, backUrl])
  const goTo = useCallback((id: string) => navigate(`/events/${eventParam}/photos/${id}${qs}`, { replace: true }), [navigate, eventParam, qs])
  const prev = index > 0 ? { id: ids[index - 1] } : undefined
  const next = index >= 0 && index < ids.length - 1 ? { id: ids[index + 1] } : undefined

  /* ---------- View state ---------- */
  const [view, setView] = useState<ViewState>(INITIAL_VIEW)
  const [natural, setNatural] = useState(4)
  const maxScale = Math.max(8, natural)
  const [faces, setFaces] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [coverGuard, setCoverGuard] = useState(false)
  useEffect(() => setView(INITIAL_VIEW), [photoId])
  const zoomBy = (k: number) => setView((v) => { const s = Math.min(maxScale, Math.max(MIN_SCALE, v.scale * k)); return s <= 1 ? { ...v, scale: s, x: 0, y: 0 } : { ...v, scale: s } })

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      toast.error('Full screen isn’t available', 'Your browser blocked it. Press F11 instead.')
    }
  }, [toast])

  // Slideshow: 3 s per photo, stops at the end.
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => {
      if (next) goTo(next.id)
      else { setPlaying(false); toast.toast({ kind: 'info', title: 'Slideshow finished', body: `That was the last photo in ${album?.name ?? 'this album'}.` }) }
    }, 3000)
    return () => clearTimeout(t)
  }, [playing, next, goTo, toast, album?.name])

  /* ---------- Actions ---------- */
  const personName = useCallback((pid: string) => {
    const p = people.find((x) => x.id === pid)
    if (!p) return ''
    if (p.name) return p.name
    return `Guest ${people.filter((x) => !x.name).indexOf(p) + 1}`
  }, [people])

  const setCover = useAction((scope: 'event' | 'album') => api.setCover(eventId!, photoId, scope), {
    success: (_d, s) => (s === 'event' ? 'Event cover updated' : `${album?.name ?? 'Album'} cover updated`),
  })
  const hide = useAction((hidden: boolean) => api.updatePhotos([photoId], { hidden }), { success: (_d, h) => (h ? 'Hidden from guests' : 'Visible to guests again') })
  const move = useAction((a: { id: string; name: string }) => api.updatePhotos([photoId], { albumId: a.id }), {
    success: (_d, a) => `Moved to ${a.name}`,
    onSuccess: (_d, a) => { if (albumParam) navigate(`/events/${eventParam}/photos/${photoId}?album=${a.id}${sort !== 'capture' ? `&sort=${sort}` : ''}`, { replace: true }) },
  })
  const remove = useAction(() => api.deletePhotos([photoId]), {
    success: 'Photo deleted',
    onSuccess: () => { const to = next ?? prev; if (to) goTo(to.id); else close() },
  })

  const shareUrl = event ? `${GALLERY_URL}/${event.shortId}/p/${photoId}` : ''
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: photo?.filename, text: event?.name, url: shareUrl }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    const ok = await copyText(shareUrl)
    if (ok) toast.success('Link copied', shareUrl.replace(/^https?:\/\//, '')); else toast.error('Couldn’t copy the link', shareUrl)
  }
  const [downloading, setDownloading] = useState(false)
  const download = useCallback(async (kind: 'web' | 'original') => {
    if (!photo) return
    setDownloading(true)
    try {
      // Originals: the real uploaded file when there is one. Web size (and tone placeholders) are drawn in the browser.
      if (kind === 'original' && url) {
        const res = await fetch(url).catch(() => null)
        if (res?.ok) {
          const file = await res.blob()
          downloadBlob(file, photo.filename)
          toast.success('Original downloaded', `${fmt.bytes(file.size)} · ${photo.filename}`)
          return
        }
      }
      const blob = await renderPhoto(photo, url, kind === 'web'
        ? { maxEdge: 2048, watermark: event?.settings.watermarkOff ? undefined : `© ${wm?.text || studio?.name || 'Studio'}` }
        : {})
      const base = photo.filename.replace(/\.[^.]+$/, '')
      downloadBlob(blob, kind === 'web' ? `${base}_2048.jpg` : `${base}.jpg`)
      toast.success(kind === 'web' ? 'Web size downloaded' : 'Original downloaded', `${fmt.bytes(blob.size)} · ${photo.filename}`)
    } catch (e) {
      toast.error('Download failed', (e as Error).message)
    } finally { setDownloading(false) }
  }, [photo, url, event?.settings.watermarkOff, wm?.text, studio?.name, toast])

  const askDelete = () => (event?.coverPhotoId === photoId ? setCoverGuard(true) : setConfirmDelete(true))

  /* ---------- Keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('[role="dialog"][data-state="open"], [role="menu"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'ArrowLeft': if (prev) goTo(prev.id); break
        case 'ArrowRight': if (next) goTo(next.id); break
        case ' ': e.preventDefault(); setPlaying((p) => !p); break
        case 'f': case 'F': setFaces((f) => !f); break
        case 'd': case 'D': download('web'); break
        case '+': case '=': zoomBy(1.25); break
        case '-': zoomBy(0.8); break
        case '0': setView(INITIAL_VIEW); break
        case 'Escape': if (infoOpen) setInfoOpen(false); else if (!document.fullscreenElement) close(); break
        default: return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------- Render ---------- */
  if (photoQ.isError) {
    return (
      <div className="grid h-full place-items-center bg-side text-side-ink">
        <EmptyState title="This photo isn’t available" body="It may have been deleted or moved. Go back to the event to see what’s there now."
          action={<Button variant="primary" onClick={close}>Back to the event</Button>} />
      </div>
    )
  }

  const neighbours = index >= 0 && stripQ.data ? stripQ.data.items : photo ? [photo] : []
  const isEventCover = event?.coverPhotoId === photoId
  const isAlbumCover = !!album && album.coverPhotoId === photoId
  const moveTargets = albums.filter((a) => a.kind === 'album' && a.id !== photo?.albumId)

  return (
    <div className="flex h-full flex-col bg-side text-side-ink md:grid md:grid-cols-[1fr_300px]">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={close} className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-side-line px-2.5 text-[12px] font-bold hover:bg-side-2">
              <ArrowLeft size={13} /><span className="max-w-[120px] truncate">{albums.find((a) => a.id === albumParam)?.name ?? 'All photos'}</span>
            </button>
            <span className="font-mono text-[12px] text-side-ink-2" aria-label="Photo position">
              <b className="text-side-gold">{index >= 0 ? index + 1 : '–'}</b> / {fmt.count(ids.length)}
            </span>
            {photo && (
              <span className="hidden min-w-0 items-center gap-1.5 rounded-control border border-side-line bg-side-2 py-0.5 pl-2 pr-0.5 sm:inline-flex">
                <span className="truncate font-mono text-[12px]">{photo.filename}</span>
                <VBtn label="Copy filename" icon={<Copy size={12} />} className="h-6 px-1.5 text-side-ink-2" onClick={async () => { if (await copyText(photo.filename)) toast.success('Filename copied') }} />
              </span>
            )}
          </div>
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-card border border-side-line bg-side-2 p-1 scrollbar-thin">
            <Menu align="end" width={240} trigger={<button type="button" className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-bold hover:bg-side"><ImageIcon size={13} /><span className="hidden lg:inline">Cover</span><ChevronDown size={11} /></button>}
              items={[
                { label: 'Set as event cover', icon: isEventCover ? <Check size={14} /> : <ImageIcon size={14} />, hint: isEventCover ? 'Current' : undefined, onSelect: () => setCover.mutate('event'), disabled: !eventId },
                { label: `Set as ${album?.name ?? 'album'} cover`, icon: isAlbumCover ? <Check size={14} /> : <FolderInput size={14} />, hint: isAlbumCover ? 'Current' : undefined, onSelect: () => setCover.mutate('album'), disabled: !eventId },
              ]} />
            {photo && (
              <VBtn label={photo.hidden ? 'Unhide' : 'Hide from guests'} icon={photo.hidden ? <Eye size={13} /> : <EyeOff size={13} />} onClick={() => hide.mutate(!photo.hidden)}>
                <span className="hidden lg:inline">{photo.hidden ? 'Unhide' : 'Hide'}</span>
              </VBtn>
            )}
            <Menu align="end" trigger={<button type="button" className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-bold hover:bg-side" aria-label="Move to album"><FolderInput size={13} /><span className="hidden lg:inline">Move</span><ChevronDown size={11} /></button>}
              items={moveTargets.length ? moveTargets.map((a) => ({ label: a.name, hint: fmt.count(a.photoCount), onSelect: () => move.mutate(a) })) : [{ label: 'No other albums yet', disabled: true }]} />
            <VBtn label="Share" icon={<Share2 size={13} />} onClick={share}><span className="hidden lg:inline">Share</span></VBtn>
            <Menu align="end" width={250} trigger={<button type="button" disabled={downloading} className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] bg-gold px-2 text-[12px] font-bold text-accent-ink disabled:opacity-60" aria-label="Download"><Download size={13} /><span className="hidden sm:inline">{downloading ? 'Preparing…' : 'Download'}</span><ChevronDown size={11} /></button>}
              items={[
                { label: 'Download web size', hint: `2048 px${event?.settings.watermarkOff ? '' : ' · watermarked'}`, icon: <Download size={14} />, onSelect: () => download('web') },
                { label: 'Download original', hint: photo ? `${photo.exif.width} × ${photo.exif.height}` : undefined, icon: <Download size={14} />, onSelect: () => download('original') },
                'separator',
                { label: 'Copy share link', icon: <Copy size={14} />, onSelect: async () => { if (await copyText(shareUrl)) toast.success('Link copied') } },
              ]} />
            <VBtn label="Delete photo" icon={<Trash2 size={13} />} danger onClick={askDelete} />
            <Sep />
            <VBtn label="Close (Esc)" icon={<X size={14} />} onClick={close} />
          </div>
        </div>

        {/* Stage */}
        <div className="relative min-h-[240px] flex-1">
          {photo ? (
            <Stage photo={photo} url={url} view={view} setView={setView} showFaces={faces} personName={personName} maxScale={maxScale}
              watermark={event?.settings.watermarkOff ? undefined : wm?.text || studio?.name} onNaturalScale={setNatural} />
          ) : <div className="grid h-full place-items-center"><Skeleton className="h-[60%] w-[70%] bg-side-2" /></div>}
          <NavArrow side="left" disabled={!prev} onClick={() => prev && goTo(prev.id)} />
          <NavArrow side="right" disabled={!next} onClick={() => next && goTo(next.id)} />
        </div>

        {/* Bottom */}
        <div className="flex flex-col gap-2 pb-2.5 pt-1.5">
          <div className="flex justify-center px-3">
            <BottomToolbar playing={playing} onPlay={() => setPlaying((p) => !p)} zoomPct={Math.round((view.scale / natural) * 100)}
              onZoomOut={() => zoomBy(0.8)} onFit={() => setView((v) => ({ ...v, scale: 1, x: 0, y: 0 }))} onZoomIn={() => zoomBy(1.25)}
              on100={() => setView((v) => ({ ...v, scale: Math.min(maxScale, natural), x: 0, y: 0 }))}
              fullscreen={fullscreen} onFullscreen={toggleFullscreen}
              onRotate={(d) => setView((v) => ({ ...v, rotate: v.rotate + d, x: 0, y: 0 }))} onFlip={() => setView((v) => ({ ...v, flip: !v.flip }))}
              onReset={() => setView(INITIAL_VIEW)} faces={faces} onFaces={() => setFaces((f) => !f)} />
          </div>
          <Filmstrip photos={neighbours} currentId={photoId} onPick={(p) => goTo(p.id)} />
          <div className="flex items-center justify-between gap-3 px-4">
            <span className="hidden font-mono text-[10.5px] text-side-ink-2 sm:block">← → photos · Space slideshow · F face boxes · D download · Esc close</span>
            <button type="button" onClick={() => setInfoOpen(true)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border border-side-line px-3 text-[12px] font-bold md:hidden">
              <Info size={14} />Info
            </button>
          </div>
        </div>
      </div>

      {/* Right panel (desktop) / bottom sheet (phone) */}
      <aside className="hidden min-h-0 border-l border-side-line bg-side-2 md:block">
        {photo && <InfoPanel photo={photo} album={album} position={index + 1} total={ids.length} people={people} personName={personName} eventId={eventParam} />}
      </aside>
      {infoOpen && photo && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden">
          <button type="button" aria-label="Close details" className="flex-1 bg-black/50" onClick={() => setInfoOpen(false)} />
          <div role="dialog" aria-label="Photo details" className="max-h-[70vh] rounded-t-modal border-t border-side-line bg-side-2">
            <div className="flex justify-between px-4 pt-3">
              <span className="truncate font-mono text-[12px]">{photo.filename}</span>
              <button type="button" aria-label="Close details" onClick={() => setInfoOpen(false)} className="rounded p-1 hover:bg-side"><X size={16} /></button>
            </div>
            <div className="h-[60vh]"><InfoPanel photo={photo} album={album} position={index + 1} total={ids.length} people={people} personName={personName} eventId={eventParam} /></div>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} danger title="Delete this photo?" confirmLabel="Delete photo"
        body={<><b className="font-mono text-ink">{photo?.filename}</b> disappears from the gallery and from guests’ favourites straight away. This can’t be undone.</>}
        onConfirm={() => remove.mutate(undefined)} />
      <Modal open={coverGuard} onOpenChange={setCoverGuard} title="This photo is the event cover" width={440}
        footer={<Button variant="primary" onClick={() => setCoverGuard(false)}>Got it</Button>}>
        <div className="px-6 py-4 text-[13.5px] text-ink-2">
          Guests see it first when they open the gallery. Set another photo as the cover first, then delete this one.
        </div>
      </Modal>
    </div>
  )
}

function NavArrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button type="button" aria-label={side === 'left' ? 'Previous photo (←)' : 'Next photo (→)'} disabled={disabled} onClick={onClick}
      className={`absolute top-1/2 z-10 grid size-[38px] -translate-y-1/2 place-items-center rounded-full border border-side-line bg-side-2 text-side-ink hover:bg-side disabled:opacity-30 ${side === 'left' ? 'left-3 sm:left-4' : 'right-3 sm:right-4'}`}>
      <Icon size={18} />
    </button>
  )
}
