import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { PhotoEvent } from '@frameline/shared'
import { Button, Field, Input, Modal } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { shortIdApiError, shortIdError, toDateInput } from './lib'

/** Card ⋯ → Rename or change date (the event code is folded under "More options"). */
export function EditEventModal({ event, events, onClose }: { event: PhotoEvent | null; events: PhotoEvent[]; onClose: () => void }) {
  const api = useApi()
  const [name, setName] = useState('')
  const [shortId, setShortId] = useState('')
  const [date, setDate] = useState('')
  const [more, setMore] = useState(false)
  const [idApiErr, setIdApiErr] = useState<string | null>(null)
  useEffect(() => {
    if (event) { setName(event.name); setShortId(event.shortId); setDate(toDateInput(event.date)); setIdApiErr(null); setMore(false) }
  }, [event])

  const nameErr = name.trim().length < 3 ? 'Use at least 3 characters.' : null
  const idErr = (event ? shortIdError(shortId, events, event.id) : null) ?? idApiErr
  const dateErr = date ? null : 'Pick a date.'
  const idChanged = !!event && shortId.trim().toUpperCase() !== event.shortId

  // Only send the event code when it changed; the API checks it's free (409 → shown under the field).
  const save = useAction(() => api.updateEvent(event!.id, {
    name: name.trim(), date: new Date(date).toISOString(), ...(idChanged ? { shortId: shortId.trim().toUpperCase() } : {}),
  }), {
    success: 'Changes saved',
    onSuccess: onClose,
    onError: (err) => { const m = idChanged ? shortIdApiError(err) : null; setIdApiErr(m); if (m) setMore(true) },
  })

  return (
    <Modal open={!!event} onOpenChange={(v) => !v && onClose()} title="Rename or change date" width={460}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!!(nameErr || idErr || dateErr)} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save changes</Button>
      </>}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (!nameErr && !idErr && !dateErr) save.mutate(undefined) }}>
        <Field label="Event name" htmlFor="ee-name" error={nameErr}>
          <Input id="ee-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="ee-date" error={dateErr}>
          <Input id="ee-date" type="date" icon={<CalendarDays size={14} />} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {more ? (
          <Field label="Event code" htmlFor="ee-id" error={idErr}
            hint={idChanged ? 'The old gallery link and QR codes stop working after you save. Share the new link.' : 'Part of the gallery link guests open.'}>
            <Input id="ee-id" className="uppercase tnum" maxLength={7} value={shortId} onChange={(e) => { setShortId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setIdApiErr(null) }} />
          </Field>
        ) : (
          <button type="button" className="w-fit text-[13px] font-bold text-accent-text hover:underline" onClick={() => setMore(true)}>More options: event code</button>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
