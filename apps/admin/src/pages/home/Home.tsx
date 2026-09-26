import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload } from 'lucide-react'
import { Button, PageHeader, Skeleton, StatCard } from '@frameline/ui'
import { useActivity, useEvents, useOrders, useStudio, useWatermark, useWebsite } from '../../lib/queries'
import { useUploads } from '../../layout/UploadDock'
import { QueryError } from '../system'
import { Alerts } from './Alerts'
import { RecentEvents } from './RecentEvents'
import { ActivityFeed, DesktopUploaderCard, SetupChecklist } from './SideCards'
import { UploadPicker } from './UploadPicker'
import { greeting, longDay, monthStats, setupChecklist } from './stats'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function Home() {
  const navigate = useNavigate()
  const [picker, setPicker] = useState(false)
  const studio = useStudio()
  const events = useEvents()
  const orders = useOrders()
  const activity = useActivity()
  const watermark = useWatermark()
  const website = useWebsite()
  const { jobs } = useUploads()

  const list = events.data ?? []
  const live = list.filter((e) => e.status === 'live').length
  const running = jobs.filter((j) => j.done < j.total).length + list.filter((e) => e.status === 'uploading').length
  const short = studio.data?.name.replace(/\s+(studio|studios|photography|films)$/i, '')

  const subtitle = [longDay(), plural(live, 'event') + ' live', running ? plural(running, 'upload') + ' running' : null].filter(Boolean).join(' · ')

  return (
    <div className="pb-10">
      <PageHeader
        title={studio.data ? `${greeting()}, ${short}` : <Skeleton className="h-8 w-64" />}
        subtitle={events.data ? subtitle : longDay()}
        actions={<>
          <Button icon={<Upload size={14} />} onClick={() => setPicker(true)}>Upload</Button>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => navigate('/events?new=1')}>New event</Button>
        </>}
      />
      <div className="grid gap-4 px-4 sm:px-7 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          {events.error ? <QueryError error={events.error} retry={() => events.refetch()} /> : events.isLoading ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)}</div>
              <Skeleton className="h-72" />
            </>
          ) : (
            <>
              <Alerts events={list} />
              <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
                {monthStats(list, orders.data ?? []).map((s) => (
                  <StatCard key={s.label} label={s.label} value={s.value} trend={s.trend} sub={s.sub} spark={s.spark} />
                ))}
              </div>
              <RecentEvents events={list} />
            </>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {studio.data && events.data && watermark.data && website.data && (
            <SetupChecklist items={setupChecklist(studio.data, events.data, watermark.data, website.data)} />
          )}
          <ActivityFeed items={activity.data} loading={activity.isLoading} />
          <DesktopUploaderCard />
        </div>
      </div>
      <UploadPicker open={picker} onOpenChange={setPicker} events={list} />
    </div>
  )
}
