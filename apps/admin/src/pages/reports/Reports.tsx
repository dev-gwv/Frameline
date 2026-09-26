import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button, Card, PageHeader, TabBar } from '@frameline/ui'
import { useEvents, useStudio, useUsage } from '../../lib/queries'
import { QueryError } from '../system'
import { downloadCsv, round2 } from '../wallet/lib'
import { usePurchases } from '../wallet/purchases'
import { eventsCsv, EventsReport, toRows, type Bucket } from './EventsReport'
import { uploadsByYear, UsageReport } from './UsageReport'

type Tab = 'events' | 'usage'

export default function Reports() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'usage' ? 'usage' : 'events'
  const events = useEvents()
  const usage = useUsage()
  const studio = useStudio()
  const { purchases } = usePurchases()
  const [bucket, setBucket] = useState<Bucket>('active')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => (events.data ? toRows(events.data, usage.data) : undefined), [events.data, usage.data])

  const download = () => {
    if (tab === 'events') {
      const q = query.trim().toLowerCase()
      rows && eventsCsv(rows.filter((r) => r.bucket === bucket && (!q || `${r.name} ${r.shortId} ${r.type}`.toLowerCase().includes(q))))
    } else {
      downloadCsv(`usage-report-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Section', 'Year', 'Detail', 'Value'],
        ...uploadsByYear(usage.data).map(([y, n]) => ['Photo uploads', y, '', n]),
        ...purchases.map((p) => ['Purchase', p.at.slice(0, 4), p.item, round2(p.amount)]),
      ])
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title="Reports" subtitle="Photo counts are live. Usage reports are also emailed to you."
        actions={<Button icon={<Download size={14} />} disabled={tab === 'events' && !rows} onClick={download}>Download CSV</Button>} />
      <div className="flex flex-col gap-3 px-4 sm:px-7">
        <TabBar value={tab} onChange={(t) => setParams((p) => { p.set('tab', t); return p }, { replace: true })} tabs={[{ value: 'events', label: 'Events' }, { value: 'usage', label: 'Usage' }]} />
        {events.isError ? <Card><QueryError error={events.error} retry={() => events.refetch()} /></Card>
          : tab === 'events' ? <EventsReport rows={rows} loading={events.isLoading} bucket={bucket} setBucket={setBucket} query={query} setQuery={setQuery} />
          : <UsageReport usage={usage.data} loading={usage.isLoading} email={studio.data?.email} />}
      </div>
    </div>
  )
}
