import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, RotateCcw, Search } from 'lucide-react'
import { DEMO_NOW, fmt, PLANS, type PhotoEvent, type Usage } from '@frameline/shared'
import { Button, Chip, EmptyState, EventStatusChip, Input, Segmented, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { downloadCsv, td, th } from '../wallet/lib'

export type Bucket = 'active' | 'expiring' | 'archived' | 'deleted'

const PURGE_DAYS = 30

export const TYPE_LABEL: Record<PhotoEvent['type'], string> = {
  wedding: 'Wedding', engagement: 'Engagement', couple: 'Couple', family: 'Family', baby: 'Baby shoot', birthday: 'Birthday',
  corporate: 'Corporate', school: 'School', sports: 'Sports', product: 'Product', 'real-estate': 'Real estate', themed: 'Themed', other: 'Other',
}

export interface ReportRow {
  id: string; name: string; shortId: string; type: string; date: string; created: string; photos: number
  plan: string; expiresAt: string; days: number; status: PhotoEvent['status']; bucket: Bucket
  /** Deleted events: when it went to the trash and when it's purged for good (deletedAt + 30 days). */
  deletedAt?: string; purgeAt?: string
}

export function toRows(events: PhotoEvent[], usage?: Usage, deleted: PhotoEvent[] = []): ReportRow[] {
  const planName = PLANS.find((p) => p.id === usage?.planId)?.name ?? 'Plan'
  const all = [...events.filter((e) => !e.deletedAt), ...deleted.filter((e) => e.deletedAt)]
  const rows = all.map<ReportRow>((e) => {
    const days = fmt.daysUntil(e.expiresAt, DEMO_NOW)
    const bucket: Bucket = e.deletedAt ? 'deleted' : e.status === 'archived' ? 'archived' : e.status === 'expiring' || days <= 30 ? 'expiring' : 'active'
    return {
      id: e.id, name: e.name, shortId: e.shortId, type: TYPE_LABEL[e.type], date: e.date, created: e.createdAt, photos: e.photoCount,
      plan: e.plan === 'pack' ? 'Event pack' : e.plan === 'trial' ? 'Free trial' : planName,
      expiresAt: e.expiresAt, days, status: e.status, bucket,
      ...(e.deletedAt ? { deletedAt: e.deletedAt, purgeAt: new Date(Date.parse(e.deletedAt) + PURGE_DAYS * 86_400_000).toISOString() } : {}),
    }
  })
  return rows
}

export function eventsCsv(rows: ReportRow[]) {
  downloadCsv(`events-report-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Event', 'ID', 'Type', 'Event date', 'Created', 'Photos', 'Plan', 'Expiry', 'Days left', 'Status', 'Deleted', 'Purged on'],
    ...rows.map((r) => [r.name, r.shortId, r.type, fmt.date(r.date), fmt.date(r.created), r.photos, r.plan, fmt.date(r.expiresAt), r.deletedAt ? '' : r.days, r.deletedAt ? 'deleted' : r.status, r.deletedAt ? fmt.date(r.deletedAt) : '', r.purgeAt ? fmt.date(r.purgeAt) : '']),
  ])
}

export function EventsReport({ rows, loading, bucket, setBucket, query, setQuery }: {
  rows?: ReportRow[]; loading: boolean; bucket: Bucket; setBucket: (b: Bucket) => void; query: string; setQuery: (q: string) => void
}) {
  const api = useApi()
  const restore = useAction((id: string) => api.restoreEvent(id), { success: (e) => `${e.name} restored` })
  const counts = useMemo(() => ({
    active: rows?.filter((r) => r.bucket === 'active').length ?? 0,
    expiring: rows?.filter((r) => r.bucket === 'expiring').length ?? 0,
    archived: rows?.filter((r) => r.bucket === 'archived').length ?? 0,
    deleted: rows?.filter((r) => r.bucket === 'deleted').length ?? 0,
  }), [rows])
  const q = query.trim().toLowerCase()
  const shown = rows?.filter((r) => r.bucket === bucket && (!q || r.name.toLowerCase().includes(q) || r.shortId.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))) ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={bucket} onChange={setBucket} options={[
          { value: 'active', label: <>Active <span className="font-mono text-ink-3">{counts.active}</span></> },
          { value: 'expiring', label: <>Expired or expiring <span className="font-mono text-ink-3">{counts.expiring}</span></> },
          { value: 'archived', label: <>Archived <span className="font-mono text-ink-3">{counts.archived}</span></> },
          { value: 'deleted', label: <>Deleted <span className="font-mono text-ink-3">{counts.deleted}</span></> },
        ]} />
        <Input className="w-full sm:w-[240px]" icon={<Search size={13} />} placeholder="Filter by name, ID or type" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter events" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {loading ? <div className="p-4"><Skeleton className="h-60" /></div> : !shown.length ? (
          <EmptyState icon={<CalendarDays size={22} />} title={q ? 'No events match' : 'No events here'} body={q ? `Nothing matches “${query}”. Try the event ID, like 6402F9F.` : 'Events move here automatically as their status changes.'}
            action={q ? <Button onClick={() => setQuery('')}>Clear filter</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px] tnum">
              <thead><tr>
                <th className={th}>Event</th><th className={th}>ID</th><th className={th}>Type</th><th className={th}>Event date</th><th className={th}>Created</th>
                <th className={`${th} text-right`}>Photos</th><th className={th}>Plan</th><th className={th}>Expiry</th><th className={th}>Status</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-sunk">
                    <td className={`${td} font-bold`}>{r.deletedAt ? r.name : <Link to={`/events/${r.id}`} className="hover:underline">{r.name}</Link>}</td>
                    <td className={`${td} font-mono`}>{r.shortId}</td>
                    <td className={td}>{r.type}</td>
                    <td className={`${td} whitespace-nowrap`}>{fmt.date(r.date)}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-[11.5px] text-ink-2`}>{fmt.date(r.created)}</td>
                    <td className={`${td} text-right font-mono`}>{fmt.count(r.photos)}</td>
                    <td className={td}>{r.plan}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-[11.5px]`}>
                      {r.deletedAt ? <>Deleted {fmt.dayMonth(r.deletedAt)} <span className="text-bad">· purged {fmt.date(r.purgeAt!)}</span></>
                        : <>{fmt.date(r.expiresAt)} <span className={r.days <= 30 ? 'text-warn' : 'text-ink-3'}>· {r.days < 0 ? `${-r.days}d ago` : `in ${r.days}d`}</span></>}
                    </td>
                    <td className={td}>{r.deletedAt ? (
                      <div className="flex items-center gap-2"><Chip tone="bad">Deleted</Chip>
                        <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} loading={restore.isPending && restore.variables === r.id} onClick={() => restore.mutate(r.id)}>Restore</Button></div>
                    ) : <EventStatusChip status={r.status} expiresInDays={r.days} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[12px] text-ink-3">{bucket === 'archived' ? 'Archived events are hidden from guests but kept, so you can bring them back by renewing.' : bucket === 'deleted' ? `Deleted events stay in the trash for ${PURGE_DAYS} days. Restore one before its purge date to get everything back; after that it’s gone for good.` : 'Deleted events move to the Deleted tab for 30 days.'}</p>
    </div>
  )
}
