import { useState } from 'react'
import { Plus, QrCode } from 'lucide-react'
import type { ID, SmartQR as SmartQRType } from '@frameline/shared'
import { Button, Card, EmptyState, Page, Skeleton, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction, useEvents, useQRs, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { QRCard } from './QRCard'
import { ChangeEventModal, NewQRModal, RenameModal, ScheduleModal, TARGETS } from './modals'

export default function SmartQR() {
  const api = useApi()
  const toast = useToast()
  const qrs = useQRs()
  const events = useEvents()
  const studio = useStudio()
  const [creating, setCreating] = useState(false)
  const [scheduling, setScheduling] = useState<SmartQRType | null>(null)
  const [changing, setChanging] = useState<SmartQRType | null>(null)
  const [renaming, setRenaming] = useState<SmartQRType | null>(null)
  const [hidden, setHidden] = useState<Set<ID>>(new Set())
  const eventName = (id: ID) => events.data?.find((e) => e.id === id)?.name ?? 'that event'

  const update = useAction(({ id, patch }: { id: ID; patch: Partial<SmartQRType>; undo?: Partial<SmartQRType>; label?: string }) => api.updateQR(id, patch), {
    onSuccess: (_q, { id, patch, undo, label }) => {
      const title = label ?? (patch.eventId ? `Now opens ${eventName(patch.eventId)}`
        : patch.target ? `Opens in: ${TARGETS.find((t) => t.value === patch.target)?.label}`
          : patch.name ? 'Renamed'
            : patch.dotStyle ? 'Style updated'
              : patch.color ? 'Colour updated'
                : patch.logoUrl !== undefined ? (patch.logoUrl ? 'Logo added' : 'Logo removed') : 'Saved')
      if (undo) toast.undo(title, () => update.mutate({ id, patch: undo, label: 'Undone' }))
      else toast.success(title)
      setChanging(null); setRenaming(null)
    },
  })
  const schedule = useAction(({ id, eventId, at }: { id: ID; eventId: ID; at: string }) => api.updateQR(id, { scheduledEventId: eventId, scheduledAt: at }), {
    success: (q, { eventId, at }) => `“${q.name}” opens ${eventName(eventId)} from ${new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`,
    onSuccess: () => setScheduling(null),
  })
  const clearSchedule = useAction((id: ID) => api.updateQR(id, { scheduledEventId: '', scheduledAt: '' }), {
    success: 'Scheduled switch cancelled',
    onSuccess: () => setScheduling(null),
  })
  const create = useAction(({ name, eventId }: { name: string; eventId: ID }) => api.createQR(name, eventId), {
    success: (q) => `“${q.name}” created`,
    onSuccess: () => setCreating(false),
  })

  const remove = (q: SmartQRType) => {
    setHidden((s) => new Set(s).add(q.id))
    const unhide = () => setHidden((s) => { const n = new Set(s); n.delete(q.id); return n })
    const done = api.deleteQR(q.id).then(() => true, (err: unknown) => { unhide(); toast.error('Couldn’t delete the QR code', errorMessage(err)); return false })
    toast.undo(`“${q.name}” deleted`, () => {
      void done.then((ok) => { if (ok) api.restoreQR(q.id).then(unhide, (err: unknown) => toast.error('Couldn’t bring the QR code back', errorMessage(err))) })
    }, 'Printed copies stop working until you undo.')
  }

  const visible = (qrs.data ?? []).filter((q) => !hidden.has(q.id))
  const error = qrs.error ?? events.error
  let body
  if (error) body = <Card><QueryError error={error} retry={() => { void qrs.refetch(); void events.refetch() }} /></Card>
  else if (!qrs.data || !events.data) body = <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px]" />)}</div>
  else if (!visible.length) body = (
    <Card>
      <EmptyState icon={<QrCode size={24} />} title="No QR codes yet"
        body="Make one for your studio desk, table cards or a standee. Print it once, then change the event it opens whenever you like."
        action={<Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>New QR code</Button>} />
    </Card>
  )
  else body = (
    <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((q) => (
        <QRCard key={q.id} qr={q} events={events.data!}
          studioName={studio.data?.name ?? 'Your studio'} brandColor={studio.data?.brandColor ?? '#8C2F39'}
          onUpdate={(patch) => update.mutate({ id: q.id, patch })}
          onChangeEvent={() => setChanging(q)}
          onSchedule={() => setScheduling(q)}
          onClearSchedule={() => clearSchedule.mutate(q.id)}
          onRename={() => setRenaming(q)}
          onRemoveLogo={() => update.mutate({ id: q.id, patch: { logoUrl: '' }, undo: { logoUrl: q.logoUrl } })}
          onDelete={() => remove(q)}
        />
      ))}
    </div>
  )

  return (
    <Page title="Smart QR" subtitle="Print one QR code once. Point it at a different event any time."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)} disabled={!events.data}>New QR code</Button>}>
      {body}
      <NewQRModal open={creating} onOpenChange={setCreating} events={events.data ?? []} busy={create.isPending}
        onCreate={(name, eventId) => create.mutate({ name, eventId })} />
      <ChangeEventModal qr={changing} events={events.data ?? []} busy={update.isPending}
        onOpenChange={(v) => { if (!v) setChanging(null) }}
        onSave={(patch) => changing && update.mutate({ id: changing.id, patch, undo: { eventId: changing.eventId, target: changing.target } })} />
      <RenameModal qr={renaming} busy={update.isPending} onOpenChange={(v) => { if (!v) setRenaming(null) }}
        onSave={(name) => renaming && update.mutate({ id: renaming.id, patch: { name } })} />
      <ScheduleModal qr={scheduling} events={events.data ?? []} busy={schedule.isPending || clearSchedule.isPending}
        onOpenChange={(v) => { if (!v) setScheduling(null) }}
        onSave={(s) => scheduling && schedule.mutate({ id: scheduling.id, ...s })}
        onClear={() => scheduling && clearSchedule.mutate(scheduling.id)} />
    </Page>
  )
}
