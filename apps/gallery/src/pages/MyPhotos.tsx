import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, RotateCcw, ScanFace, ShoppingBag, UserRoundSearch } from 'lucide-react'
import { Button, EmptyState, cn } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { useAlbums } from '../lib/queries'
import { useGuest } from '../lib/guest'
import { BrandButton, Container, GridSkeleton, PhotoGrid, TopBar } from '../components/common'
import { SelfieFlow } from '../components/SelfieFlow'
import { DownloadSheet } from '../components/DownloadSheet'
import { BuySheet } from '../components/BuySheet'
import { useEventCtx } from './EventLayout'

export function MyPhotos() {
  const { event, studio, session, base, matches, matchesLoading } = useEventCtx()
  const [params, setParams] = useSearchParams()
  const albumsQ = useAlbums(event.id)
  const [selfie, setSelfie] = useState(false)
  const [download, setDownload] = useState(false)
  const [buy, setBuy] = useState(false)
  const favCount = useGuest((s) => s.events[event.shortId.toUpperCase()]?.favourites.length ?? 0)
  const albumFilter = params.get('album') ?? ''

  const all = useMemo(() => matches ?? [], [matches])
  const chips = useMemo(() => {
    const counts = new Map<string, number>()
    all.forEach((p) => counts.set(p.albumId, (counts.get(p.albumId) ?? 0) + 1))
    return (albumsQ.data ?? []).filter((a) => counts.has(a.id)).map((a) => ({ id: a.id, name: a.name, count: counts.get(a.id)! }))
  }, [all, albumsQ.data])
  const shown = albumFilter ? all.filter((p) => p.albumId === albumFilter) : all
  const n = shown.length

  const bar = (
    <TopBar back={base} studioName={studio.name} favouritesTo={`${base}/favourites`} favCount={favCount} />
  )

  if (!session.match) {
    return (
      <div className="min-h-dvh">
        {bar}
        <EmptyState icon={<ScanFace size={26} />} title="Find your photos" body={`Take a selfie and we'll show every photo you're in from ${event.name}.`}
          action={<BrandButton icon={<ScanFace size={18} />} onClick={() => setSelfie(true)} className="w-auto px-6">Find my photos</BrandButton>} />
        <SelfieFlow open={selfie} onOpenChange={setSelfie} event={event} studio={studio} base={base} />
      </div>
    )
  }

  const store = event.settings.storeEnabled
  const dlOff = event.settings.downloads === 'none' && !shown.every((p) => session.purchased.includes(p.id))

  return (
    <div className="min-h-dvh pb-28">
      {bar}
      <Container className="pt-4">
        <h1 className="font-display text-[24px] font-semibold leading-tight sm:text-[28px]">
          {matchesLoading ? 'Finding your photos…' : all.length ? `We found you in ${fmt.count(all.length)} photos` : 'We couldn\'t find you yet'}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-2">
          {session.match.thumb
            ? <img src={session.match.thumb} alt="Your selfie" className="size-7 rounded-full object-cover ring-2 ring-accent" />
            : <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent-text"><UserRoundSearch size={14} /></span>}
          <span>{session.match.via === 'link' ? `Matched by ${studio.name}` : 'Matched to your selfie'}</span>
          <span aria-hidden>·</span>
          <button type="button" onClick={() => setSelfie(true)} className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline"><RotateCcw size={12} />Retake</button>
        </div>

        {chips.length > 1 && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by album">
            <Chip on={!albumFilter} onClick={() => setParams({}, { replace: true })}>All {all.length}</Chip>
            {chips.map((c) => (
              <Chip key={c.id} on={albumFilter === c.id} onClick={() => setParams({ album: c.id }, { replace: true })}>{c.name} {c.count}</Chip>
            ))}
          </div>
        )}

        <div className="mt-3">
          {matchesLoading ? <GridSkeleton /> : n ? (
            <PhotoGrid photos={shown} hrefFor={(p) => `${base}/p/${p.id}?from=me${albumFilter ? `&album=${albumFilter}` : ''}`} favourites={session.favourites} />
          ) : (
            <EmptyState icon={<ScanFace size={26} />} title={albumFilter ? 'You\'re not in this album' : 'No matches yet'}
              body={albumFilter ? 'Try another album, or retake your selfie in better light.' : `Photos may still be uploading. Try a selfie facing the light, or check back later.`}
              action={<div className="flex gap-2">{albumFilter && <Button onClick={() => setParams({}, { replace: true })}>Show all</Button>}<Button variant="primary" onClick={() => setSelfie(true)}>Retake selfie</Button></div>} />
          )}
        </div>
        {!!n && <p className="mt-6 text-center text-[12px] text-ink-3"><Link to={base} className="font-semibold text-ink-2 hover:underline">Back to {event.name}</Link></p>}
      </Container>

      {!!n && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md pb-safe">
          <div className="mx-auto flex max-w-md gap-2 px-3 pt-2.5 sm:max-w-lg">
            {store && <Button size="lg" icon={<ShoppingBag size={16} />} className="flex-1 justify-center" onClick={() => setBuy(true)}>Buy</Button>}
            <Button variant={dlOff ? 'secondary' : 'primary'} size="lg" icon={<Download size={16} />} className={cn('flex-[1.4] justify-center', dlOff && 'text-ink-3')} onClick={() => setDownload(true)}>
              {dlOff ? 'Downloads off' : `Download ${fmt.count(n)}`}
            </Button>
          </div>
        </div>
      )}

      <SelfieFlow open={selfie} onOpenChange={setSelfie} event={event} studio={studio} base={base} />
      <DownloadSheet open={download} onOpenChange={setDownload} photos={shown} event={event} studio={studio} session={session} onBuy={store ? () => setBuy(true) : undefined}
        title={dlOff ? 'Downloads are off' : undefined} />
      {store && <BuySheet open={buy} onOpenChange={setBuy} photos={shown} mode="mine" event={event} studio={studio} session={session} />}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold transition', on ? 'bg-side text-side-gold' : 'bg-sunk text-ink-2 hover:text-ink')}>
      {children}
    </button>
  )
}
