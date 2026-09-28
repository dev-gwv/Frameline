import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Download, Heart, MoreHorizontal, Search, Settings2, Share2, UserCheck, UserMinus, Users } from 'lucide-react'
import { DEMO_NOW, fmt, quoteNote, type AccessRequest, type Guest } from '@frameline/shared'
import { Avatar, Button, Card, EmptyState, FilterChips, Input, Menu, Skeleton, StatCard, useToast, type MenuItem } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAccessRequests, useAlbums, useEventStats, useGuests, usePhotos } from '../../lib/queries'
import { useModalParam, useParamState } from '../../lib/url'
import { useEventContext } from '../event/EventLayout'
import { QueryError } from '../system'
import { downloadCsv, firstName } from './data'
import { PicksModal } from './PicksModal'
import { UploadsPanel } from './UploadsPanel'

type Filter = 'all' | 'picks' | 'requests' | 'uploads'

/** One person in the Everyone / Picks lists: a signed-up guest, or a host who hasn't signed up in the gallery. */
interface Person { id: string; name: string; label: 'Client' | 'Guest' | 'Host'; email: string; phone: string; detail: string; when: string; guest?: Guest; host?: boolean }

const roleLabel = (r: Guest['role']): Person['label'] => (r === 'client' ? 'Client' : r === 'host' ? 'Host' : 'Guest')

/**
 * /events/:eventId/guests — a tab inside EventLayout (no own header).
 * 4 numbers, filter chips (Everyone · Picks · Requests · Uploads, deep link `?f=`), search, Export CSV,
 * and one list whose rows carry the one action that matters. Picks open with `?modal=picks&guest=<id>`.
 */
export default function Guests() {
  const { event } = useEventContext()
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const m = useModalParam()
  const [params, setParams] = useParamState()
  const raw = params.get('f')
  const filter: Filter = raw === 'requests' || raw === 'uploads' || raw === 'picks' ? raw : 'all'
  const query = params.get('q') ?? ''
  const q = query.trim().toLowerCase()

  const guests = useGuests(event.id)
  const requests = useAccessRequests(event.id)
  const albums = useAlbums(event.id)
  const guestAlbum = albums.data?.find((a) => a.kind === 'guest')
  const uploads = usePhotos(guestAlbum ? event.id : undefined, { albumId: guestAlbum?.id, sort: 'sequence' })
  const stats = useEventStats(event.id)

  const guestList = useMemo(() => guests.data ?? [], [guests.data])
  const openRequests = requests.data ?? []

  const people = useMemo<Person[]>(() => {
    const list: Person[] = guestList.map((g) => ({
      id: g.id, name: g.name, label: roleLabel(g.role), email: g.email, phone: g.phone, guest: g, when: fmt.ago(g.lastActive, DEMO_NOW),
      detail: g.favourites.length ? `Picked ${fmt.count(g.favourites.length)} photos · signed up ${fmt.date(g.registeredAt)}` : `Signed up ${fmt.date(g.registeredAt)}`,
    }))
    const emails = new Set(guestList.map((g) => g.email.toLowerCase()))
    for (const h of event.hosts) {
      if (emails.has(h.email.toLowerCase())) continue
      list.push({ id: h.id, name: h.name, label: h.role === 'client' ? 'Client' : 'Host', email: h.email, phone: h.phone ?? '', host: true, when: '', detail: 'Host · can see everything and change settings' })
    }
    return list
  }, [guestList, event.hosts])

  const pickers = people.filter((p) => (p.guest?.favourites.length ?? 0) > 0).sort((a, b) => b.guest!.favourites.length - a.guest!.favourites.length)
  const uploadPhotos = uploads.data?.items ?? []
  const pendingUploads = uploadPhotos.filter((p) => p.reviewStatus === 'pending' && !p.hidden).length
  const uploadsCount = pendingUploads || (event.settings.reviewGuestUploads ? 0 : uploadPhotos.filter((p) => !p.hidden && p.reviewStatus !== 'rejected').length)

  const visits = stats.data?.visits ?? event.visits.web + event.visits.android + event.visits.ios

  const setFilter = (f: Filter) => setParams({ f: f === 'all' ? undefined : f }, true)
  const setQuery = (v: string) => setParams({ q: v || undefined }, true)
  const matches = (...fields: string[]) => !q || fields.some((f) => f.toLowerCase().includes(q))

  const viewing = m.modal === 'picks' ? guestList.find((g) => g.id === m.params.get('guest')) ?? null : null
  const viewPicks = (g: Guest) => m.open('picks', { guest: g.id })

  /** Acts at once; Undo reopens the request (and takes back the access approving gave). */
  const decide = (r: AccessRequest, approve: boolean) => {
    api.resolveAccessRequest(r.id, approve).then(() => {
      toast.undo(approve ? `${firstName(r.name)} can now see the photos` : `Declined ${firstName(r.name)}’s request`,
        () => void api.reopenAccessRequest(r.id).catch((e) => toast.error('Couldn’t undo that', errorMessage(e))))
    }, (e) => toast.error(`Couldn’t ${approve ? 'approve' : 'decline'} ${firstName(r.name)}`, errorMessage(e)))
  }
  /** Removes a guest's access at once; Undo gives it back. */
  const removeGuest = (g: Guest) => {
    api.removeGuest(g.id).then(() => {
      toast.undo(`${firstName(g.name)} can’t open the gallery now`, () => void api.restoreGuest(g.id).catch((e) => toast.error('Couldn’t undo that', errorMessage(e))))
    }, (e) => toast.error(`Couldn’t remove ${firstName(g.name)}`, errorMessage(e)))
  }

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error('Couldn’t copy', 'Your browser blocked the clipboard.'))
  }
  const menuFor = (p: Person): (MenuItem | 'separator')[] => [
    ...(p.email ? [{ label: 'Copy email', description: p.email, icon: <Copy size={15} />, onSelect: () => copy(p.email, 'Email') }] : []),
    ...(p.phone ? [{ label: 'Copy phone number', description: p.phone, icon: <Copy size={15} />, onSelect: () => copy(p.phone, 'Phone number') }] : []),
    ...(p.host ? [{ label: 'Manage hosts', description: 'Add, change or remove in Settings', icon: <Settings2 size={15} />, onSelect: () => navigate(`/events/${event.id}/settings#hosts`) }] : []),
    ...(p.guest ? ['separator' as const, { label: 'Remove access', description: 'They can’t open the gallery any more', icon: <UserMinus size={15} />, danger: true, onSelect: () => removeGuest(p.guest!) }] : []),
  ]

  const exportCsv = () => {
    const slug = event.shortId.toLowerCase()
    if (filter === 'requests') downloadCsv(`${slug}-requests.csv`, ['Name', 'Email', 'Message', 'Asked at'], openRequests.map((r) => [r.name, r.email, r.note, r.createdAt]))
    else if (filter === 'uploads') downloadCsv(`${slug}-guest-uploads.csv`, ['File', 'From', 'Taken at', 'Status'], uploadPhotos.map((p) => [p.filename, p.uploadedBy, p.capturedAt, p.reviewStatus === 'rejected' ? 'Rejected' : p.hidden ? 'Removed' : p.reviewStatus === 'pending' ? 'Waiting for review' : 'In the gallery']))
    else {
      const rows = filter === 'picks' ? pickers : people
      downloadCsv(`${slug}-${filter === 'picks' ? 'picks' : 'guests'}.csv`, ['Name', 'Role', 'Email', 'Phone', 'Photos picked', 'Signed up', 'Last active'],
        rows.map((p) => [p.name, p.label, p.email, p.phone, p.guest?.favourites.length ?? 0, p.guest?.registeredAt ?? '', p.guest?.lastActive ?? '']))
    }
    toast.success('CSV downloaded')
  }

  const row = (p: Person, action: ReactNode) => (
    <GuestRow key={p.id} name={p.name} label={p.label} detail={p.detail} when={p.when} action={action} />
  )
  const moreMenu = (p: Person) => {
    const items = menuFor(p)
    return items.length ? <Menu width={260} items={items} trigger={<Button variant="ghost" size="icon" aria-label={`More for ${p.name}`} className="max-sm:size-11"><MoreHorizontal size={16} /></Button>} /> : null
  }
  const picksButton = (p: Person) => <Button size="sm" className="max-sm:h-10" onClick={() => viewPicks(p.guest!)}>View picks</Button>

  let body: ReactNode
  const listLoading = guests.isLoading || (filter === 'requests' && requests.isLoading)
  if (guests.error) body = <QueryError error={guests.error} retry={() => guests.refetch()} />
  else if (filter === 'uploads') {
    body = <UploadsPanel event={event} photos={uploadPhotos} loading={albums.isLoading || uploads.isLoading} query={query} onOpenSettings={() => navigate(`/events/${event.id}/settings`)} />
  } else if (listLoading) {
    body = <Card padded={false}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex items-center gap-3 border-t border-line px-[18px] py-[13px] first:border-t-0"><Skeleton className="size-9 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="mt-1.5 h-3 w-64 max-w-full" /></div></div>)}</Card>
  } else if (filter === 'requests') {
    const list = openRequests.filter((r) => matches(r.name, r.email, r.note))
    body = list.length ? (
      <ListCard>
        {list.map((r, i) => (
          <GuestRow key={r.id} name={r.name} label="Asking for access" when={fmt.ago(r.createdAt, DEMO_NOW)}
            detail={`${quoteNote(r.note) ?? 'No message'} · ${r.email}`}
            action={<div className="flex gap-2 max-sm:w-full">
              <Button size="sm" variant="ghost" className="max-sm:h-11 max-sm:flex-1" onClick={() => decide(r, false)}>Decline</Button>
              <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} className="max-sm:h-11 max-sm:flex-1" onClick={() => decide(r, true)}>Approve</Button>
            </div>} />
        ))}
      </ListCard>
    ) : q ? <NoMatch query={query} onClear={() => setQuery('')} /> : (
      <Card><EmptyState icon={<UserCheck size={22} />} title="No requests right now"
        body={event.settings.access === 'registered' ? 'When someone asks to see the photos, you approve them here. You’ll also see them on Home.' : 'Anyone with the link can open this gallery, so nobody needs to ask. Turn on “Only people you approve” in Settings to check each guest.'}
        action={event.settings.access === 'registered' ? undefined : <Button icon={<Settings2 size={14} />} onClick={() => navigate(`/events/${event.id}/settings`)}>Open Settings</Button>} /></Card>
    )
  } else if (filter === 'picks') {
    const list = pickers.filter((p) => matches(p.name, p.email, p.phone))
    body = list.length ? <ListCard>{list.map((p) => row(p, picksButton(p)))}</ListCard>
      : q ? <NoMatch query={query} onClear={() => setQuery('')} />
      : <Card><EmptyState icon={<Heart size={22} />} title="No picks yet" body="When guests heart photos in the gallery, you’ll see who picked what here. Ask your client to pick their favourites for the album." action={<Button icon={<Share2 size={14} />} onClick={() => m.open('share', { tab: 'link' })}>Share the gallery</Button>} /></Card>
  } else {
    const list = people.filter((p) => matches(p.name, p.email, p.phone))
    body = list.length ? (
      <ListCard>
        {list.map((p) => row(p, p.guest && p.guest.favourites.length ? <div className="flex items-center gap-1">{picksButton(p)}{moreMenu(p)}</div> : moreMenu(p)))}
      </ListCard>
    ) : q ? <NoMatch query={query} onClear={() => setQuery('')} /> : (
      <Card><EmptyState icon={<Users size={22} />} title="No guests yet" body="Guests show up here when they sign up in the gallery. Share the link to get started." action={<Button icon={<Share2 size={14} />} onClick={() => m.open('share', { tab: 'link' })}>Share the gallery</Button>} /></Card>
    )
  }

  return (
    <div className="flex flex-col pb-10">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
        <StatCard value={fmt.count(visits)} label="gallery visits" />
        <StatCard value={guests.isLoading ? '–' : fmt.count(guestList.length)} label="signed-up guests" />
        <StatCard value={guests.isLoading ? '–' : fmt.count(pickers.length)} label="people picked favourites" />
        <StatCard value={stats.data ? fmt.count(stats.data.downloads) : '–'} label="downloads" />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <FilterChips<Filter> label="Show" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'Everyone', count: people.length },
          { value: 'picks', label: 'Picks', count: pickers.length },
          { value: 'requests', label: 'Requests', count: openRequests.length, attention: true },
          { value: 'uploads', label: 'Uploads', count: uploadsCount, attention: pendingUploads > 0 },
        ]} />
        <div className="flex items-center gap-2 max-sm:w-full">
          <Input type="search" aria-label={filter === 'uploads' ? 'Search uploads' : 'Search guests'} placeholder={filter === 'uploads' ? 'Search uploads' : 'Search guests'}
            icon={<Search size={14} />} value={query} onChange={(e) => setQuery(e.target.value)} className="h-[34px] sm:w-[220px] max-sm:h-11 max-sm:flex-1" />
          <Button size="sm" icon={<Download size={14} />} className="max-sm:h-11" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      {body}

      <PicksModal event={event} guest={viewing} onClose={() => m.close(['guest'])} />
    </div>
  )
}

function ListCard({ children }: { children: ReactNode }) {
  return <Card padded={false} className="overflow-hidden">{children}</Card>
}

function GuestRow({ name, label, detail, when, action }: { name: string; label: string; detail: string; when: string; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-line px-4 py-[13px] first:border-t-0 sm:flex-nowrap sm:px-[18px]">
      <Avatar name={name} tone="neutral" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px]"><b className="font-bold">{name}</b> <span className="text-[12.5px] text-ink-3">· {label}</span></div>
        <div className="truncate text-[12.5px] text-ink-2">{detail}{when && <span className="text-ink-3 sm:hidden"> · {when}</span>}</div>
      </div>
      <span className="hidden w-[90px] shrink-0 text-[12.5px] text-ink-3 sm:block">{when}</span>
      {action}
    </div>
  )
}

function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return <Card><EmptyState title={`No one matches “${query.trim()}”`} body="Search looks at names, emails and phone numbers." action={<Button onClick={onClear}>Clear search</Button>} /></Card>
}
