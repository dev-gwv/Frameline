import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PhotoEvent, SmartQR } from '@frameline/shared'
import { Button, cn, Field, Input, Modal, RadioCardGroup, Select } from '@frameline/ui'

export interface ScheduledSwitch { eventId: string; at: string }

export const TARGETS: { value: SmartQR['target']; label: string; description: string }[] = [
  { value: 'web', label: 'Web gallery', description: 'Opens in the phone’s browser. Works for everyone.' },
  { value: 'smart', label: 'App if they have it', description: 'The Frameline app on phones that have it, the web gallery everywhere else.' },
  { value: 'app', label: 'App only', description: 'Asks guests to install the app first.' },
]

/** The QR's pending switch, if any ('' means cleared). */
export const scheduleOf = (qr: SmartQR): ScheduledSwitch | undefined =>
  qr.scheduledEventId && qr.scheduledAt ? { eventId: qr.scheduledEventId, at: qr.scheduledAt } : undefined

/** "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const selectable = (events: PhotoEvent[], keep?: string) => events.filter((e) => e.status !== 'archived' || e.id === keep)

export function NewQRModal({ open, onOpenChange, events, onCreate, busy }: {
  open: boolean; onOpenChange: (v: boolean) => void; events: PhotoEvent[]; busy?: boolean
  onCreate: (name: string, eventId: string) => void
}) {
  const [name, setName] = useState('')
  const [eventId, setEventId] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (open) { setName(''); setEventId(selectable(events)[0]?.id ?? ''); setTouched(false) }
  }, [open, events])
  const nameError = touched && !name.trim() ? 'Give it a name you’ll recognise, like “Studio front desk”.' : undefined
  const eventError = touched && !eventId ? 'Create an event first; the QR code needs one to open.' : undefined
  const submit = () => { setTouched(true); if (name.trim() && eventId) onCreate(name.trim(), eventId) }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New QR code" description="Print it once. You can point it at a different event any time." width={460}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={submit}>Create QR code</Button>
      </>}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Name" htmlFor="qr-name" error={nameError} hint="Only you see this. Where will it be printed?">
          <Input id="qr-name" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Studio front desk" />
        </Field>
        <Field label="Opens" htmlFor="qr-event" error={eventError}>
          <Select id="qr-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {!selectable(events).length && <option value="">No events yet</option>}
            {selectable(events).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

/** "Change event": which event the code opens now, plus the rare "where it opens" choice under More options. */
export function ChangeEventModal({ qr, events, busy, onOpenChange, onSave }: {
  qr: SmartQR | null; events: PhotoEvent[]; busy?: boolean
  onOpenChange: (v: boolean) => void; onSave: (patch: Partial<SmartQR>) => void
}) {
  const [eventId, setEventId] = useState('')
  const [target, setTarget] = useState<SmartQR['target']>('web')
  const [more, setMore] = useState(false)
  useEffect(() => {
    if (!qr) return
    setEventId(qr.eventId); setTarget(qr.target); setMore(qr.target !== 'web')
  }, [qr])
  const save = () => {
    if (!qr) return
    const patch: Partial<SmartQR> = {}
    if (eventId !== qr.eventId) patch.eventId = eventId
    if (target !== qr.target) patch.target = target
    if (!Object.keys(patch).length) { onOpenChange(false); return }
    onSave(patch)
  }
  const name = events.find((e) => e.id === eventId)?.name
  return (
    <Modal open={!!qr} onOpenChange={onOpenChange} title="Change event" width={480}
      description={qr ? `Printed copies of “${qr.name}” open the event you pick, straight away.` : undefined}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{name && eventId !== qr?.eventId ? `Open ${name}` : 'Save'}</Button>
      </>}>
      <Field label="Opens" htmlFor="qr-change-event">
        <Select id="qr-change-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {qr && !events.some((e) => e.id === qr.eventId) && <option value={qr.eventId}>Deleted event</option>}
          {selectable(events, qr?.eventId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>
      <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}
        className="flex items-center gap-1 self-start py-1 text-[13px] font-bold text-accent-text hover:underline">
        More options: {TARGETS.find((t) => t.value === target)?.label}
        <ChevronDown size={14} className={cn('transition-transform', more && 'rotate-180')} />
      </button>
      {more && (
        <RadioCardGroup label="Where it opens" value={target} onChange={setTarget}
          options={TARGETS.map((t) => ({ value: t.value, title: t.label, description: t.description }))} />
      )}
    </Modal>
  )
}

export function RenameModal({ qr, busy, onOpenChange, onSave }: {
  qr: SmartQR | null; busy?: boolean; onOpenChange: (v: boolean) => void; onSave: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (qr) { setName(qr.name); setTouched(false) } }, [qr])
  const error = touched && !name.trim() ? 'Type a name.' : undefined
  const submit = () => {
    setTouched(true)
    if (!qr || !name.trim()) return
    if (name.trim() === qr.name) { onOpenChange(false); return }
    onSave(name.trim())
  }
  return (
    <Modal open={!!qr} onOpenChange={onOpenChange} title="Rename QR code" width={440}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={submit}>Save name</Button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Name" htmlFor="qr-rename" error={error} hint="Only you see this. Printed copies keep working.">
          <Input id="qr-rename" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

export function ScheduleModal({ qr, events, busy, onOpenChange, onSave, onClear }: {
  qr: SmartQR | null; events: PhotoEvent[]; busy?: boolean
  onOpenChange: (v: boolean) => void; onSave: (s: ScheduledSwitch) => void; onClear: () => void
}) {
  const [eventId, setEventId] = useState('')
  const [at, setAt] = useState('')
  const [error, setError] = useState<string>()
  const current = qr ? scheduleOf(qr) : undefined
  const options = selectable(events).filter((e) => e.id !== qr?.eventId)
  useEffect(() => {
    if (!qr) return
    setEventId(current?.eventId ?? options[0]?.id ?? '')
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0)
    setAt(current ? toLocalInput(new Date(current.at)) : toLocalInput(tomorrow))
    setError(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr?.id, events])

  const save = () => {
    const when = new Date(at)
    if (!at || Number.isNaN(when.getTime())) return setError('Pick a date and time.')
    if (when.getTime() <= Date.now()) return setError('Pick a time in the future. To switch now, use Change event.')
    if (!eventId) return setError('Pick the event it should open next.')
    onSave({ eventId, at: when.toISOString() })
  }

  return (
    <Modal open={!!qr} onOpenChange={onOpenChange} title="Schedule a switch" width={460}
      description={qr ? `“${qr.name}” starts opening the next event at the time you pick.` : undefined}
      footer={<>
        {current && <Button variant="danger" className="mr-auto" disabled={busy} onClick={onClear}>Cancel the switch</Button>}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        <Button variant="primary" loading={busy} onClick={save}>Schedule switch</Button>
      </>}>
      <Field label="Next event" htmlFor="qr-next">
        <Select id="qr-next" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {!options.length && <option value="">No other events</option>}
          {options.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>
      <Field label="Switch on" htmlFor="qr-at" error={error} hint="Your local time. Scans before this still open the current event.">
        <Input id="qr-at" type="datetime-local" value={at} onChange={(e) => { setAt(e.target.value); setError(undefined) }} />
      </Field>
    </Modal>
  )
}
