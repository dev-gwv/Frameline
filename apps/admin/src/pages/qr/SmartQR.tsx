import { useEffect, useRef, useState } from 'react'
import { Plus, QrCode } from 'lucide-react'
import type { ID, SmartQR as SmartQRType } from '@frameline/shared'
import { Button, EmptyState, PageHeader, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useQRs, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { useLocalState } from './util'
import { QRCard, TARGETS, type QRStyle } from './QRCard'
import { NewQRModal, ScheduleModal, type ScheduledSwitch } from './modals'

export default function SmartQR() {
  const api = useApi()
  const toast = useToast()
  const qrs = useQRs()
  const events = useEvents()
  const studio = useStudio()
  const [creating, setCreating] = useState(false)
  const [scheduling, setScheduling] = useState<SmartQRType | null>(null)
  // The API has no schedule or style fields yet, so these live in localStorage.
  const [schedules, setSchedules] = useLocalState<Record<ID, ScheduledSwitch>>('frameline.qr.schedules.v1', {})
  const [styles, setStyles] = useLocalState<Record<ID, QRStyle>>('frameline.qr.styles.v1', {})

  const eventName = (id: ID) => events.data?.find((e) => e.id === id)?.name ?? 'that event'

  const update = useAction(({ id, patch }: { id: ID; patch: Partial<SmartQRType> }) => api.updateQR(id, patch), {
    success: (_d, { patch }) =>
      patch.eventId ? `Now opens ${eventName(patch.eventId)}`
        : patch.target ? `Opens in: ${TARGETS.find((t) => t.value === patch.target)?.label}`
          : patch.name ? 'Renamed' : 'Saved',
  })
  const create = useAction(({ name, eventId }: { name: string; eventId: ID }) => api.createQR(name, eventId), {
    success: (q) => `“${q.name}” created`,
    onSuccess: () => setCreating(false),
  })

  // Apply scheduled switches whose time has come (checked on load and every 30 s while open).
  const applying = useRef(new Set<ID>())
  useEffect(() => {
    const run = () => {
      const now = Date.now()
      for (const [id, s] of Object.entries(schedules)) {
        if (new Date(s.at).getTime() > now || applying.current.has(id)) continue
        applying.current.add(id)
        api.updateQR(id, { eventId: s.eventId })
          .then(() => toast.success(`Now opens ${eventName(s.eventId)}`, 'Your scheduled switch ran.'))
          .catch(() => { /* QR was deleted; drop the schedule */ })
          .finally(() => {
            applying.current.delete(id)
            setSchedules((all) => { const n = { ...all }; delete n[id]; return n })
          })
      }
    }
    run()
    const t = setInterval(run, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, api])

  const header = (
    <PageHeader title="Smart QR" subtitle="Print a QR once and point it at a different event whenever you like."
      actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)} disabled={!events.data}>New QR</Button>} />
  )

  const error = qrs.error ?? events.error
  let body
  if (error) body = <QueryError error={error} retry={() => { qrs.refetch(); events.refetch() }} />
  else if (!qrs.data || !events.data) body = <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[470px]" />)}</div>
  else if (qrs.data.length === 0) body = (
    <EmptyState icon={<QrCode size={24} />} title="No QR codes yet"
      body="Make one QR for your studio desk or a standee. Print it once, then switch the event it opens whenever you like."
      action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New QR</Button>} />
  )
  else body = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {qrs.data.map((q, i) => (
        <QRCard key={q.id} qr={q} events={events.data!}
          studioName={studio.data?.name ?? 'Your studio'} brandColor={studio.data?.brandColor ?? '#8C2F39'}
          style={styles[q.id] ?? { rounded: i % 3 !== 2 }}
          schedule={schedules[q.id]}
          onUpdate={(patch) => update.mutate({ id: q.id, patch })}
          onStyle={(s) => setStyles((all) => ({ ...all, [q.id]: s }))}
          onSchedule={() => setScheduling(q)}
          onClearSchedule={() => { setSchedules((all) => { const n = { ...all }; delete n[q.id]; return n }); toast.success('Scheduled switch cancelled') }}
        />
      ))}
    </div>
  )

  return (
    <div className="pb-10">
      {header}
      <div className="px-4 sm:px-7">{body}</div>
      <NewQRModal open={creating} onOpenChange={setCreating} events={events.data ?? []} busy={create.isPending}
        onCreate={(name, eventId) => create.mutate({ name, eventId })} />
      <ScheduleModal qr={scheduling} events={events.data ?? []} current={scheduling ? schedules[scheduling.id] : undefined}
        onOpenChange={(v) => { if (!v) setScheduling(null) }}
        onSave={(s) => {
          const q = scheduling!
          setSchedules((all) => ({ ...all, [q.id]: s }))
          setScheduling(null)
          toast.success('Switch scheduled', `“${q.name}” opens ${eventName(s.eventId)} from ${new Date(s.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.`)
        }}
        onClear={() => {
          const q = scheduling!
          setSchedules((all) => { const n = { ...all }; delete n[q.id]; return n })
          setScheduling(null)
          toast.success('Scheduled switch cancelled')
        }} />
    </div>
  )
}
