import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button, Card, Page, Skeleton, TabBar } from '@frameline/ui'
import { useEvents, useStudio, useStudioStats, useUsage } from '../../lib/queries'
import { QueryError } from '../system'
import { eventsCsv, EventsReport, filterRows, toRows, type Bucket } from './EventsReport'
import { downloadUsageReport, UsageReport, useUsageReportAction } from './UsageReport'
import { labelOf, monthLabel, monthStats } from './stats'

type Tab = 'events' | 'usage'

/** The "this month" numbers that used to be on Home: a small row above the tabs. */
function MonthSummary() {
  const q = useStudioStats()
  if (q.isError) return null
  const stats = q.data ? monthStats(q.data) : undefined
  const month = q.data ? labelOf(q.data.month) : monthLabel()
  return (
    <section aria-label={`${month} so far`} className="mb-5">
      <div className="mb-2 text-[13px] font-bold text-ink-2">{month} so far</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats ? stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
            <div className="truncate text-[20px] font-extrabold leading-tight tnum">{s.value}</div>
            <div className="text-[13px] text-ink-2">{s.label}</div>
            <div className="mt-0.5 truncate text-[12px] text-ink-3">{s.sub}</div>
          </div>
        )) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px] rounded-card" />)}
      </div>
    </section>
  )
}

export default function Reports() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'usage' ? 'usage' : 'events'
  const events = useEvents()
  const usage = useUsage()
  const studio = useStudio()
  const { report, request } = useUsageReportAction()
  const [bucket, setBucket] = useState<Bucket>('active')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => (events.data ? toRows(events.data, usage.data) : undefined), [events.data, usage.data])
  const shown = rows ? filterRows(rows, bucket, query) : []

  const r = report.data
  const action = tab === 'events'
    ? <Button variant="primary" icon={<Download size={15} />} disabled={!shown.length} onClick={() => eventsCsv(shown)}>Export CSV</Button>
    : r?.status === 'ready'
      ? <>
          <Button variant="ghost" loading={request.isPending} onClick={() => request.mutate(undefined)}>Make a fresh one</Button>
          <Button variant="primary" icon={<Download size={15} />} onClick={() => downloadUsageReport(r)}>Download usage report</Button>
        </>
      : <Button variant="primary" icon={<Download size={15} />} loading={request.isPending || r?.status === 'processing'} onClick={() => request.mutate(undefined)}>
          {r?.status === 'processing' ? 'Preparing report…' : 'Get usage report'}
        </Button>

  return (
    <Page title="Reports" subtitle="How your events and photos are doing. Numbers are live." actions={action}>
      <MonthSummary />
      <TabBar className="mb-4" value={tab} onChange={(t) => setParams((p) => { p.set('tab', t); return p }, { replace: true })}
        tabs={[{ value: 'events', label: 'Events' }, { value: 'usage', label: 'Usage' }]} />
      {events.isError ? <Card><QueryError error={events.error} retry={() => events.refetch()} /></Card>
        : tab === 'events' ? <EventsReport rows={rows} loading={events.isLoading} bucket={bucket} setBucket={setBucket} query={query} setQuery={setQuery} />
        : <UsageReport events={events.data} email={studio.data?.email} />}
    </Page>
  )
}
