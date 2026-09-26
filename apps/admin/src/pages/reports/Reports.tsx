import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button, Card, PageHeader, TabBar } from '@frameline/ui'
import { useDeletedEvents, useEvents, useStudio, useUsage } from '../../lib/queries'
import { QueryError } from '../system'
import { eventsCsv, EventsReport, toRows, type Bucket } from './EventsReport'
import { downloadUsageReport, UsageReport, useUsageReportAction } from './UsageReport'

type Tab = 'events' | 'usage'

export default function Reports() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'usage' ? 'usage' : 'events'
  const events = useEvents()
  const deleted = useDeletedEvents()
  const usage = useUsage()
  const studio = useStudio()
  const { report, request } = useUsageReportAction()
  const [bucket, setBucket] = useState<Bucket>('active')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => (events.data ? toRows(events.data, usage.data, deleted.data) : undefined), [events.data, usage.data, deleted.data])

  const download = () => {
    if (tab === 'events') {
      const q = query.trim().toLowerCase()
      rows && eventsCsv(rows.filter((r) => r.bucket === bucket && (!q || `${r.name} ${r.shortId} ${r.type}`.toLowerCase().includes(q))))
    } else if (report.data?.status === 'ready') downloadUsageReport(report.data)
    else request.mutate(undefined)
  }

  return (
    <div className="pb-10">
      <PageHeader title="Reports" subtitle="Photo counts are live. Usage reports are also emailed to you."
        actions={<Button icon={<Download size={14} />} loading={tab === 'usage' && request.isPending}
          disabled={tab === 'events' ? !rows : report.data?.status === 'processing'} onClick={download}>
          {tab === 'usage' && report.data?.status !== 'ready' ? (report.data?.status === 'processing' ? 'Preparing report…' : 'Request usage report') : 'Download CSV'}</Button>} />
      <div className="flex flex-col gap-3 px-4 sm:px-7">
        <TabBar value={tab} onChange={(t) => setParams((p) => { p.set('tab', t); return p }, { replace: true })} tabs={[{ value: 'events', label: 'Events' }, { value: 'usage', label: 'Usage' }]} />
        {events.isError ? <Card><QueryError error={events.error} retry={() => events.refetch()} /></Card>
          : tab === 'events' ? <EventsReport rows={rows} loading={events.isLoading} bucket={bucket} setBucket={setBucket} query={query} setQuery={setQuery} />
          : <UsageReport email={studio.data?.email} />}
      </div>
    </div>
  )
}
