import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Heart } from 'lucide-react'
import { Button, EmptyState } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { Container, GridSkeleton, PhotoGrid, TopBar } from '../components/common'
import { useMyFavourites } from '../lib/queries'
import { DownloadSheet } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

/**
 * The guest's picks. Registered guests load them from api.listMyFavourites (the source of truth; it also
 * refreshes the device copy). Guests who haven't registered only have the device copy (each tap still reaches
 * the studio via api.setFavourite).
 */
export function Favourites() {
  const { event, studio, session, base, seeAll, ownIds } = useEventCtx()
  const [dl, setDl] = useState(false)
  const registered = !!session.auth?.guestId
  const remote = useMyFavourites(event.shortId, registered)
  const local = useMemo(() => session.favourites.map((id) => session.favPhotos[id]).filter((p) => !!p).reverse(), [session.favourites, session.favPhotos])
  // The API list replaces the device copy when it loads (see useMyFavourites); until then, or if it fails,
  // the device copy shows instantly.
  const photos = local
  const downloadable = photos.filter((p) => session.purchased.includes(p.id) || (event.settings.downloads === 'all') || (event.settings.downloads === 'own' && ownIds.has(p.id)))

  return (
    <div className="min-h-dvh pb-12">
      <TopBar back={base} studioName={studio.name} />
      <Container className="pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[24px] font-semibold leading-tight">Your favourites</h1>
            <p className="text-[12.5px] text-ink-2">{photos.length ? `${fmt.count(photos.length)} picks · ${studio.name} can see what you favourite.` : `Tap the heart on any photo to keep it here.`}</p>
          </div>
          {downloadable.length > 0 && <Button icon={<Download size={15} />} onClick={() => setDl(true)}>Download {downloadable.length}</Button>}
        </div>
        <div className="mt-4">
          {remote.isLoading && !photos.length ? <GridSkeleton n={9} /> : photos.length ? (
            <PhotoGrid photos={photos} hrefFor={(p) => `${base}/p/${p.id}?from=fav`} />
          ) : (
            <EmptyState icon={<Heart size={26} />} title="No favourites yet" body="Open a photo and tap Favourite. Your picks help the studio choose prints and album pages."
              action={<Link to={seeAll ? `${base}/a/all` : session.match ? `${base}/me` : base}><Button variant="primary">{seeAll ? 'Browse photos' : 'See your photos'}</Button></Link>} />
          )}
        </div>
      </Container>
      <DownloadSheet open={dl} onOpenChange={setDl} photos={downloadable} event={event} studio={studio} session={session} />
    </div>
  )
}
