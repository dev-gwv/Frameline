import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Download, ImageOff } from 'lucide-react'
import { Button } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { guestAlbums, useHighlights, useInfinitePhotos, usePhotoList } from '../lib/queries'
import { Container, GridSkeleton, LoadError, linkBtn, PageTop, PhotoGrid, Pill, Sentinel, StateBlock } from '../components/common'
import { EventShell } from '../components/Shell'
import { DownloadSheet } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

/** Browse all / one album / Highlights, with infinite loading and Download all. */
export function AlbumView() {
  const { albumId = 'all' } = useParams()
  const navigate = useNavigate()
  const { event, studio, session, base, seeAll, forceOffline } = useEventCtx()
  const [dlOpen, setDlOpen] = useState(false)

  const isHighlights = albumId === 'highlights'
  const isAll = albumId === 'all'
  const album = event.albums.find((a) => a.id === albumId)
  const known = isAll || isHighlights || !!album
  const pages = useInfinitePhotos(event.shortId, isAll ? undefined : albumId, seeAll && !isHighlights && known)
  const highlights = useHighlights(event.shortId, seeAll && isHighlights)
  const full = usePhotoList(event.shortId, isAll ? undefined : albumId, seeAll && dlOpen && !isHighlights && known)

  const photos = useMemo(() => isHighlights ? (highlights.data ?? []) : (pages.data?.pages.flatMap((p) => p.items) ?? []), [isHighlights, highlights.data, pages.data])
  const total = isHighlights ? photos.length : isAll ? pages.data?.pages[0]?.total ?? event.photoCount : album?.photoCount ?? pages.data?.pages[0]?.total ?? 0

  if (!seeAll) return <Navigate to={isAll || isHighlights ? base : `${base}/me?album=${albumId}`} replace />

  const title = isHighlights ? 'Highlights' : isAll ? 'All photos' : album?.name ?? 'Album'
  const loading = isHighlights ? highlights.isLoading : pages.isLoading
  const tabs = [{ id: 'all', name: 'All' }, ...(event.highlights ? [{ id: 'highlights', name: 'Highlights' }] : []), ...guestAlbums(event.albums, event).map((a) => ({ id: a.id, name: a.name }))]
  const downloadList = isHighlights ? photos : (full.data ?? [])
  const canDownload = event.settings.downloads !== 'none' && total > 0 && known

  return (
    <EventShell event={event} base={base} tab="event" offline={forceOffline}>
      <PageTop back={base} title={title} right={canDownload ? (
        <Button icon={<Download size={15} />} className="h-11" onClick={() => setDlOpen(true)}>Download all</Button>
      ) : undefined} />
      <Container className="pt-3 md:pt-2">
        {!known ? (
          <StateBlock icon={<ImageOff size={24} />} tone="neutral" title="This album isn’t here any more" body="The studio may have renamed or removed it.">
            <Link to={base} className={linkBtn('primary')}>See all albums</Link>
          </StateBlock>
        ) : (
          <>
            <p className="text-[13px] text-ink-3 tnum">{fmt.count(total)} photos · {event.name}</p>
            <nav className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Albums">
              {tabs.map((t) => <Pill key={t.id} on={t.id === albumId} onClick={() => navigate(`${base}/a/${t.id}`, { replace: true })}>{t.name}</Pill>)}
            </nav>
            <div className="mt-3">
              {loading ? <GridSkeleton n={24} /> : photos.length ? (
                <>
                  <PhotoGrid shortId={event.shortId} logoUrl={event.studio.logoUrl} photos={photos} hrefFor={(p) => `${base}/p/${p.id}?from=${albumId}`} favourites={session.favourites} />
                  {!isHighlights && <Sentinel onVisible={() => { if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage() }} disabled={!pages.hasNextPage || pages.isFetchingNextPage} watch={photos.length} />}
                  {pages.isFetchingNextPage && <div className="mt-1"><GridSkeleton n={6} /></div>}
                  {!isHighlights && !pages.hasNextPage && photos.length > 24 && <p className="mt-6 text-center text-[12.5px] text-ink-3">That’s all {fmt.count(photos.length)} photos.</p>}
                </>
              ) : (isHighlights ? highlights.isError : pages.isError) ? (
                <LoadError error={isHighlights ? highlights.error : pages.error} onRetry={() => void (isHighlights ? highlights.refetch() : pages.refetch())} />
              ) : (
                <StateBlock icon={<ImageOff size={24} />} tone="neutral" title="No photos here yet" body="The studio is still adding photos to this album. Check back soon.">
                  <Link to={base} className={linkBtn()}>Back to albums</Link>
                </StateBlock>
              )}
            </div>
          </>
        )}
      </Container>

      <DownloadSheet open={dlOpen} onOpenChange={setDlOpen} all photos={downloadList} zip={album ? { albumId: album.id } : undefined} loading={!isHighlights && full.isLoading} event={event} studio={studio} session={session}
        title={`Download ${isAll ? 'all photos' : title}`} />
    </EventShell>
  )
}
