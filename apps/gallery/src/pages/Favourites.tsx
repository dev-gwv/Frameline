import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Heart } from 'lucide-react'
import { Button } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { Container, GridSkeleton, linkBtn, PageTop, PhotoGrid, StateBlock } from '../components/common'
import { EventShell } from '../components/Shell'
import { useMyFavourites } from '../lib/queries'
import { DownloadSheet } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

/**
 * The guest's favourites (the client proofing tool). Registered guests load them from api.listMyFavourites (the
 * source of truth; it also refreshes the device copy). Guests who haven't registered only have the device copy
 * (each tap still reaches the studio via api.setFavourite).
 */
export function Favourites() {
  const { event, studio, session, base, seeAll, ownIds, forceOffline } = useEventCtx()
  const [dl, setDl] = useState(false)
  const registered = !!session.auth?.guestId
  const remote = useMyFavourites(event.shortId, registered)
  const photos = useMemo(() => session.favourites.map((id) => session.favPhotos[id]).filter((p) => !!p).reverse(), [session.favourites, session.favPhotos])
  const downloadable = photos.filter((p) => session.purchased.includes(p.id) || event.settings.downloads === 'all' || (event.settings.downloads === 'own' && ownIds.has(p.id)))
  const browse = seeAll ? `${base}/a/all` : session.match ? `${base}/me` : base

  return (
    <EventShell event={event} base={base} tab="fav" offline={forceOffline}>
      <PageTop back={base} title="Favourites" right={downloadable.length > 0 ? (
        <Button icon={<Download size={15} />} className="h-11" onClick={() => setDl(true)}>Download {fmt.count(downloadable.length)}</Button>
      ) : undefined} />
      <Container className="pt-3 md:pt-2">
        <p className="text-[13.5px] text-ink-2">{studio.name} can see your favourites. Use them to tell them which ones you love.</p>
        <div className="mt-3">
          {remote.isLoading && !photos.length ? <GridSkeleton n={9} /> : photos.length ? (
            <PhotoGrid shortId={event.shortId} logoUrl={event.studio.logoUrl} photos={photos} hrefFor={(p) => `${base}/p/${p.id}?from=fav`} />
          ) : (
            <StateBlock icon={<Heart size={24} />} title="No favourites yet" body="Open a photo and tap Favourite. It helps the studio pick prints and album pages.">
              <Link to={browse} className={linkBtn('primary')}>{seeAll ? 'Browse photos' : session.match ? 'See your photos' : 'Find my photos'}</Link>
            </StateBlock>
          )}
        </div>
      </Container>
      <DownloadSheet open={dl} onOpenChange={setDl} photos={downloadable} event={event} studio={studio} session={session} />
    </EventShell>
  )
}
