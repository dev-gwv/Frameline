import { useRef, useState, type ChangeEvent } from 'react'
import { CalendarClock, ImagePlus, Send, Trash2 } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Card, cn, ConfirmDialog, Field, Input, Modal, RadioCardGroup, Select, Textarea } from '@frameline/ui'
import { assetAccept, useAssetUpload } from '../watermarks/assetUpload'
import { audienceSize, BODY_MAX, draftEvent, eventReach, TITLE_MAX, type Draft } from './draft'

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={cn('text-[12px] font-semibold tnum', n > max ? 'text-bad' : n > max * 0.9 ? 'text-warn' : 'text-ink-3')}>{n} of {max}</span>
}

const people = (n: number) => `${fmt.count(n)} ${n === 1 ? 'person' : 'people'}`

export function Composer({ draft, onChange, events, followers, busy, onSend }: {
  draft: Draft
  onChange: (d: Draft) => void
  events: PhotoEvent[]
  followers: number
  busy?: boolean
  /** Resolves when sent/scheduled; rejects on error (the dialog stays open). */
  onSend: (scheduledAt?: string) => Promise<unknown>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [whenError, setWhenError] = useState<string>()
  const [scheduling, setScheduling] = useState(false)
  const [touched, setTouched] = useState(false)
  const patch = (p: Partial<Draft>) => onChange({ ...draft, ...p })

  const imageUp = useAssetUpload('broadcast-image')
  const audience = events.length ? draft.audience : 'all'
  const event = draftEvent(draft, events)
  const size = audienceSize({ ...draft, audience }, events, followers)
  const audienceLabel = audience === 'all' ? `everyone who follows you (${people(followers)})` : `guests of ${event?.name ?? 'the event'} (${people(size)})`
  const titleError = touched && !draft.title.trim() ? 'Add a title. It’s the bold line on the notification.' : draft.title.length > TITLE_MAX ? `Keep it under ${TITLE_MAX} characters.` : undefined
  const bodyError = touched && !draft.body.trim() ? 'Add a short message.' : draft.body.length > BODY_MAX ? `Keep it under ${BODY_MAX} characters.` : undefined
  const valid = !!draft.title.trim() && !!draft.body.trim() && draft.title.length <= TITLE_MAX && draft.body.length <= BODY_MAX && size > 0

  const onImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    // Uploaded with api.uploadAsset('broadcast-image'); its URL goes out as the message's imageUrl.
    void imageUp.upload(f).then((a) => { if (a) patch({ image: a.url }) })
  }

  const trySend = () => { setTouched(true); if (valid) setConfirming(true) }
  const openSchedule = () => {
    setTouched(true)
    if (!valid) return
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(19, 0, 0, 0)
    setWhen(toLocalInput(d)); setWhenError(undefined); setScheduleOpen(true)
  }
  const confirmSchedule = async () => {
    const t = new Date(when)
    if (!when || Number.isNaN(t.getTime())) return setWhenError('Pick a date and time.')
    if (t.getTime() <= Date.now() + 60_000) return setWhenError('Pick a time at least a minute from now, or send it now instead.')
    setScheduling(true)
    try { await onSend(t.toISOString()); setScheduleOpen(false); setTouched(false) } catch { /* toast shows the error */ } finally { setScheduling(false) }
  }

  return (
    <Card className="flex min-w-0 flex-col gap-3.5 self-start">
      <Field label={<span className="flex justify-between gap-2"><span>Title</span><Counter n={draft.title.length} max={TITLE_MAX} /></span>} htmlFor="bc-title" error={titleError}>
        <Input id="bc-title" value={draft.title} maxLength={TITLE_MAX + 20} onChange={(e) => patch({ title: e.target.value })} placeholder="Your wedding film is here!" />
      </Field>
      <Field label={<span className="flex justify-between gap-2"><span>Message</span><Counter n={draft.body.length} max={BODY_MAX} /></span>} htmlFor="bc-body" error={bodyError}>
        <Textarea id="bc-body" rows={3} value={draft.body} maxLength={BODY_MAX + 40} onChange={(e) => patch({ body: e.target.value })} placeholder="Riya & Kabir’s highlight film is now in the gallery. Tap to watch." />
      </Field>
      <Field label="Image (optional)">
        <div className="flex flex-wrap items-center gap-2">
          {draft.image ? (
            <>
              <img src={draft.image} alt="Image sent with the message" className="h-[60px] w-[90px] rounded-md border border-line object-cover" />
              <Button size="sm" loading={imageUp.pending} onClick={() => fileRef.current?.click()}>Replace image</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => patch({ image: undefined })}>Remove</Button>
            </>
          ) : (
            <Button size="sm" loading={imageUp.pending} icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>Add an image</Button>
          )}
          <input ref={fileRef} type="file" accept={assetAccept('broadcast-image')} className="hidden" onChange={onImage} />
        </div>
        {imageUp.error && <span className="text-[12px] font-semibold text-bad" role="alert">{imageUp.error}</span>}
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-bold text-ink-2">Send to</span>
        <RadioCardGroup label="Send to" value={audience} onChange={(v) => patch({ audience: v })}
          options={[
            { value: 'event', title: 'Guests of one event', disabled: !events.length,
              description: event ? `${event.name} · ${people(eventReach(event))}` : 'You have no events with guests yet' },
            { value: 'all', title: 'Everyone who follows you', description: people(followers) },
          ]} />
        {audience === 'event' && events.length > 1 && (
          <Field htmlFor="bc-event" label="Which event?">
            <Select id="bc-event" value={event?.id ?? ''} onChange={(e) => patch({ eventId: e.target.value })}>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {people(eventReach(e))}</option>)}
            </Select>
          </Field>
        )}
        {size === 0 && <span className="text-[12px] text-ink-3">Nobody can get this yet. Guests appear here once they open the event in the Frameline app.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        <Button variant="ghost" icon={<CalendarClock size={15} />} onClick={openSchedule} disabled={busy}>Schedule</Button>
        <Button variant="primary" className="ml-auto max-sm:h-[46px] max-sm:w-full" icon={<Send size={15} />} onClick={trySend} loading={busy && !scheduleOpen}>
          Send to {people(size)}
        </Button>
      </div>

      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={`Send to ${people(size)} now?`} confirmLabel="Send now"
        body={<>“{draft.title.trim()}” goes to {audienceLabel} as a notification and appears in the app’s Posts tab. You can’t unsend it.</>}
        onConfirm={() => onSend().then(() => setTouched(false))} />

      <Modal open={scheduleOpen} onOpenChange={(v) => !scheduling && setScheduleOpen(v)} title="Schedule this message" description={`It will go to ${audienceLabel}.`} width={440}
        footer={<>
          <Button variant="ghost" onClick={() => setScheduleOpen(false)} disabled={scheduling}>Cancel</Button>
          <Button variant="primary" icon={<CalendarClock size={15} />} loading={scheduling} onClick={confirmSchedule}>
            {when && !Number.isNaN(new Date(when).getTime()) ? `Schedule for ${fmt.dateTime(new Date(when).toISOString())}` : 'Schedule'}
          </Button>
        </>}>
        <Field label="Send on" htmlFor="bc-when" error={whenError} hint="Your local time. Evenings (7–9 pm) get the most opens.">
          <Input id="bc-when" type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setWhenError(undefined) }} />
        </Field>
      </Modal>
    </Card>
  )
}
