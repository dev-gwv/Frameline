import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ImageOff } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, EmptyState, Field, FilterChips, Page, PhotoTile, Select, Skeleton } from '@frameline/ui'
import { useAlbums, useEvents, usePhotos } from '../../lib/queries'
import { QueryError } from '../system'
import { COST } from './presets'
import { Tutorial } from './Tutorial'

const PAGE = 24

/** /enhance without a photo: browse an event and album, then pick one photo. */
export function Picker({ wallet }: { wallet?: number }) {
  const navigate = useNavigate()
  const events = useEvents()
  const withPhotos = (events.data ?? []).filter((e) => e.photoCount > 0 && e.status !== 'archived')
  const [eventId, setEventId] = useState<string>()
  const [albumId, setAlbumId] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => {
    if (!eventId && withPhotos.length) setEventId((withPhotos.find((e) => e.status === 'live') ?? withPhotos[0]).id)
  }, [eventId, withPhotos])
  const albums = (useAlbums(eventId).data ?? []).filter((a) => a.photoCount > 0).sort((a, b) => a.order - b.order)
  const photos = usePhotos(eventId, { limit, sort: 'sequence', albumId: albumId === 'all' ? undefined : albumId })
  const event = withPhotos.find((e) => e.id === eventId)

  const pickEvent = (id: string) => { setEventId(id); setAlbumId('all'); setLimit(PAGE) }
  const pickAlbum = (id: string) => { setAlbumId(id); setLimit(PAGE) }

  return (
    <Page title="Pick a photo" subtitle={`Choose one photo to improve. Each save costs ${fmt.rupees(COST)} from your wallet.`}
      actions={wallet !== undefined && <span className="text-[13px] text-ink-3 tnum">Wallet {fmt.rupees(Math.round(wallet))}</span>}>
      <Tutorial className="mb-4" />
      <Card className="min-w-0">
        {events.error ? <QueryError error={events.error} retry={() => events.refetch()} />
          : events.isLoading ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
          : !withPhotos.length ? (
            <EmptyState icon={<ImageOff size={22} />} title="No photos to improve yet" body="Upload photos to an event first, then come back here, or open any photo and choose AI enhance from its ⋯ menu."
              action={<Link to="/events"><Button>Go to your events</Button></Link>} />
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-3">
                <Field label="Event" htmlFor="enh-event" className="w-full sm:max-w-sm">
                  <Select id="enh-event" value={eventId ?? ''} onChange={(e) => pickEvent(e.target.value)}>
                    {withPhotos.map((e) => <option key={e.id} value={e.id}>{e.name} · {fmt.count(e.photoCount)} photos</option>)}
                  </Select>
                </Field>
                {albums.length > 1 && (
                  <FilterChips label="Album" value={albumId} onChange={pickAlbum}
                    options={[{ value: 'all', label: 'All photos', count: event?.photoCount }, ...albums.map((a) => ({ value: a.id, label: a.name, count: a.photoCount }))]} />
                )}
              </div>
              {photos.error ? <QueryError error={photos.error} retry={() => photos.refetch()} />
                : !photos.data ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
                : !photos.data.items.length ? <EmptyState className="py-10" title="No photos here" body="This album is empty. Pick another album or event." />
                : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {photos.data.items.map((p) => (
                        <PhotoTile key={p.id} tone={p.tone} url={p.url} label={p.filename} alt={`Improve ${p.filename}`}
                          onClick={() => navigate(`/enhance/${p.id}`)} />
                      ))}
                    </div>
                    {photos.data.total > photos.data.items.length && (
                      <div className="mt-4 flex justify-center">
                        <Button loading={photos.isFetching} onClick={() => setLimit((l) => l + PAGE)}>Show {fmt.count(Math.min(PAGE, photos.data.total - photos.data.items.length))} more photos</Button>
                      </div>
                    )}
                  </>
                )}
            </>
          )}
      </Card>
    </Page>
  )
}
