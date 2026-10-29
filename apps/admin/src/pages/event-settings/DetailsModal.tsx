import { useEffect, useState } from 'react'
import { EVENT_TYPES, type EventType, type PhotoEvent } from '@frameline/shared'
import { Button, Field, Input, Modal, Select } from '@frameline/ui'
import { errorMessage } from '../../lib/api'
import { galleryUrl } from '../../lib/url'
import type { SaveEvent } from './useEventSaver'

const ID_RE = /^[A-Z0-9]{7}$/

/** Event details: name, gallery ID, dates, city and type in a small dialog. */
export function DetailsModal({ open, onOpenChange, event, update }: { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; update: SaveEvent }) {
  const [name, setName] = useState(event.name)
  const [shortId, setShortId] = useState(event.shortId)
  const [date, setDate] = useState(event.date.slice(0, 10))
  const [endDate, setEndDate] = useState(event.endDate?.slice(0, 10) ?? '')
  const [city, setCity] = useState(event.city)
  const [type, setType] = useState<EventType>(event.type)
  const [tried, setTried] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setName(event.name); setShortId(event.shortId); setDate(event.date.slice(0, 10)); setEndDate(event.endDate?.slice(0, 10) ?? '')
      setCity(event.city); setType(event.type); setTried(false); setServerError(null)
    }
    // Reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const errors = {
    name: name.trim().length < 3 ? 'Use at least 3 characters so guests recognise it.' : null,
    shortId: !ID_RE.test(shortId) ? 'Use exactly 7 letters or numbers.' : null,
    date: !date ? 'Pick the event date.' : null,
    endDate: endDate && date && endDate < date ? 'The last day can’t be before the first.' : null,
  }
  const save = async () => {
    setTried(true)
    if (errors.name || errors.shortId || errors.date || errors.endDate) return
    const lastDay = endDate === date ? '' : endDate
    const patch = {
      ...(name.trim() !== event.name ? { name: name.trim() } : {}),
      ...(shortId !== event.shortId ? { shortId } : {}),
      ...(date !== event.date.slice(0, 10) ? { date: new Date(date).toISOString() } : {}),
      ...(lastDay !== (event.endDate?.slice(0, 10) ?? '') ? { endDate: lastDay ? new Date(lastDay).toISOString() : '' } : {}),
      ...(city.trim() !== event.city ? { city: city.trim() } : {}),
      ...(type !== event.type ? { type } : {}),
    }
    if (!Object.keys(patch).length) { onOpenChange(false); return }
    setBusy(true)
    const err = await update(patch, { quiet: true })
    setBusy(false)
    if (err) setServerError(errorMessage(err))
    else onOpenChange(false)
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} width={480} title="Event details"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="Event name" htmlFor="ev-name" error={tried && errors.name}>
          <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Event date" htmlFor="ev-date" error={tried && errors.date}>
            <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Last day (optional)" htmlFor="ev-end" error={tried && errors.endDate} hint="For weddings over a few days.">
            <Input id="ev-end" type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="City" htmlFor="ev-city">
            <Input id="ev-city" value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Event type" htmlFor="ev-type">
            <Select id="ev-type" value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Event ID" htmlFor="ev-id" error={(tried && errors.shortId) || serverError}
          hint={`Gallery link: ${galleryUrl(shortId || event.shortId).replace(/^https?:\/\//, '')}. Changing it stops old links and QR codes working.`}>
          <Input id="ev-id" value={shortId} maxLength={7} className="tracking-wide" onChange={(e) => { setShortId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setServerError(null) }} />
        </Field>
      </form>
    </Modal>
  )
}
