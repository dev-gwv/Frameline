import { useState } from 'react'
import type { Broadcast } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { PageHeader, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useBroadcasts, useEvents, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { useLocalState } from './util'
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
  // The API has no delete for broadcasts yet; deletions are remembered locally.
  const [deleted, setDeleted] = useLocalState<string[]>('frameline.broadcasts.deleted.v1', [])

  const eventList = (events.data ?? []).filter((e) => e.status !== 'draft')

  const send = useAction((scheduledAt: string | undefined) => api.sendBroadcast({
    title: draft.title.trim(),
    body: draft.body.trim(),
    audience: draft.audience === 'all' ? 'all' : draft.eventId,
    scheduledAt,
  }), {
    success: (b) => b.scheduledAt ? `Scheduled for ${fmt.dateTime(b.scheduledAt)}` : `Sent to ${fmt.count(audienceSize(draft, eventList))} people`,
    onSuccess: () => { if (draft.image) URL.revokeObjectURL(draft.image); setDraft(emptyDraft(draft.eventId)) },
  })

  const duplicate = (b: Broadcast) => {
    setDraft({ title: b.title, body: b.body, audience: b.audience === 'all' ? 'all' : 'event', eventId: b.audience === 'all' ? draft.eventId : b.audience })
    toast.success('Copied into the composer', 'Edit it, then send or schedule.')
    document.getElementById('bc-title')?.focus()
  }

  const remove = (b: Broadcast) => {
    setDeleted((d) => [...d, b.id])
    toast.toast({ title: b.sentAt ? 'Removed from the list' : 'Scheduled broadcast cancelled', action: { label: 'Undo', onClick: () => setDeleted((d) => d.filter((x) => x !== b.id)) } })
  }

  const visible = broadcasts.data?.filter((b) => !deleted.includes(b.id))

  return (
    <div className="pb-10">
      <PageHeader title="Broadcasts" subtitle="Send an update to guests who follow your studio." />
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-[1fr_280px] 2xl:grid-cols-[1fr_280px_1fr]">
        <Composer draft={draft} onChange={setDraft} events={eventList} busy={send.isPending} onSend={(at) => send.mutate(at)} />
        <div className="flex justify-center lg:justify-start">
          <LockScreenPreview studio={studio.data} draft={draft} />
        </div>
        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          {broadcasts.error
            ? <QueryError error={broadcasts.error} retry={() => broadcasts.refetch()} />
            : <SentList items={visible} events={events.data ?? []} loading={broadcasts.isLoading} onDuplicate={duplicate} onDelete={remove} />}
        </div>
      </div>
    </div>
  )
}
