import { useState } from 'react'
import type { Broadcast } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { ConfirmDialog, PageHeader, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useBroadcasts, useEvents, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { audienceSize, emptyDraft, type Draft } from './draft'
import { Composer } from './Composer'
import { LockScreenPreview } from './LockScreenPreview'
import { SentList } from './SentList'

export default function Broadcasts() {
  const api = useApi()
  const toast = useToast()
  const broadcasts = useBroadcasts()
  const events = useEvents()
  const studio = useStudio()
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [deleting, setDeleting] = useState<Broadcast | null>(null)

  const eventList = (events.data ?? []).filter((e) => e.status !== 'draft')
  const followers = studio.data?.followers ?? 0

  const send = useAction((scheduledAt: string | undefined) => api.sendBroadcast({
    title: draft.title.trim(),
    body: draft.body.trim(),
    audience: draft.audience === 'all' ? 'all' : draft.eventId,
    scheduledAt,
    imageUrl: draft.image,
  }), {
    success: (b) => b.scheduledAt ? `Scheduled for ${fmt.dateTime(b.scheduledAt)}` : `Sent to ${fmt.count(audienceSize(draft, eventList, followers))} people`,
    onSuccess: () => setDraft(emptyDraft(draft.eventId)),
  })
  const cancel = useAction((b: Broadcast) => api.cancelBroadcast(b.id), { success: 'Cancelled — it won’t be sent' })
  const remove = useAction((b: Broadcast) => api.deleteBroadcast(b.id), { success: 'Broadcast deleted' })

  const duplicate = (b: Broadcast) => {
    setDraft({ title: b.title, body: b.body, image: b.imageUrl, audience: b.audience === 'all' ? 'all' : 'event', eventId: b.audience === 'all' ? draft.eventId : b.audience })
    toast.success('Copied into the composer', 'Edit it, then send or schedule.')
    document.getElementById('bc-title')?.focus()
  }

  return (
    <div className="pb-10">
      <PageHeader title="Broadcasts" subtitle="Send an update to guests who follow your studio." />
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-[1fr_280px] 2xl:grid-cols-[1fr_280px_1fr]">
        <Composer draft={draft} onChange={setDraft} events={eventList} followers={followers} busy={send.isPending} onSend={(at) => send.mutate(at)} />
        <div className="flex justify-center lg:justify-start">
          <LockScreenPreview studio={studio.data} draft={draft} />
        </div>
        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          {broadcasts.error
            ? <QueryError error={broadcasts.error} retry={() => broadcasts.refetch()} />
            : <SentList items={broadcasts.data} events={events.data ?? []} loading={broadcasts.isLoading}
                onDuplicate={duplicate} onCancel={(b) => cancel.mutate(b)} onDelete={setDeleting} />}
        </div>
      </div>
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null) }}
        title={`Delete “${deleting?.title ?? ''}”?`}
        body={deleting?.sentAt
          ? 'It disappears from this list and from the app’s Posts tab. People who already got the notification keep it.'
          : 'It’s removed and will never be sent.'}
        confirmLabel="Delete" danger
        onConfirm={() => { if (deleting) remove.mutate(deleting); setDeleting(null) }} />
    </div>
  )
}
