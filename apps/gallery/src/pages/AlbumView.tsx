import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Download, ImageOff, Sparkles } from 'lucide-react'
import { Button, EmptyState, cn } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { guestAlbums, useAlbums, useHighlights, useInfinitePhotos, usePhotoList, visible } from '../lib/queries'
import { useGuest } from '../lib/guest'
import { Container, GridSkeleton, PhotoGrid, Sentinel, TopBar } from '../components/common'
import { DownloadSheet } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

export function AlbumView() {
  const { albumId = 'all' } = useParams()
  const { event, studio, session, base, seeAll } = useEventCtx()
  const albumsQ = useAlbums(event.id)
  const favCount = useGuest((s) => s.events[event.shortId.toUpperCase()]?.favourites.length ?? 0)
  const [dlOpen, setDlOpen] = useState(false)

  const isHighlights = albumId === 'highlights'
  const isAll = albumId === 'all'
  const album = albumsQ.data?.find((a) => a.id === albumId)
  const pages = useInfinitePhotos(event.id, isAll ? undefined : albumId, seeAll && !isHighlights)
  const highlights = useHighlights(event.id, seeAll && isHighlights)
  const full = usePhotoList(event.id, isAll ? undefined : albumId, dlOpen && !isHighlights)

  const photos = useMemo(() => isHighlights ? (highlights.data ?? []) : (pages.data?.pages.flatMap((p) => p.items) ?? []).filter(visible), [isHighlights, highlights.data, pages.data])
  const total = isHighlights ? photos.length : isAll ? pages.data?.pages[0]?.total ?? event.photoCount : album?.photoCount ?? pages.data?.pages[0]?.total ?? 0

  if (!seeAll) return <Navigate to={isAll || isHighlights ? base : `${base}/me?album=${albumId}`} replace />
  if (!isAll && !isHighlights && albumsQ.data && !album) {
    return (
      <div className="min-h-dvh">
        <TopBar back={base} studioName={studio.name} favouritesTo={`${base}/favourites`} favCount={favCount} />
        <EmptyState icon={<ImageOff size={26} />} title="This album isn't here any more" body="The studio may have renamed or removed it." action={<Link to={base}><Button variant="primary">See all albums</Button></Link>} />
      </div>
    )
  }

  const title = isHighlights ? 'Highlights' : isAll ? 'All photos' : album?.name ?? 'Album'
  const loading = isHighlights ? highlights.isLoading : pages.isLoading
  const tabs = [{ id: 'all', name: 'All' }, ...(event.highlights ? [{ id: 'highlights', name: 'Highlights' }] : []), ...guestAlbums(albumsQ.data, event).map((a) => ({ id: a.id, name: a.name }))]
  const downloadList = isHighlights ? photos : (full.data ?? [])

  return (
    <div className="min-h-dvh pb-12">
      <TopBar back={base} studioName={studio.name} favouritesTo={`${base}/favourites`} favCount={favCount} />
      <Container className="pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-display text-[24px] font-semibold leading-tight sm:text-[28px]">{isHighlights && <Sparkles size={20} className="text-accent-text" />}{title}</h1>
            <div className="font-mono text-[12px] tnum text-ink-3">{fmt.count(total)} photos · {event.name}</div>
          </div>
          {event.settings.downloads !== 'none' && total > 0 && (
            <Button icon={<Download size={15} />} onClick={() => setDlOpen(true)}>Download all</Button>
          )}
        </div>

        <nav className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Albums">
          {tabs.map((t) => (
            <Link key={t.id} to={`${base}/a/${t.id}`} replace aria-current={t.id === albumId ? 'page' : undefined}
              className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold transition', t.id === albumId ? 'bg-side text-side-gold' : 'bg-sunk text-ink-2 hover:text-ink')}>
              {t.name}
            </Link>
          ))}
        </nav>

        <div className="mt-3">
          {loading ? <GridSkeleton n={24} /> : photos.length ? (
            <>
              <PhotoGrid photos={photos} hrefFor={(p) => `${base}/p/${p.id}?from=${albumId}`} favourites={session.favourites} />
              {!isHighlights && <Sentinel onVisible={() => { if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage() }} disabled={!pages.hasNextPage || pages.isFetchingNextPage} watch={photos.length} />}
              {pages.isFetchingNextPage && <div className="mt-1"><GridSkeleton n={6} /></div>}
              {!isHighlights && !pages.hasNextPage && photos.length > 24 && <p className="mt-6 text-center text-[12px] text-ink-3">That's all {fmt.count(photos.length)} photos.</p>}
            </>
          ) : pages.isError ? (
            <EmptyState title="Photos didn't load" body="Check your connection and try again." action={<Button variant="primary" onClick={() => void pages.refetch()}>Try again</Button>} />
          ) : (
            <EmptyState icon={<ImageOff size={26} />} title="No photos here yet" body="The studio is still adding photos to this album. Check back soon." action={<Link to={base}><Button>Back to albums</Button></Link>} />
          )}
        </div>
      </Container>

      <DownloadSheet open={dlOpen} onOpenChange={setDlOpen} all photos={downloadList} loading={!isHighlights && full.isLoading} event={event} studio={studio} session={session}
        title={`Download ${title === 'All photos' ? 'all photos' : title}`} />
    </div>
  )
}
