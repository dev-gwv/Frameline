import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { PhotoEvent } from '@frameline/shared'
import { Button, Field, Input, Modal } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { shortIdError, toDateInput } from './lib'

/** Rename, change the event ID, or move the date. */
export function EditEventModal({ event, events, onClose }: { event: PhotoEvent | null; events: PhotoEvent[]; onClose: () => void }) {
  const api = useApi()
  const [name, setName] = useState('')
  const [shortId, setShortId] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => {
    if (event) { setName(event.name); setShortId(event.shortId); setDate(toDateInput(event.date)) }
  }, [event])

  const nameErr = name.trim().length < 3 ? 'Use at least 3 characters.' : null
  const idErr = event ? shortIdError(shortId, events, event.id) : null
  const dateErr = date ? null : 'Pick a date.'
  const idChanged = !!event && shortId.trim().toUpperCase() !== event.shortId

  const save = useAction(() => api.updateEvent(event!.id, { name: name.trim(), shortId: shortId.trim().toUpperCase(), date: new Date(date).toISOString() }), {
    success: 'Event updated',
    onSuccess: onClose,
  })

  return (
    <Modal open={!!event} onOpenChange={(v) => !v && onClose()} title="Rename or change date" width={460}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!!(nameErr || idErr || dateErr)} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save changes</Button>
      </>}>
      <div className="flex flex-col gap-3.5 px-5 py-4 sm:px-6">
        <Field label="Event name" htmlFor="ee-name" error={nameErr}>
          <Input id="ee-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Event ID" htmlFor="ee-id" error={idErr}
          hint={idChanged ? 'The old gallery link and QR codes stop working after you save. Share the new link.' : 'Part of the gallery link guests open.'}>
          <Input id="ee-id" className="font-mono uppercase" maxLength={7} value={shortId} onChange={(e) => setShortId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </Field>
        <Field label="Date" htmlFor="ee-date" error={dateErr}>
          <Input id="ee-date" type="date" icon={<CalendarDays size={14} />} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
