import { useState } from 'react'
import { Plus, QrCode } from 'lucide-react'
import type { ID, SmartQR as SmartQRType } from '@frameline/shared'
import { Button, ConfirmDialog, EmptyState, PageHeader, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useQRs, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { QRCard, TARGETS } from './QRCard'
import { NewQRModal, ScheduleModal } from './modals'

export default function SmartQR() {
  const api = useApi()
  const qrs = useQRs()
  const events = useEvents()
  const studio = useStudio()
  const [creating, setCreating] = useState(false)
  const [scheduling, setScheduling] = useState<SmartQRType | null>(null)
  const [deleting, setDeleting] = useState<SmartQRType | null>(null)
  const eventName = (id: ID) => events.data?.find((e) => e.id === id)?.name ?? 'that event'

  const update = useAction(({ id, patch }: { id: ID; patch: Partial<SmartQRType> }) => api.updateQR(id, patch), {
    success: (_d, { patch }) =>
      patch.eventId ? `Now opens ${eventName(patch.eventId)}`
        : patch.target ? `Opens in: ${TARGETS.find((t) => t.value === patch.target)?.label}`
          : patch.name ? 'Renamed'
            : patch.scheduledEventId === '' ? 'Scheduled switch cancelled'
              : patch.dotStyle ? 'Style updated'
                : patch.logoUrl !== undefined ? (patch.logoUrl ? 'Logo added' : 'Logo removed') : 'Saved',
  })
  const schedule = useAction(({ id, eventId, at }: { id: ID; eventId: ID; at: string }) => api.updateQR(id, { scheduledEventId: eventId, scheduledAt: at }), {
    success: (q, { eventId, at }) => `“${q.name}” opens ${eventName(eventId)} from ${new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`,
    onSuccess: () => setScheduling(null),
  })
  const clearSchedule = useAction((id: ID) => api.updateQR(id, { scheduledEventId: '', scheduledAt: '' }), {
    success: 'Scheduled switch cancelled',
    onSuccess: () => setScheduling(null),
  })
  const remove = useAction((q: SmartQRType) => api.deleteQR(q.id), { success: (_d, q) => `“${q.name}” deleted` })
  const create = useAction(({ name, eventId }: { name: string; eventId: ID }) => api.createQR(name, eventId), {
    success: (q) => `“${q.name}” created`,
    onSuccess: () => setCreating(false),
  })

  // Scheduled switches run server-side (cron); the list refreshes through live updates.

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
      {qrs.data.map((q) => (
        <QRCard key={q.id} qr={q} events={events.data!}
          studioName={studio.data?.name ?? 'Your studio'} brandColor={studio.data?.brandColor ?? '#8C2F39'}
          onUpdate={(patch) => update.mutate({ id: q.id, patch })}
          onSchedule={() => setScheduling(q)}
          onClearSchedule={() => clearSchedule.mutate(q.id)}
          onDelete={() => setDeleting(q)}
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
      <ScheduleModal qr={scheduling} events={events.data ?? []} busy={schedule.isPending || clearSchedule.isPending}
        onOpenChange={(v) => { if (!v) setScheduling(null) }}
        onSave={(s) => schedule.mutate({ id: scheduling!.id, ...s })}
        onClear={() => clearSchedule.mutate(scheduling!.id)} />
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null) }}
        title={`Delete “${deleting?.name ?? ''}”?`}
        body="Printed copies of this QR will stop working. Scan counts are deleted too. This can’t be undone."
        confirmLabel="Delete QR" danger
        onConfirm={() => { if (deleting) remove.mutate(deleting); setDeleting(null) }} />
    </div>
  )
}
