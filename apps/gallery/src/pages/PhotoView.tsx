import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, Info, Link2, Lock, MoreHorizontal, Printer, ScanFace, Share2, ShoppingBag } from 'lucide-react'
import { Button, cn, Menu, Tip, useToast } from '@frameline/ui'
import { fmt, toneCss, type Photo } from '@frameline/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useHighlights, usePhotoList } from '../lib/queries'
import { useApi } from '../lib/api'
import { SaleMark } from '../components/SaleWatermark'
import { guest, snapshot } from '../lib/guest'
import { canDownload } from '../lib/access'
import { friendlyError } from '../lib/errors'
import { Sheet } from '../components/Sheet'
import { BuySheet } from '../components/BuySheet'
import { useDownloadOne } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

/** Photo viewer (dark): swipe or arrow keys; Favourite · Download · Share · Buy print (only while selling). */
/** Photos already counted as viewed in this page session. */
const viewed = new Set<string>()

export function PhotoView() {
  const { photoId = '' } = useParams()
  const [params] = useSearchParams()
  const from = params.get('from') ?? ''
  const albumParam = params.get('album') ?? ''
  const navigate = useNavigate()
  const api = useApi()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { event, studio, session, base, seeAll, matches, matchesLoading, ownIds } = useEventCtx()

  // Which list we are stepping through. There's no single-photo endpoint for guests: the photo comes from its list.
  const listAlbum = from === 'me' || from === 'fav' || from === 'highlights' ? undefined : from || 'all'
  const albumList = usePhotoList(event.shortId, listAlbum, !!listAlbum && seeAll)
  const highlightList = useHighlights(event.shortId, from === 'highlights' && seeAll)
  const favList = useMemo(() => session.favourites.map((id) => session.favPhotos[id]).filter((p) => !!p).reverse(), [session.favourites, session.favPhotos])
  const list: Photo[] = useMemo(() => {
    if (from === 'me') return (matches ?? []).filter((p) => !albumParam || p.albumId === albumParam)
    if (from === 'fav') return favList
    if (from === 'highlights') return highlightList.data ?? []
    return albumList.data ?? []
  }, [from, albumParam, matches, favList, highlightList.data, albumList.data])
  const photo = list.find((p) => p.id === photoId) ?? matches?.find((p) => p.id === photoId) ?? session.favPhotos[photoId]
  const loading = !photo && (from === 'me' ? matchesLoading : from === 'highlights' ? highlightList.isLoading : from === 'fav' ? false : seeAll && albumList.isLoading)

  const idx = list.findIndex((p) => p.id === photoId)
  const prev = idx > 0 ? list[idx - 1] : undefined
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined
  const search = params.toString()
  const go = useCallback((p?: Photo) => { if (p) navigate(`${base}/p/${p.id}${search ? `?${search}` : ''}`, { replace: true }) }, [base, navigate, search])

  const backTo = from === 'me' ? `${base}/me${albumParam ? `?album=${albumParam}` : ''}` : from === 'fav' ? `${base}/favourites`
    : from ? `${base}/a/${from}` : seeAll ? `${base}/a/all` : base

  const own = ownIds.has(photoId)
  const isFav = session.favourites.includes(photoId)
  const allowed = seeAll || own || isFav || session.purchased.includes(photoId)

  const [info, setInfo] = useState(false)
  const [buy, setBuy] = useState(false)
  const [blocked, setBlocked] = useState<{ reason: string; buy?: boolean; selfie?: boolean } | null>(null)
  const dl = useDownloadOne(event, studio)
  const anySheet = info || buy || !!blocked

  // One gallery view per photo per page session (api.recordPhotoViews feeds the studio's per-photo views).
  useEffect(() => {
    if (!photo || !allowed || viewed.has(photo.id)) return
    const id = photo.id
    const t = setTimeout(() => { viewed.add(id); api.recordPhotoViews([id], event.shortId).catch(() => viewed.delete(id)) }, 800)
    return () => clearTimeout(t)
  }, [photo?.id, allowed, api, event.shortId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: ← → step, Esc goes back, F favourites.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (anySheet || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(prev) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(next) }
      else if (e.key === 'Escape') navigate(backTo)
      else if (e.key.toLowerCase() === 'f' && allowed) void toggleFav()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Swipe
  const start = useRef<{ x: number; y: number } | null>(null)
  const [dx, setDx] = useState(0)
  function onPointerDown(e: ReactPointerEvent) { if (e.pointerType !== 'mouse') start.current = { x: e.clientX, y: e.clientY } }
  function onPointerMove(e: ReactPointerEvent) { if (start.current) { const d = e.clientX - start.current.x; if (Math.abs(d) > Math.abs(e.clientY - start.current.y)) setDx(d) } }
  function onPointerEnd() {
    if (start.current) { if (dx > 60) go(prev); else if (dx < -60) go(next) }
    start.current = null; setDx(0)
  }

  /** Instant on this device, then sent to the API (the studio's "Who favourited"); rolled back if that fails. */
  async function toggleFav() {
    if (!photo) return
    const on = !isFav
    const id = photo.id
    const apply = (want: boolean) => guest.patchSession(event.shortId, (s) => {
      const favPhotos = { ...s.favPhotos }
      if (want) favPhotos[id] = snapshot(photo)
      else delete favPhotos[id]
      return { favourites: want ? [...s.favourites.filter((x) => x !== id), id] : s.favourites.filter((x) => x !== id), favPhotos }
    })
    apply(on)
    toast({ kind: 'success', title: on ? 'Added to favourites' : 'Removed from favourites', body: on ? `${studio.name} can see your favourites.` : undefined, action: { label: 'Undo', onClick: () => { apply(!on); void api.setFavourite(id, !on, event.shortId).catch(() => {}) } } })
    try {
      await api.setFavourite(id, on, event.shortId)
      void qc.invalidateQueries({ queryKey: ['photos', 'favs', event.shortId.toUpperCase()] })
    } catch (err) {
      apply(!on)
      const f = friendlyError(err, 'Favourite not saved')
      toast({ kind: 'error', title: f.title, body: f.body })
    }
  }

  function download() {
    if (!photo) return
    const v = canDownload(event, session, photo, own)
    if (v.ok) void dl.run(photo)
    else setBlocked(v)
  }

  const link = `${location.origin}${base}/p/${photoId}`
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: event.name, text: `A photo from ${event.name}`, url: link })
      else await copyLink()
    } catch { /* dismissed */ }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast({ title: 'Link copied', body: 'Anyone with the link still needs the gallery PIN.' }) }
    catch { toast({ kind: 'error', title: 'Couldn’t copy the link', body: 'Use Share instead.' }) }
  }

  useEffect(() => { document.documentElement.style.overflow = 'hidden'; return () => { document.documentElement.style.overflow = '' } }, [])

  const rotation = photo?.rotation ?? 0
  const sideways = rotation === 90 || rotation === 270
  const w0 = photo?.exif.width ?? 3, h0 = photo?.exif.height ?? 2
  // The frame takes the turned shape; the image inside keeps its own and is rotated (Photo.rotation).
  const w = sideways ? h0 : w0, h = sideways ? w0 : h0
  const store = event.settings.storeEnabled

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-side text-side-ink" role="region" aria-label="Photo viewer">
      <header className="flex items-center justify-between gap-2 px-2 pt-safe sm:px-4">
        <Tip label="Back (Esc)"><Link to={backTo} aria-label="Back" className="grid size-11 place-items-center rounded-full hover:bg-side-2"><ArrowLeft size={20} /></Link></Tip>
        <span className="text-[13px] font-semibold tnum text-side-ink-2" aria-live="polite">{idx >= 0 && list.length ? `${fmt.count(idx + 1)} of ${fmt.count(list.length)}` : ''}</span>
        <Menu align="end" width={200} trigger={
          <button type="button" aria-label="More" disabled={!photo || !allowed} className="grid size-11 place-items-center rounded-full hover:bg-side-2 disabled:opacity-40"><MoreHorizontal size={20} /></button>
        } items={[
          { label: 'Photo details', icon: <Info size={15} />, onSelect: () => setInfo(true) },
          { label: 'Copy link', icon: <Link2 size={15} />, onSelect: () => void copyLink() },
        ]} />
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-0 sm:px-16"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} style={{ touchAction: 'pan-y' }}>
        {loading ? (
          <div className="shimmer aspect-[3/2] w-full max-w-3xl bg-side-2" />
        ) : !photo && seeAll ? (
          <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
            <b className="text-[18px]">This photo isn’t here any more</b>
            <p className="text-[14px] text-side-ink-2">The studio may have removed it.</p>
            <Link to={backTo} className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-side-line px-5 font-bold hover:bg-side-2">Back to photos</Link>
          </div>
        ) : !photo || !allowed ? (
          <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
            <span className="mb-1 grid size-14 place-items-center rounded-full bg-side-2 text-side-gold"><Lock size={24} /></span>
            <b className="text-[18px]">Find your photos first</b>
            <p className="text-[14px] text-side-ink-2">This gallery shows each guest only the photos they’re in. Take a selfie to find yours.</p>
            <Link to={base} className="mt-3 inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-gold px-5 font-bold text-accent-ink"><ScanFace size={17} />Find my photos</Link>
          </div>
        ) : (
          <div
            className="relative max-h-full max-w-full overflow-hidden transition-transform duration-150 motion-reduce:transition-none"
            style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, calc((100dvh - 220px) * ${w / h}))`, background: photo.url ? undefined : toneCss(photo.tone), transform: dx ? `translateX(${dx}px)` : undefined }}
          >
            {photo.url && (rotation
              ? <img src={photo.url} alt={photo.filename} draggable={false} className="absolute left-1/2 top-1/2 max-w-none object-cover"
                  style={{ width: `${(sideways ? h / w : 1) * 100}%`, height: `${(sideways ? w / h : 1) * 100}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} />
              : <img src={photo.url} alt={photo.filename} className="size-full object-cover" draggable={false} />)}
            {!photo.url && <span className="sr-only">{`Photo ${photo.filename}`}</span>}
            <SaleMark shortId={event.shortId} photoId={photo.id} scale={2.5} logoUrl={studio.logoUrl} />
          </div>
        )}
        {prev && <NavBtn side="left" label="Previous photo (←)" onClick={() => go(prev)} />}
        {next && <NavBtn side="right" label="Next photo (→)" onClick={() => go(next)} />}
      </div>

      {photo && allowed && (
        <div className="mx-auto w-full max-w-xl pb-safe">
          <div className={cn('grid px-2 pt-2 text-center text-[12px]', store ? 'grid-cols-4' : 'grid-cols-3')}>
            <Action label={isFav ? 'Favourited' : 'Favourite'} on={isFav} onClick={() => void toggleFav()} icon={<Heart size={21} className={isFav ? 'fill-current' : undefined} />} pressed={isFav} />
            <Action label={dl.busy ? 'Saving…' : 'Download'} onClick={download} icon={<Download size={21} />} disabled={dl.busy} />
            <Action label="Share" onClick={() => void share()} icon={<Share2 size={21} />} />
            {store && <Action label="Buy print" onClick={() => setBuy(true)} icon={<Printer size={21} />} />}
          </div>
        </div>
      )}

      <Sheet dark open={info} onOpenChange={setInfo} title="Photo details" description={photo ? fmt.dateTime(photo.capturedAt) : undefined}>
        {photo && (
          <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 text-[14px]">
            <dt className="text-side-ink-2">File</dt><dd className="min-w-0 truncate">{photo.filename}</dd>
            <dt className="text-side-ink-2">Event</dt><dd>{event.name}</dd>
            <dt className="text-side-ink-2">Size</dt><dd className="tnum">{photo.exif.width} × {photo.exif.height}</dd>
            {photo.exif.camera && <><dt className="text-side-ink-2">Camera</dt><dd>{photo.exif.camera}</dd></>}
            {photo.exif.lens && <><dt className="text-side-ink-2">Lens</dt><dd>{photo.exif.lens}</dd></>}
            {photo.exif.exposure && <><dt className="text-side-ink-2">Exposure</dt><dd>{photo.exif.exposure}</dd></>}
            <dt className="text-side-ink-2">Taken by</dt><dd>{photo.source === 'guest' ? 'A guest' : studio.name}</dd>
          </dl>
        )}
        <p className="mt-4 text-[12.5px] text-side-ink-2">On a keyboard: ← → to move, F to favourite, Esc to close.</p>
      </Sheet>

      <Sheet dark open={!!blocked} onOpenChange={(v) => { if (!v) setBlocked(null) }} title="Can’t download this photo" description={blocked?.reason}>
        <div className="flex flex-col gap-2 pt-1">
          {blocked?.selfie && (
            <Link to={base} className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] bg-gold font-bold text-accent-ink"><ScanFace size={17} />Find my photos</Link>
          )}
          {blocked?.buy && store && (
            <Button variant={blocked.selfie ? 'side' : 'primary'} size="lg" icon={<ShoppingBag size={16} />} className="h-[46px] w-full justify-center" onClick={() => { setBlocked(null); setBuy(true) }}>Buy this photo</Button>
          )}
          {!blocked?.selfie && !(blocked?.buy && store) && <Button variant="side" size="lg" className="h-11 w-full justify-center" onClick={() => setBlocked(null)}>Close</Button>}
        </div>
      </Sheet>

      {photo && store && (
        <BuySheet open={buy} onOpenChange={setBuy} photos={[photo]} mode="photo" event={event} studio={studio} session={session} allMine={matches}
          onDownload={(bought) => { if (bought.length === 1 && bought[0].id === photo.id) void dl.run(photo); else navigate(`${base}/me?download=1`) }} />
      )}
    </div>
  )
}

function Action({ label, icon, onClick, on, disabled, pressed }: { label: string; icon: ReactNode; onClick: () => void; on?: boolean; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-control py-2 font-bold transition hover:bg-side-2 disabled:opacity-60', on ? 'text-side-gold' : 'text-side-ink hover:text-side-ink')}>
      {icon}{label}
    </button>
  )
}

function NavBtn({ side, label, onClick }: { side: 'left' | 'right'; label: string; onClick: () => void }) {
  return (
    <Tip label={label} side={side === 'left' ? 'right' : 'left'}>
      <button type="button" aria-label={label} onClick={onClick}
        className={cn('absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-side-2/80 text-side-ink hover:bg-side-2 sm:grid', side === 'left' ? 'left-3' : 'right-3')}>
        {side === 'left' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
      </button>
    </Tip>
  )
}
