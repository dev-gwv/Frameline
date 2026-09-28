import { useState } from 'react'
import type { Broadcast } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { Page, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction, useBroadcasts, useEvents, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { audienceSize, emptyDraft, type Draft } from './draft'
import { Composer } from './Composer'
import { LockScreenPreview } from './LockScreenPreview'
import { SentList } from './SentList'

/** /messages ('bc'): write, pick who, preview on a lock screen, send or schedule; sent list below. */
export default function Broadcasts() {
  const api = useApi()
  const toast = useToast()
  const broadcasts = useBroadcasts()
  const events = useEvents()
  const studio = useStudio()
  const [draft, setDraft] = useState<Draft>(emptyDraft())

  const eventList = (events.data ?? []).filter((e) => e.status !== 'draft' && e.status !== 'archived')
  const followers = studio.data?.followers ?? 0

  const send = useAction((scheduledAt: string | undefined) => api.sendBroadcast({
    title: draft.title.trim(),
    body: draft.body.trim(),
    audience: draft.audience === 'all' || !eventList.length ? 'all' : (draft.eventId || eventList[0].id),
    scheduledAt,
    imageUrl: draft.image,
  }), {
    success: (b) => b.scheduledAt ? `Scheduled for ${fmt.dateTime(b.scheduledAt)}` : `Sent to ${fmt.count(audienceSize(draft, eventList, followers))} people`,
    onSuccess: () => setDraft(emptyDraft(draft.eventId)),
  })
  const cancel = useAction((b: Broadcast) => api.cancelBroadcast(b.id), { success: 'Cancelled. It won’t be sent.' })

  // Delete acts at once with Undo (rule 8): the message goes to the trash; Undo restores it.
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const unhide = (id: string) => setHidden((h) => { const n = new Set(h); n.delete(id); return n })
  const remove = (b: Broadcast) => {
    setHidden((h) => new Set(h).add(b.id))
    const done = api.deleteBroadcast(b.id).then(() => true, (e) => { unhide(b.id); toast.error('Couldn’t delete that message', errorMessage(e)); return false })
    toast.undo(`Deleted “${b.title}”`, () => {
      void done.then((ok) => { if (ok) api.restoreBroadcast(b.id).then(() => unhide(b.id), (e) => toast.error('Couldn’t bring the message back', errorMessage(e))) })
    })
  }

  const focusComposer = () => { const el = document.getElementById('bc-title'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus() }
  const duplicate = (b: Broadcast) => {
    setDraft({ title: b.title, body: b.body, image: b.imageUrl, audience: b.audience === 'all' ? 'all' : 'event', eventId: b.audience === 'all' ? draft.eventId : b.audience })
    toast.success('Copied into the composer', 'Edit it, then send or schedule.')
    focusComposer()
  }

  return (
    <Page title="Messages to guests" subtitle="A notification on the phones of people who follow your studio.">
      <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <Composer draft={draft} onChange={setDraft} events={eventList} followers={followers} busy={send.isPending} onSend={(at) => send.mutateAsync(at)} />
        <div className="flex justify-center lg:justify-start"><LockScreenPreview studio={studio.data} draft={draft} /></div>
      </div>
      <div className="mt-[22px]">
        {broadcasts.error
          ? <QueryError error={broadcasts.error} retry={() => broadcasts.refetch()} />
          : <SentList items={broadcasts.data?.filter((b) => !hidden.has(b.id))} events={events.data ?? []} loading={broadcasts.isLoading}
              onDuplicate={duplicate} onCancel={(b) => cancel.mutate(b)} onDelete={remove} onWrite={focusComposer} />}
      </div>
    </Page>
  )
}
