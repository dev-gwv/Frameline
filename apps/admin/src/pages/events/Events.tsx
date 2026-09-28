import { useEffect, useMemo } from 'react'
import { ArrowUpDown, CalendarPlus, Check, ChevronDown, Plus, Search, SearchX } from 'lucide-react'
import { Button, EmptyState, Input, Menu, Page, TabBar } from '@frameline/ui'
import { useDeletedEvents, useEvents } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { QueryError } from '../system'
import { EventCard, EventCardSkeleton } from './EventCard'
import { FILTERS, matchesQuery, matchesStatus, sortEvents, SORTS, type SortKey, type StatusFilter } from './lib'
import { NewEventModal } from './NewEventModal'
import { TrashList } from './TrashList'
import { useEventActions } from './useEventActions'

const GRID = 'grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'

/** /events: search, status tabs (?f=), sort, a grid of event cards, and Recently deleted (?f=trash). */
export default function Events() {
  const [params, set] = useParamState()
  const events = useEvents()
  const deleted = useDeletedEvents()
  const list = useMemo(() => events.data ?? [], [events.data])
  const { actions, dialogs } = useEventActions(list)

  // Old links used ?status=…; keep them working.
  useEffect(() => { const old = params.get('status'); if (old) set({ status: undefined, f: old }, true) }, [params, set])

  const q = params.get('q') ?? ''
  const raw = params.get('f') ?? 'all'
  const f: StatusFilter = raw === 'trash' || FILTERS.some((x) => x.value === raw) ? (raw as StatusFilter) : 'all'
  const sort = (SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'recent') as SortKey

  const trashRows = useMemo(() => deleted.data ?? [], [deleted.data])
  const shown = useMemo(() => sortEvents(list.filter((e) => matchesStatus(e, f) && matchesQuery(e, q)), sort), [list, f, q, sort])
  const count = (x: StatusFilter) => list.filter((e) => matchesStatus(e, x)).length
  const label = (text: string, n?: number) => <>{text}{n !== undefined && <span className="font-semibold text-ink-3 tnum">{n}</span>}</>

  const tabs = [
    ...FILTERS.map((x) => ({ value: x.value as StatusFilter, label: label(x.label, events.data ? count(x.value) : undefined) })),
    ...(trashRows.length || f === 'trash' ? [{ value: 'trash' as StatusFilter, label: label('Recently deleted', deleted.data ? trashRows.length : undefined) }] : []),
  ]
  const newEvent = () => set({ new: '1' })

  return (
    <Page title="Events"
      actions={<>
        <Input icon={<Search size={15} />} placeholder="Search by name or event code" aria-label="Search events" className="w-full sm:w-[280px]" type="search"
          value={q} onChange={(e) => set({ q: e.target.value }, true)} />
        <Button variant="primary" icon={<Plus size={15} />} onClick={newEvent} className="max-sm:h-[46px] max-sm:flex-1">New event</Button>
      </>}>
      <div className="mb-[18px] flex items-end gap-3.5">
        <TabBar className="min-w-0 flex-1" value={f} onChange={(v) => set({ f: v === 'all' ? undefined : v }, true)} tabs={tabs} />
        {f !== 'trash' && (
          <Menu width={180} items={SORTS.map((s) => ({ label: s.label, icon: s.value === sort ? <Check size={14} /> : <span className="inline-block w-3.5" />, onSelect: () => set({ sort: s.value === 'recent' ? undefined : s.value }, true) }))}
            trigger={<Button size="sm" className="mb-1.5 max-sm:h-10" icon={<ArrowUpDown size={13} />} iconRight={<ChevronDown size={12} />} aria-label={`Sort: ${SORTS.find((s) => s.value === sort)!.label}`}>
              <span className="max-[420px]:sr-only">{SORTS.find((s) => s.value === sort)!.label}</span>
            </Button>} />
        )}
      </div>

      {f === 'trash' ? (
        <TrashList query={deleted} rows={trashRows} />
      ) : events.error ? (
        <QueryError error={events.error} retry={() => events.refetch()} what="your events" />
      ) : events.isLoading ? (
        <div className={GRID} aria-busy="true" aria-label="Loading events">{Array.from({ length: 8 }, (_, i) => <EventCardSkeleton key={i} />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={<CalendarPlus size={24} />} title="Create your first event"
          body="An event is one gallery with one link. Upload photos, share the link, and guests find themselves with a selfie."
          action={<Button variant="primary" icon={<Plus size={15} />} onClick={newEvent}>New event</Button>} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<SearchX size={24} />} title="No events match"
          body={q ? `Nothing matches “${q}”${f === 'all' ? '' : ` in ${FILTERS.find((x) => x.value === f)!.label.toLowerCase()}`}.` : 'No events have this status right now.'}
          action={<Button onClick={() => set({ q: undefined, f: undefined }, true)}>{q ? 'Clear search' : 'Show all events'}</Button>} />
      ) : (
        <div className={GRID}>
          {shown.map((e) => <EventCard key={e.id} event={e} actions={actions} />)}
        </div>
      )}

      {dialogs}
      <NewEventModal />
    </Page>
  )
}
