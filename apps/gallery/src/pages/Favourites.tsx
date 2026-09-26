import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Heart } from 'lucide-react'
import { Button, EmptyState } from '@frameline/ui'
import { fmt } from '@frameline/shared'
import { Container, PhotoGrid, TopBar } from '../components/common'
import { DownloadSheet } from '../components/DownloadSheet'
import { useEventCtx } from './EventLayout'

/**
 * The guest's picks. Each tap is sent to the API (api.setFavourite → the studio's "Who favourited" list);
 * this list is the device's copy because the API has no "my favourites" endpoint for guests.
 */
export function Favourites() {
  const { event, studio, session, base, seeAll, ownIds } = useEventCtx()
  const [dl, setDl] = useState(false)
  const photos = useMemo(() => session.favourites.map((id) => session.favPhotos[id]).filter((p) => !!p).reverse(), [session.favourites, session.favPhotos])
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
          {photos.length ? (
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
