import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, Info, Lock, ScanFace, Share2, ShoppingBag } from 'lucide-react'
import { Button, cn, Tip, useToast } from '@frameline/ui'
import { fmt, toneCss, type Photo } from '@frameline/shared'
import { useFavouritePhotos, useHighlights, usePhoto, usePhotoList } from '../lib/queries'
import { guest } from '../lib/guest'
import { canDownload } from '../lib/access'
import { IconBtn } from '../components/common'
import { Sheet } from '../components/Sheet'
import { BuySheet } from '../components/BuySheet'
import { EnquirySheet } from '../components/EnquirySheet'
import { useDownloadOne } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

export function PhotoView() {
  const { photoId = '' } = useParams()
  const [params] = useSearchParams()
  const from = params.get('from') ?? ''
  const albumParam = params.get('album') ?? ''
  const navigate = useNavigate()
  const { toast } = useToast()
  const { event, studio, session, base, seeAll, matches, ownIds } = useEventCtx()
  const photoQ = usePhoto(photoId)
  const photo = photoQ.data

  // Which list we are stepping through.
  const listAlbum = from === 'me' || from === 'fav' || from === 'highlights' ? undefined : from || photo?.albumId
  const albumList = usePhotoList(event.id, listAlbum, !!listAlbum && seeAll)
  const highlightList = useHighlights(event.id, from === 'highlights')
  const favList = useFavouritePhotos(event.id, from === 'fav' ? session.favourites : [])
  const list: Photo[] = useMemo(() => {
    if (from === 'me') return (matches ?? []).filter((p) => !albumParam || p.albumId === albumParam)
    if (from === 'fav') return favList.data ?? []
    if (from === 'highlights') return highlightList.data ?? []
    return albumList.data ?? []
  }, [from, albumParam, matches, favList.data, highlightList.data, albumList.data])

  const idx = list.findIndex((p) => p.id === photoId)
  const prev = idx > 0 ? list[idx - 1] : undefined
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined
  const search = params.toString()
  const go = useCallback((p?: Photo) => { if (p) navigate(`${base}/p/${p.id}${search ? `?${search}` : ''}`, { replace: true }) }, [base, navigate, search])

  const backTo = from === 'me' ? `${base}/me${albumParam ? `?album=${albumParam}` : ''}` : from === 'fav' ? `${base}/favourites`
    : from ? `${base}/a/${from}` : seeAll && photo ? `${base}/a/${photo.albumId}` : base

  const own = ownIds.has(photoId)
  const isFav = session.favourites.includes(photoId)
  const allowed = seeAll || own || isFav || session.purchased.includes(photoId)

  const [info, setInfo] = useState(false)
  const [buy, setBuy] = useState(false)
  const [enquire, setEnquire] = useState(false)
  const [blocked, setBlocked] = useState<{ reason: string; buy?: boolean; selfie?: boolean } | null>(null)
  const dl = useDownloadOne(event, studio)
  const anySheet = info || buy || enquire || !!blocked

  // Keyboard: ← → step, Esc goes back, F favourites.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (anySheet || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(prev) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(next) }
      else if (e.key === 'Escape') navigate(backTo)
      else if (e.key.toLowerCase() === 'f' && allowed) toggleFav()
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

  function toggleFav() {
    guest.patchSession(event.shortId, (s) => ({ favourites: s.favourites.includes(photoId) ? s.favourites.filter((x) => x !== photoId) : [...s.favourites, photoId] }))
    toast({ kind: 'success', title: isFav ? 'Removed from favourites' : 'Added to favourites', body: isFav ? undefined : `${studio.name} can see your picks.` })
  }

  function download() {
    if (!photo) return
    const v = canDownload(event, session, photo, own)
    if (v.ok) void dl.run(photo)
    else setBlocked(v)
  }

  async function share() {
    const url = `${location.origin}${base}/p/${photoId}`
    try {
      if (navigator.share) await navigator.share({ title: event.name, text: `A photo from ${event.name}`, url })
      else { await navigator.clipboard.writeText(url); toast({ title: 'Link copied', body: 'Anyone with the link still needs the gallery PIN.' }) }
    } catch { /* dismissed */ }
  }

  useEffect(() => { document.documentElement.style.overflow = 'hidden'; return () => { document.documentElement.style.overflow = '' } }, [])

  const w = photo?.exif.width ?? 3, h = photo?.exif.height ?? 2
  const store = event.settings.storeEnabled

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-side text-side-ink" role="region" aria-label="Photo viewer">
      <header className="flex items-center justify-between gap-2 px-2 pt-safe sm:px-4">
        <Tip label="Back (Esc)"><Link to={backTo} aria-label="Back" className="grid size-11 place-items-center rounded-full hover:bg-side-2"><ArrowLeft size={20} /></Link></Tip>
        <span className="font-mono text-[12px] tnum text-side-ink-2" aria-live="polite">{idx >= 0 && list.length ? `${idx + 1} / ${list.length}` : photo ? photo.filename : ''}</span>
        <IconBtn dark label="Photo details" onClick={() => setInfo(true)} disabled={!photo}><Info size={19} /></IconBtn>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-0 sm:px-16"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} style={{ touchAction: 'pan-y' }}>
        {photoQ.isLoading ? (
          <div className="shimmer aspect-[3/2] w-full max-w-3xl bg-side-2" />
        ) : !photo ? (
          <div className="px-6 text-center"><b className="font-display text-[20px]">This photo isn't available</b><p className="mt-1 text-[13px] text-side-ink-2">It may have been removed by the studio.</p><Link to={backTo}><Button variant="side" className="mt-4">Back to photos</Button></Link></div>
        ) : !allowed ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-side-2 text-side-gold"><Lock size={24} /></span>
            <b className="font-display text-[20px]">This photo is private</b>
            <p className="text-[13px] text-side-ink-2">Guests see only the photos they are in. Take a selfie to find yours.</p>
            <Link to={base}><Button variant="primary" icon={<ScanFace size={16} />}>Find my photos</Button></Link>
          </div>
        ) : (
          <div
            className="relative max-h-full max-w-full overflow-hidden transition-transform duration-150 motion-reduce:transition-none"
            style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, calc((100dvh - 260px) * ${w / h}))`, background: photo.url ? undefined : toneCss(photo.tone), transform: dx ? `translateX(${dx}px)` : undefined }}
          >
            {photo.url && <img src={photo.url} alt={photo.filename} className="size-full object-cover" draggable={false} />}
            {!photo.url && <span className="sr-only">{`Photo ${photo.filename}`}</span>}
          </div>
        )}
        {prev && <NavBtn side="left" label="Previous photo (←)" onClick={() => go(prev)} />}
        {next && <NavBtn side="right" label="Next photo (→)" onClick={() => go(next)} />}
      </div>

      {photo && allowed && (
        <div className="mx-auto w-full max-w-xl pb-safe">
          <div className={cn('grid px-2 pt-3 text-center text-[11px]', store ? 'grid-cols-4' : 'grid-cols-3')}>
            <Action label={isFav ? 'Favourited' : 'Favourite'} on={isFav} onClick={toggleFav} icon={<Heart size={20} className={isFav ? 'fill-current' : undefined} />} pressed={isFav} />
            <Action label={dl.busy ? 'Saving…' : 'Download'} onClick={download} icon={<Download size={20} />} disabled={dl.busy} />
            <Action label="Share" onClick={share} icon={<Share2 size={20} />} />
            {store && <Action label="Buy print" onClick={() => setBuy(true)} icon={<ShoppingBag size={20} />} />}
          </div>
          {event.settings.allowEnquiries && (
            <button type="button" onClick={() => setEnquire(true)} className="mx-3 mb-1 mt-2 flex w-[calc(100%-24px)] items-center gap-2 rounded-card border border-side-line bg-side-2 px-3.5 py-2.5 text-left text-[12.5px] text-side-ink-2 hover:border-side-ink-2/40">
              <span className="flex-1">Want photos like these? <b className="text-side-gold">Enquire with {studio.name}</b></span>
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}

      <Sheet dark open={info} onOpenChange={setInfo} title={photo?.filename ?? 'Photo'} description={photo ? fmt.dateTime(photo.capturedAt) : undefined}>
        {photo && (
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
            <dt className="text-side-ink-2">Event</dt><dd>{event.name}</dd>
            <dt className="text-side-ink-2">Size</dt><dd className="font-mono tnum">{photo.exif.width} × {photo.exif.height}</dd>
            {photo.exif.camera && <><dt className="text-side-ink-2">Camera</dt><dd>{photo.exif.camera}</dd></>}
            {photo.exif.lens && <><dt className="text-side-ink-2">Lens</dt><dd>{photo.exif.lens}</dd></>}
            {photo.exif.exposure && <><dt className="text-side-ink-2">Exposure</dt><dd className="font-mono text-[12px]">{photo.exif.exposure}</dd></>}
            <dt className="text-side-ink-2">Photographer</dt><dd>{photo.source === 'guest' ? 'A guest' : `${studio.name}`}</dd>
          </dl>
        )}
        <p className="mt-4 text-[11.5px] text-side-ink-2">Keys: ← → to move, F to favourite, Esc to close.</p>
      </Sheet>

      <Sheet dark open={!!blocked} onOpenChange={(v) => { if (!v) setBlocked(null) }} title="Can't download this photo">
        <p className="text-[13.5px] text-side-ink-2">{blocked?.reason}</p>
        <div className="mt-4 flex flex-col gap-2">
          {blocked?.selfie && <Link to={base}><Button variant="primary" size="lg" icon={<ScanFace size={16} />} className="w-full justify-center">Find my photos</Button></Link>}
          {blocked?.buy && store && <Button variant={blocked.selfie ? 'side' : 'primary'} size="lg" icon={<ShoppingBag size={16} />} className="w-full justify-center" onClick={() => { setBlocked(null); setBuy(true) }}>Buy this photo</Button>}
        </div>
      </Sheet>

      {photo && store && <BuySheet open={buy} onOpenChange={setBuy} photos={[photo]} mode="photo" event={event} studio={studio} session={session} />}
      <EnquirySheet dark open={enquire} onOpenChange={setEnquire} studio={studio} source={`${event.name} gallery · photo viewer`} shortId={event.shortId} session={session} />
    </div>
  )
}

function Action({ label, icon, onClick, on, disabled, pressed }: { label: string; icon: ReactNode; onClick: () => void; on?: boolean; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={cn('flex flex-col items-center gap-1 rounded-control py-2 font-semibold transition hover:bg-side-2 disabled:opacity-60', on ? 'text-side-gold' : 'text-side-ink-2 hover:text-side-ink')}>
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
