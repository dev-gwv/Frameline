import { useRef, useState, type ChangeEvent } from 'react'
import { CalendarClock, ImagePlus, Send, Trash2 } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Card, cn, ConfirmDialog, Field, Input, Modal, Segmented, Select, Textarea } from '@frameline/ui'
import { assetAccept, useAssetUpload } from '../wallet/assets'
import { audienceSize, BODY_MAX, eventReach, TITLE_MAX, type Draft } from './draft'

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={cn('font-mono text-[11px]', n > max ? 'text-bad' : n > max * 0.9 ? 'text-warn' : 'text-ink-3')}>{n}/{max}</span>
}

export function Composer({ draft, onChange, events, followers, busy, onSend }: {
  draft: Draft
  onChange: (d: Draft) => void
  events: PhotoEvent[]
  followers: number
  busy?: boolean
  onSend: (scheduledAt?: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [whenError, setWhenError] = useState<string>()
  const [touched, setTouched] = useState(false)
  const patch = (p: Partial<Draft>) => onChange({ ...draft, ...p })

  const imageUp = useAssetUpload('broadcast-image')
  const imageBusy = imageUp.pending
  const size = audienceSize(draft, events, followers)
  const eventName = events.find((e) => e.id === draft.eventId)?.name
  const audienceLabel = draft.audience === 'all' ? `all ${fmt.count(followers)} followers` : `${fmt.count(size)} guests of ${eventName ?? 'the event'}`
  const titleError = touched && !draft.title.trim() ? 'Add a title — it’s the bold line on the notification.' : draft.title.length > TITLE_MAX ? `Keep it under ${TITLE_MAX} characters.` : undefined
  const bodyError = touched && !draft.body.trim() ? 'Add a short message.' : draft.body.length > BODY_MAX ? `Keep it under ${BODY_MAX} characters.` : undefined
  const valid = !!draft.title.trim() && !!draft.body.trim() && draft.title.length <= TITLE_MAX && draft.body.length <= BODY_MAX && (draft.audience === 'all' || !!draft.eventId) && size > 0

  const onImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    // Uploaded with api.uploadAsset('broadcast-image'); its URL goes out as the broadcast's imageUrl.
    void imageUp.upload(f).then((a) => { if (a) patch({ image: a.url }) })
  }

  const trySend = () => { setTouched(true); if (valid) setConfirming(true) }
  const openSchedule = () => {
    setTouched(true)
    if (!valid) return
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0)
    setWhen(toLocalInput(d)); setWhenError(undefined); setScheduleOpen(true)
  }
  const confirmSchedule = () => {
    const t = new Date(when)
    if (!when || Number.isNaN(t.getTime())) return setWhenError('Pick a date and time.')
    if (t.getTime() <= Date.now() + 60_000) return setWhenError('Pick a time at least a minute from now, or use Send now.')
    setScheduleOpen(false)
    onSend(t.toISOString())
  }

  return (
    <Card className="flex flex-col gap-3.5 self-start">
      <Field label={<span className="flex justify-between"><span>Title</span><Counter n={draft.title.length} max={TITLE_MAX} /></span>} htmlFor="bc-title" error={titleError}>
        <Input id="bc-title" value={draft.title} maxLength={TITLE_MAX + 20} onChange={(e) => patch({ title: e.target.value })} placeholder="Diwali mini-sessions are open" />
      </Field>
      <Field label={<span className="flex justify-between"><span>Message</span><Counter n={draft.body.length} max={BODY_MAX} /></span>} htmlFor="bc-body" error={bodyError}>
        <Textarea id="bc-body" rows={4} value={draft.body} maxLength={BODY_MAX + 40} onChange={(e) => patch({ body: e.target.value })} placeholder="20-minute family portraits at our studio, 1–5 Nov. Edited photos in 48 hours." />
      </Field>
      <Field label="Image (optional)">
        <div className="flex flex-wrap items-center gap-2">
          {draft.image ? (
            <>
              <img src={draft.image} alt="Broadcast image" className="h-[60px] w-[90px] rounded-md border border-line object-cover" />
              <Button size="sm" loading={imageBusy} onClick={() => fileRef.current?.click()}>Replace</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => patch({ image: undefined })}>Remove</Button>
            </>
          ) : (
            <Button size="sm" loading={imageBusy} icon={<ImagePlus size={13} />} onClick={() => fileRef.current?.click()}>Add image</Button>
          )}
          <input ref={fileRef} type="file" accept={assetAccept('broadcast-image')} className="hidden" onChange={onImage} />
        </div>
        {imageUp.error && <span className="text-[11.5px] font-semibold text-bad" role="alert">{imageUp.error}</span>}
      </Field>
      <Field label="Send to">
        <Segmented stretch value={draft.audience} onChange={(v) => patch({ audience: v, eventId: draft.eventId || events[0]?.id || '' })}
          options={[{ value: 'all', label: `All followers · ${fmt.count(followers)}` }, { value: 'event', label: 'One event’s guests' }]} />
      </Field>
      {draft.audience === 'event' && (
        <Field htmlFor="bc-event" hint={`${fmt.count(size)} guests have the app for this event.`}>
          <Select id="bc-event" aria-label="Event" value={draft.eventId} onChange={(e) => patch({ eventId: e.target.value })}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {fmt.count(eventReach(e))}</option>)}
          </Select>
        </Field>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button icon={<CalendarClock size={14} />} onClick={openSchedule} disabled={busy}>Schedule</Button>
        <Button variant="primary" icon={<Send size={14} />} onClick={trySend} loading={busy}>Send now</Button>
      </div>

      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Send this broadcast?" confirmLabel={`Send to ${fmt.count(size)}`}
        body={<>“{draft.title.trim()}” goes to {audienceLabel} as a push notification and appears in the app’s Posts tab. You can’t unsend it.</>}
        onConfirm={() => onSend()} />

      <Modal open={scheduleOpen} onOpenChange={setScheduleOpen} title="Schedule broadcast" description={`It will go to ${audienceLabel}.`} width={440}
        footer={<>
          <Button variant="ghost" onClick={() => setScheduleOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={<CalendarClock size={14} />} onClick={confirmSchedule}>Schedule</Button>
        </>}>
        <div className="px-5 py-4 sm:px-6">
          <Field label="Send on" htmlFor="bc-when" error={whenError} hint="Your local time. Evenings (7–9 pm) get the most opens.">
            <Input id="bc-when" type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setWhenError(undefined) }} />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
