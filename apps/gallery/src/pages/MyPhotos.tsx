import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, RotateCcw, ScanFace, SearchX, ShoppingBag } from 'lucide-react'
import { Button } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { Container, GridSkeleton, LoadError, PageTop, Pill, PhotoGrid, PrimaryButton, StateBlock, TextButton } from '../components/common'
import { EventShell } from '../components/Shell'
import { SelfieFlow } from '../components/SelfieFlow'
import { DownloadSheet } from '../components/DownloadSheet'
import { BuySheet } from '../components/BuySheet'
import { useEventCtx } from './EventLayout'

export function MyPhotos() {
  const { event, studio, session, base, matches, matchesLoading, matchesError, retryMatches, forceOffline } = useEventCtx()
  const [params, setParams] = useSearchParams()
  const [selfie, setSelfie] = useState(false)
  const [download, setDownload] = useState(false)
  const [buy, setBuy] = useState(false)
  const albumFilter = params.get('album') ?? ''
  // "Download all" after buying from the photo viewer lands here with ?download=1.
  const wantsDownload = params.get('download') === '1' && !!matches?.length
  useEffect(() => {
    if (!wantsDownload) return
    setDownload(true)
    setParams((p) => { p.delete('download'); return p }, { replace: true })
  }, [wantsDownload, setParams])

  const all = useMemo(() => matches ?? [], [matches])
  const chips = useMemo(() => {
    const counts = new Map<string, number>()
    all.forEach((p) => counts.set(p.albumId, (counts.get(p.albumId) ?? 0) + 1))
    return event.albums.filter((a) => counts.has(a.id)).map((a) => ({ id: a.id, name: a.name, count: counts.get(a.id)! }))
  }, [all, event.albums])
  const shown = albumFilter ? all.filter((p) => p.albumId === albumFilter) : all
  const n = shown.length
  const store = event.settings.storeEnabled
  const retake = <TextButton className="-mr-1 text-[13px]" onClick={() => setSelfie(true)}>Not you? Retake</TextButton>

  return (
    <EventShell event={event} base={base} tab="me" offline={forceOffline}>
      <PageTop back={base} title="Your photos" right={session.match ? retake : undefined} />
      <Container className="pt-3 md:pt-4">
        {!session.match ? (
          <StateBlock icon={<ScanFace size={24} />} title="Find your photos" body={`Take a selfie and we’ll show every photo you’re in from ${event.name}.`}>
            <PrimaryButton icon={<ScanFace size={18} />} onClick={() => setSelfie(true)}>Find my photos</PrimaryButton>
          </StateBlock>
        ) : matchesLoading ? (
          <div className="flex flex-col gap-3"><div className="shimmer h-6 w-44 rounded bg-sunk" /><GridSkeleton /></div>
        ) : matchesError && !matches ? (
          <LoadError error={matchesError} onRetry={retryMatches} title="Your photos didn’t load" />
        ) : all.length === 0 ? (
          <StateBlock icon={<SearchX size={24} />} tone="neutral" title="We couldn’t find you yet" body="Photos are still being added. Try a selfie facing the light, or check back later.">
            <PrimaryButton icon={<RotateCcw size={16} />} onClick={() => setSelfie(true)}>Retake selfie</PrimaryButton>
          </StateBlock>
        ) : (
          <>
            <div className={`flex items-center justify-between gap-2 ${store ? "flex-wrap" : ""}`}>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {session.match.thumb && <img src={session.match.thumb} alt="Your selfie" className="size-9 shrink-0 rounded-full object-cover ring-2 ring-accent" />}
                <div className="min-w-0">
                  <b className="block text-[15px] tnum sm:text-[16px]">You’re in {fmt.count(all.length)} {all.length === 1 ? 'photo' : 'photos'}</b>
                  <span className="block truncate text-[12.5px] text-ink-3">{session.match.via === 'link' ? `Matched by ${studio.name}` : 'Matched to your selfie'}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {store && <Button size="md" icon={<ShoppingBag size={15} />} className="h-11" onClick={() => setBuy(true)}>Buy</Button>}
                <Button size="md" icon={<Download size={15} />} className="h-11" onClick={() => setDownload(true)}>
                  {albumFilter ? `Download ${fmt.count(n)}` : 'Download all'}
                </Button>
              </div>
            </div>

            {chips.length > 1 && (
              <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show photos from">
                <Pill on={!albumFilter} onClick={() => setParams({}, { replace: true })}>All</Pill>
                {chips.map((c) => (
                  <Pill key={c.id} on={albumFilter === c.id} onClick={() => setParams({ album: c.id }, { replace: true })}>{c.name}</Pill>
                ))}
              </div>
            )}

            <div className="mt-3">
              {n ? (
                <PhotoGrid shortId={event.shortId} logoUrl={event.studio.logoUrl} photos={shown} hrefFor={(p) => `${base}/p/${p.id}?from=me${albumFilter ? `&album=${albumFilter}` : ''}`} favourites={session.favourites} />
              ) : (
                <StateBlock icon={<SearchX size={24} />} tone="neutral" title="You’re not in this album" body="Try another album, or retake your selfie in better light.">
                  <PrimaryButton onClick={() => setParams({}, { replace: true })}>Show all your photos</PrimaryButton>
                </StateBlock>
              )}
            </div>
          </>
        )}
      </Container>

      <SelfieFlow open={selfie} onOpenChange={setSelfie} event={event} studio={studio} base={base} />
      <DownloadSheet open={download} onOpenChange={setDownload} photos={shown} event={event} studio={studio} session={session} onBuy={store ? () => setBuy(true) : undefined} />
      {store && <BuySheet open={buy} onOpenChange={setBuy} photos={shown} mode="mine" event={event} studio={studio} session={session} onDownload={() => setDownload(true)} />}
    </EventShell>
  )
}
