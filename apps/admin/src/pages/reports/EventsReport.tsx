import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Search } from 'lucide-react'
import { DEMO_NOW, fmt, PLANS, type PhotoEvent, type Usage } from '@frameline/shared'
import { Button, EmptyState, EventStatusChip, FilterChips, Input, Skeleton } from '@frameline/ui'
import { downloadCsv, td, th } from './files'

export type Bucket = 'active' | 'expiring' | 'archived'

/** Events whose validity ends within this many days count as "Expiring". */
const EXPIRING_DAYS = 30

export const TYPE_LABEL: Record<PhotoEvent['type'], string> = {
  wedding: 'Wedding', engagement: 'Engagement', couple: 'Couple', family: 'Family', baby: 'Baby shoot', birthday: 'Birthday',
  corporate: 'Corporate', school: 'School', sports: 'Sports', product: 'Product', 'real-estate': 'Real estate', themed: 'Themed', other: 'Other',
}

export interface ReportRow {
  id: string; name: string; shortId: string; type: string; date: string; created: string; photos: number; visits: number
  plan: string; expiresAt: string; days: number; status: PhotoEvent['status']; bucket: Bucket
}

export function toRows(events: PhotoEvent[], usage?: Usage): ReportRow[] {
  const planName = PLANS.find((p) => p.id === usage?.planId)?.name ?? 'Plan'
  return events.filter((e) => !e.deletedAt).map<ReportRow>((e) => {
    const days = fmt.daysUntil(e.expiresAt, DEMO_NOW)
    const bucket: Bucket = e.status === 'archived' ? 'archived' : e.status === 'expiring' || days <= EXPIRING_DAYS ? 'expiring' : 'active'
    return {
      id: e.id, name: e.name, shortId: e.shortId, type: TYPE_LABEL[e.type], date: e.date, created: e.createdAt, photos: e.photoCount,
      visits: e.visits.web + e.visits.android + e.visits.ios,
      plan: e.plan === 'pack' ? 'Event pack' : e.plan === 'trial' ? 'Free trial' : planName,
      expiresAt: e.expiresAt, days, status: e.status, bucket,
    }
  })
}

export const filterRows = (rows: ReportRow[], bucket: Bucket, query: string) => {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => r.bucket === bucket && (!q || `${r.name} ${r.shortId} ${r.type}`.toLowerCase().includes(q)))
}

export function eventsCsv(rows: ReportRow[]) {
  downloadCsv(`events-report-${new Date(DEMO_NOW).toISOString().slice(0, 10)}.csv`, [
    ['Event', 'ID', 'Type', 'Event date', 'Created', 'Photos', 'Gallery visits', 'Plan', 'Expiry', 'Days left', 'Status'],
    ...rows.map((r) => [r.name, r.shortId, r.type, fmt.date(r.date), fmt.date(r.created), r.photos, r.visits, r.plan, fmt.date(r.expiresAt), r.days, r.status]),
  ])
}

const BUCKET_NOTE: Record<Bucket, string> = {
  active: 'Events guests can open now.',
  expiring: `Events that end within ${EXPIRING_DAYS} days, or already ended. Renew one to keep it open for guests.`,
  archived: 'Hidden from guests but kept. Restore one from its event page.',
}

export function EventsReport({ rows, loading, bucket, setBucket, query, setQuery }: {
  rows?: ReportRow[]; loading: boolean; bucket: Bucket; setBucket: (b: Bucket) => void; query: string; setQuery: (q: string) => void
}) {
  const counts = useMemo(() => {
    const c = { active: 0, expiring: 0, archived: 0 }
    rows?.forEach((r) => { c[r.bucket]++ })
    return c
  }, [rows])
  const navigate = useNavigate()
  const shown = rows ? filterRows(rows, bucket, query) : []
  const q = query.trim()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips label="Event status" value={bucket} onChange={setBucket} options={[
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'expiring', label: 'Expiring', count: counts.expiring },
          { value: 'archived', label: 'Archived', count: counts.archived },
        ]} />
        <Input className="w-full sm:w-[260px]" icon={<Search size={14} />} placeholder="Search by name, ID or type" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {loading ? <div className="p-4"><Skeleton className="h-60" /></div> : !shown.length ? (
          <EmptyState icon={<CalendarDays size={22} />} title={q ? 'No events match' : 'No events here'}
            body={q ? `Nothing matches “${q}”. Try the event ID, like 6402F9F.` : bucket === 'active' ? 'Create an event and it shows up here.' : 'Events move here by themselves as their dates change.'}
            action={q ? <Button onClick={() => setQuery('')}>Clear search</Button> : bucket === 'active' ? <Button onClick={() => navigate('/events?new=1')}>New event</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13.5px] tnum">
              <thead><tr>
                <th className={th}>Event</th><th className={th}>Type</th><th className={th}>Event date</th>
                <th className={`${th} text-right`}>Photos</th><th className={`${th} text-right`}>Visits</th><th className={th}>Plan</th><th className={th}>Ends</th><th className={th}>Status</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-sunk">
                    <td className={td}>
                      <Link to={`/events/${r.id}`} className="font-bold hover:underline">{r.name}</Link>
                      <div className="text-[12px] text-ink-3">ID {r.shortId}</div>
                    </td>
                    <td className={td}>{r.type}</td>
                    <td className={`${td} whitespace-nowrap`}>{fmt.date(r.date)}</td>
                    <td className={`${td} text-right`}>{fmt.count(r.photos)}</td>
                    <td className={`${td} text-right`}>{fmt.count(r.visits)}</td>
                    <td className={td}>{r.plan}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {fmt.date(r.expiresAt)}
                      <div className={`text-[12px] ${r.days <= EXPIRING_DAYS && r.status !== 'archived' ? 'text-warn' : 'text-ink-3'}`}>{r.days < 0 ? `${-r.days} days ago` : r.days === 0 ? 'Today' : `In ${r.days} days`}</div>
                    </td>
                    <td className={td}><EventStatusChip status={r.status} expiresInDays={r.days} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[12.5px] text-ink-3">{BUCKET_NOTE[bucket]} Deleted events are in <Link to="/events?f=trash" className="font-bold text-accent-text hover:underline">Recently deleted</Link>.</p>
    </div>
  )
}
