import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, BarChart3, CalendarPlus, Check, Plus, RotateCcw, Search, SearchX, Trash2 } from 'lucide-react'
import { DEMO_NOW, fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Card, ConfirmDialog, CoverMosaic, EmptyState, Input, Menu, PageHeader, Segmented, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useDeletedEvents, useEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { EditEventModal } from './EditEventModal'
import { EventCard } from './EventCard'
import { NewEventDrawer } from './NewEventDrawer'
import { galleryLink, matchesQuery, matchesStatus, sortEvents, type SortKey, type StatusFilter } from './lib'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'draft', label: 'Drafts' },
  { value: 'expiring', label: 'Expiring' }, { value: 'archived', label: 'Archived' },
]
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Most recent' }, { value: 'name', label: 'Name' }, { value: 'photos', label: 'Photos' },
]

export default function Events() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const events = useEvents()
  const [editing, setEditing] = useState<PhotoEvent | null>(null)
  const [deleting, setDeleting] = useState<PhotoEvent | null>(null)

  const q = params.get('q') ?? ''
  const trash = params.get('status') === 'trash'
  const deleted = useDeletedEvents()
  const status = (FILTERS.some((f) => f.value === params.get('status')) ? params.get('status') : 'all') as StatusFilter
  const sort = (SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'recent') as SortKey
  const setParam = (key: string, value: string | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (value === null || value === '') next.delete(key); else next.set(key, value)
    return next
  }, { replace: true })

  const list = events.data ?? []
  const shown = useMemo(() => sortEvents(list.filter((e) => matchesStatus(e, status) && matchesQuery(e, q)), sort), [list, status, q, sort])
  const count = (f: StatusFilter) => list.filter((e) => matchesStatus(e, f)).length

  const live = list.filter((e) => e.status === 'live').length
  const uploading = list.filter((e) => e.status === 'uploading').length
  const drafts = list.filter((e) => e.status === 'draft').length
  const subtitle = [`${live} live`, uploading && `${uploading} uploading`, drafts && `${drafts} draft${drafts > 1 ? 's' : ''}`].filter(Boolean).join(' · ')

  const archive = useAction(({ e, archived }: { e: PhotoEvent; archived: boolean }) => api.updateEvent(e.id, { status: archived ? 'archived' : e.photoCount ? 'live' : 'draft' }), {
    success: (_, v) => (v.archived ? `${v.e.name} archived` : `${v.e.name} restored`),
  })
  const remove = useAction((e: PhotoEvent) => api.deleteEvent(e.id), {
    onSuccess: (_, e) => toast.toast({ kind: 'success', title: `${e.name} moved to trash`, body: 'Restore it from Recently deleted within 30 days.', action: { label: 'Undo', onClick: () => restore.mutate(e) } }),
  })
  const restore = useAction((e: PhotoEvent) => api.restoreEvent(e.id), { success: (_, e) => `${e.name} restored` })
  const sell = useAction(async (e: PhotoEvent) => { if (!e.settings.storeEnabled) await api.updateEventSettings(e.id, { storeEnabled: true }) }, {
    success: (_, e) => (e.settings.storeEnabled ? `Opening Store for ${e.name}` : `Store turned on for ${e.name}`),
    onSuccess: () => navigate('/store'),
  })

  const copyLink = async (e: PhotoEvent) => {
    try { await navigator.clipboard.writeText(galleryLink(e)); toast.success('Gallery link copied', galleryLink(e)) }
    catch { toast.error('Couldn’t copy the link', `Copy it by hand: ${galleryLink(e)}`) }
  }

  const drawerOpen = params.get('new') === '1'
  const closeDrawer = () => setParam('new', null)

  return (
    <div className="pb-10">
      <PageHeader title="Events" subtitle={events.data ? subtitle : undefined}
        actions={<>
          <Link to="/reports"><Button icon={<BarChart3 size={14} />}>Events report</Button></Link>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setParam('new', '1')}>New event</Button>
        </>} />

      <div className="flex flex-col gap-3.5 px-4 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Input icon={<Search size={14} />} placeholder="Search name, ID or city" aria-label="Search events" className="w-full sm:w-[260px]"
              value={q} onChange={(e) => setParam('q', e.target.value)} />
            <div className="max-w-full overflow-x-auto scrollbar-thin">
              <Segmented<string> value={trash ? 'trash' : status} onChange={(v) => setParam('status', v === 'all' ? null : v)}
                options={[
                  ...FILTERS.map((f) => ({ value: f.value as string, label: <>{f.label} <span className="font-mono text-[11px] text-ink-3">{events.data ? count(f.value) : ''}</span></> })),
                  { value: 'trash', label: <>Recently deleted <span className="font-mono text-[11px] text-ink-3">{deleted.data?.length ?? ''}</span></> },
                ]} />
            </div>
          </div>
          <Menu width={180} items={SORTS.map((s) => ({ label: s.label, icon: s.value === sort ? <Check size={14} /> : <span className="inline-block w-3.5" />, onSelect: () => setParam('sort', s.value === 'recent' ? null : s.value) }))}
            trigger={<Button variant="ghost" icon={<ArrowUpDown size={14} />} aria-label="Sort events">{SORTS.find((s) => s.value === sort)!.label}</Button>} />
        </div>

        {trash ? <TrashList query={deleted} restoringId={restore.isPending ? restore.variables?.id : undefined} onRestore={(e) => restore.mutate(e)} />
        : events.error ? <QueryError error={events.error} retry={() => events.refetch()} /> : events.isLoading ? (
          <div className="grid grid-cols-1 gap-3.5 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[214px] rounded-card" />)}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={<CalendarPlus size={24} />} title="Create your first event"
            body="An event is one gallery with one link. Upload photos, share it, and guests find themselves with a selfie."
            action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setParam('new', '1')}>New event</Button>} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX size={24} />} title="No events match"
            body={q ? `Nothing matches “${q}” in ${FILTERS.find((f) => f.value === status)!.label.toLowerCase()} events.` : 'No events have this status right now.'}
            action={<Button onClick={() => setParams({}, { replace: true })}>Clear search and filters</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-3.5 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((e) => (
              <EventCard key={e.id} event={e} actions={{
                onCopyLink: copyLink,
                onEdit: setEditing,
                onSell: (ev) => sell.mutate(ev),
                onArchive: (ev, archived) => archive.mutate({ e: ev, archived }),
                onDelete: setDeleting,
              }} />
            ))}
          </div>
        )}
      </div>

      <NewEventDrawer open={drawerOpen} onClose={closeDrawer} />
      <EditEventModal event={editing} events={list} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} danger
        title={`Move ${deleting?.name ?? 'event'} to trash?`} confirmLabel="Move to trash"
        body={<>The gallery, its {deleting?.photoCount ? `${deleting.photoCount.toLocaleString('en-IN')} photos` : 'photos'}, albums and guest favourites go to Recently deleted, and the link stops working for guests. You can restore it for 30 days; after that it’s deleted for good. To keep it but hide it, archive it instead.</>}
        onConfirm={() => deleting && remove.mutate(deleting)} />
    </div>
  )
}

const PURGE_DAYS = 30

function TrashList({ query, onRestore, restoringId }: { query: ReturnType<typeof useDeletedEvents>; onRestore: (e: PhotoEvent) => void; restoringId?: string }) {
  if (query.error) return <QueryError error={query.error} retry={() => query.refetch()} />
  if (query.isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
  const rows = query.data ?? []
  if (!rows.length) return <EmptyState icon={<Trash2 size={24} />} title="Trash is empty" body={`Deleted events wait here for ${PURGE_DAYS} days so you can restore them, then they’re removed for good.`} />
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-ink-2">Deleted events are removed for good {PURGE_DAYS} days after deletion. Restore one to bring back its gallery, photos and link.</p>
      <Card padded={false}>
        {rows.map((e) => {
          const left = e.deletedAt ? Math.max(0, PURGE_DAYS - Math.floor((DEMO_NOW - Date.parse(e.deletedAt)) / 86_400_000)) : PURGE_DAYS
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <CoverMosaic tones={e.coverTones} className="h-9 w-14 shrink-0 overflow-hidden rounded" empty={e.photoCount === 0 ? ' ' : undefined} />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{e.name}</b>
                <span className="text-[11.5px] text-ink-3">
                  {fmt.count(e.photoCount)} photos · {e.deletedAt ? `deleted ${fmt.ago(e.deletedAt, DEMO_NOW)} · ` : ''}removed for good in {left} day{left === 1 ? '' : 's'}
                </span>
              </div>
              <Button size="sm" icon={<RotateCcw size={12} />} loading={restoringId === e.id} onClick={() => onRestore(e)}>Restore</Button>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
