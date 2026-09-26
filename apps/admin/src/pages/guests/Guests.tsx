import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, FolderPlus } from 'lucide-react'
import type { AccessRequest, Guest, Photo } from '@frameline/shared'
import { Button, Card, CardHeader, Chip, EmptyState, PageHeader, Skeleton, TabBar, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAccessRequests, useAction, useAlbums, useEvent, useGuests, usePhotos } from '../../lib/queries'
import { QueryError } from '../system'
import { downloadCsv, readReviewed, roleLabel, writeReviewed } from './data'
import { PicksModal } from './PicksModal'
import { FavouritesTab, RegisteredTab, RequestsTab, UploadsTab, type ReviewState } from './Tabs'

type Tab = 'favourites' | 'registered' | 'requests' | 'uploads'
const TABS: Tab[] = ['favourites', 'registered', 'requests', 'uploads']

export default function Guests() {
  const { eventId = '' } = useParams()
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'favourites') as Tab
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'favourites') n.delete('tab'); else n.set('tab', t); return n }, { replace: true })

  const event = useEvent(eventId)
  const guests = useGuests(event.data?.id)
  const requests = useAccessRequests(event.data?.id)
  const albums = useAlbums(event.data?.id)
  const guestAlbum = albums.data?.find((a) => a.kind === 'guest')
  const uploads = usePhotos(guestAlbum ? event.data?.id : undefined, { albumId: guestAlbum?.id, sort: 'sequence' })

  const [viewing, setViewing] = useState<Guest | null>(null)
  const [reviewed, setReviewed] = useState(() => readReviewed(eventId))
  const [busyRequest, setBusyRequest] = useState<string>()

  const guestList = guests.data ?? []
  const favGuests = guestList.filter((g) => g.favourites.length > 0)
  const uploadList = uploads.data?.items ?? []
  const stateOf = (p: Photo): ReviewState => (p.hidden ? 'hidden' : reviewed.has(p.id) ? 'published' : 'pending')

  const resolve = useAction(({ r, approve }: { r: AccessRequest; approve: boolean }) => api.resolveAccessRequest(r.id, approve), {
    success: (_, v) => (v.approve ? `${v.r.name} can now manage this event` : `Declined ${v.r.name}’s request`),
    onSettled: () => setBusyRequest(undefined),
  })
  const decide = useAction(({ photos, publish }: { photos: Photo[]; publish: boolean }) => api.updatePhotos(photos.map((p) => p.id), { hidden: !publish }), {
    success: (_, v) => (v.publish ? `${v.photos.length === 1 ? 'Photo' : `${v.photos.length} photos`} published to the gallery` : 'Photo hidden from guests'),
    onSuccess: (_, v) => setReviewed((prev) => { const next = new Set(prev); v.photos.forEach((p) => next.add(p.id)); writeReviewed(eventId, next); return next }),
  })

  // Client proofing: the client's picks (or the most active host) become an album.
  const proofer = useMemo(() => {
    const byCount = [...favGuests].sort((a, b) => b.favourites.length - a.favourites.length)
    return byCount.find((g) => g.role === 'client') ?? byCount.find((g) => g.role === 'host')
  }, [favGuests])
  const createAlbum = useAction(async () => {
    const ev = event.data!
    const album = await api.createAlbum(ev.id, `${proofer!.name.split(' ')[0]}’s picks`)
    await api.updatePhotos(proofer!.favourites, { albumId: album.id })
    return album
  }, {
    onSuccess: (album) => toast.toast({ kind: 'success', title: `Album “${album.name}” created`, body: `${proofer!.favourites.length} photos moved in for proofing.`, action: { label: 'Open album', onClick: () => navigate(`/events/${event.data!.id}?album=${album.id}`) } }),
  })

  const exportCsv = () => {
    const slug = (event.data?.shortId ?? 'event').toLowerCase()
    if (tab === 'favourites') downloadCsv(`${slug}-favourites.csv`, ['Name', 'Role', 'Email', 'Mobile', 'Photos picked', 'Last active'], favGuests.map((g) => [g.name, roleLabel(g.role), g.email, g.phone, g.favourites.length, g.lastActive]))
    else if (tab === 'registered') downloadCsv(`${slug}-registered-guests.csv`, ['Name', 'Role', 'Email', 'Mobile', 'Registered', 'Last active'], guestList.map((g) => [g.name, roleLabel(g.role), g.email, g.phone, g.registeredAt, g.lastActive]))
    else if (tab === 'requests') downloadCsv(`${slug}-access-requests.csv`, ['Name', 'Email', 'Note', 'Requested at'], (requests.data ?? []).map((r) => [r.name, r.email, r.note, r.createdAt]))
    else downloadCsv(`${slug}-guest-uploads.csv`, ['File', 'Uploaded by', 'Captured at', 'Status'], uploadList.map((p) => [p.filename, p.uploadedBy, p.capturedAt, stateOf(p)]))
    toast.success('CSV downloaded')
  }

  if (event.error) return <div className="px-4 pt-6 sm:px-7"><QueryError error={event.error} retry={() => event.refetch()} /></div>
  if (event.isLoading || !event.data) return <div className="flex flex-col gap-4 px-4 pt-6 sm:px-7"><Skeleton className="h-10 w-72" /><Skeleton className="h-9 w-full" /><Skeleton className="h-72" /></div>
  const ev = event.data
  const tabLoading = guests.isLoading || (tab === 'requests' && requests.isLoading)

  return (
    <div className="pb-10">
      <PageHeader
        crumb={<Link to={`/events/${ev.id}`} className="hover:text-ink hover:underline">{ev.name} /</Link>}
        title="Guests" subtitle="Everyone who registered, favourited or asked for access."
        actions={<Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>}
      />
      <div className="flex flex-col gap-3.5 px-4 sm:px-7">
        <TabBar value={tab} onChange={setTab} tabs={[
          { value: 'favourites', label: 'Favourites', count: favGuests.length },
          { value: 'registered', label: 'Registered', count: guestList.length },
          { value: 'requests', label: 'Access requests', count: requests.data?.length ?? 0 },
          { value: 'uploads', label: 'Guest uploads', count: uploads.data?.total ?? guestAlbum?.photoCount ?? 0 },
        ]} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {guests.error ? <QueryError error={guests.error} retry={() => guests.refetch()} /> : tabLoading ? <Skeleton className="h-72" /> : (
              tab === 'favourites' ? <FavouritesTab guests={guestList} onView={setViewing} />
              : tab === 'registered' ? <RegisteredTab guests={guestList} />
              : tab === 'requests' ? <RequestsTab requests={requests.data ?? []} busyId={busyRequest} onResolve={(r, approve) => { setBusyRequest(r.id); resolve.mutate({ r, approve }) }} />
              : <UploadsTab photos={uploadList} loading={albums.isLoading || uploads.isLoading} stateOf={stateOf}
                  onDecide={(p, publish) => decide.mutate({ photos: [p], publish })}
                  onApproveAll={() => decide.mutate({ photos: uploadList.filter((p) => stateOf(p) === 'pending'), publish: true })} />
            )}
          </div>
          <div className="flex flex-col gap-3">
            {tab !== 'requests' && (requests.data?.length ?? 0) > 0 && (
              <Card>
                <CardHeader title="Access requests" action={<Chip tone="accent">{requests.data!.length}</Chip>} />
                <p className="text-[12.5px] text-ink-2">{requests.data!.map((r) => r.name).join(', ')} {requests.data!.length === 1 ? 'is' : 'are'} waiting for your answer.</p>
                <Button size="sm" className="mt-2" onClick={() => setTab('requests')}>Review requests</Button>
              </Card>
            )}
            <Card>
              <CardHeader title="Client proofing" />
              {proofer ? (
                <>
                  <p className="text-[12.5px] text-ink-2">
                    {proofer.name}’s favourites ({proofer.favourites.length}) can become an album for editing or an album order.
                  </p>
                  <Button size="sm" className="mt-2.5" icon={<FolderPlus size={13} />} loading={createAlbum.isPending} onClick={() => createAlbum.mutate(undefined)}>
                    Create album from picks
                  </Button>
                </>
              ) : guests.isLoading ? <Skeleton className="h-16" /> : (
                <EmptyState className="py-4" title="No client picks yet" body="Share the gallery with your client and ask them to star their favourites." />
              )}
            </Card>
          </div>
        </div>
      </div>
      <PicksModal guest={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
