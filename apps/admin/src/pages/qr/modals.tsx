import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type { PhotoEvent, SmartQR } from '@frameline/shared'
import { Button, Field, Input, Modal, Select } from '@frameline/ui'

export interface ScheduledSwitch { eventId: string; at: string }

/** "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const selectable = (events: PhotoEvent[]) => events.filter((e) => e.status !== 'archived')

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
  const submit = () => { setTouched(true); if (name.trim() && eventId) onCreate(name.trim(), eventId) }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New QR" description="Print it once. You can point it at a different event any time." width={460}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={submit}>Create QR</Button>
      </>}>
      <form className="flex flex-col gap-3.5 px-5 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Name" htmlFor="qr-name" error={nameError} hint="Only you see this. Where will it be printed?">
          <Input id="qr-name" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} placeholder="Studio front desk" />
        </Field>
        <Field label="Opens" htmlFor="qr-event">
          <Select id="qr-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {selectable(events).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

export function ScheduleModal({ qr, events, current, onOpenChange, onSave, onClear }: {
  qr: SmartQR | null; events: PhotoEvent[]; current?: ScheduledSwitch
  onOpenChange: (v: boolean) => void; onSave: (s: ScheduledSwitch) => void; onClear: () => void
}) {
  const [eventId, setEventId] = useState('')
  const [at, setAt] = useState('')
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!qr) return
    const options = selectable(events).filter((e) => e.id !== qr.eventId)
    setEventId(current?.eventId ?? options[0]?.id ?? '')
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0)
    setAt(current ? toLocalInput(new Date(current.at)) : toLocalInput(tomorrow))
    setError(undefined)
  }, [qr, current, events])

  const save = () => {
    const when = new Date(at)
    if (!at || Number.isNaN(when.getTime())) return setError('Pick a date and time.')
    if (when.getTime() <= Date.now()) return setError('Pick a time in the future. To switch now, use “Currently opens”.')
    if (!eventId) return setError('Pick the event it should open next.')
    onSave({ eventId, at: when.toISOString() })
  }

  return (
    <Modal open={!!qr} onOpenChange={onOpenChange} title="Schedule switch" description={qr ? `“${qr.name}” will start opening the next event at the time you pick.` : undefined} width={460}
      footer={<>
        {current && <Button variant="danger" className="mr-auto" onClick={onClear}>Cancel schedule</Button>}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        <Button variant="primary" icon={<CalendarClock size={14} />} onClick={save}>Schedule</Button>
      </>}>
      <div className="flex flex-col gap-3.5 px-5 py-4 sm:px-6">
        <Field label="Next event" htmlFor="qr-next">
          <Select id="qr-next" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {selectable(events).filter((e) => e.id !== qr?.eventId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Switch on" htmlFor="qr-at" error={error} hint="Your local time. Scans before this still open the current event.">
          <Input id="qr-at" type="datetime-local" value={at} onChange={(e) => { setAt(e.target.value); setError(undefined) }} />
        </Field>
      </div>
    </Modal>
  )
}
