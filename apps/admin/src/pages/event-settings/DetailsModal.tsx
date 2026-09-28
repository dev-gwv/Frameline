import { useEffect, useState } from 'react'
import type { PhotoEvent } from '@frameline/shared'
import { Button, Field, Input, Modal } from '@frameline/ui'
import { errorMessage } from '../../lib/api'
import { galleryUrl } from '../../lib/url'
import type { SaveEvent } from './useEventSaver'

const ID_RE = /^[A-Z0-9]{7}$/

/** Event details: name, gallery ID and date in a small dialog. */
export function DetailsModal({ open, onOpenChange, event, update }: { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; update: SaveEvent }) {
  const [name, setName] = useState(event.name)
  const [shortId, setShortId] = useState(event.shortId)
  const [date, setDate] = useState(event.date.slice(0, 10))
  const [tried, setTried] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) { setName(event.name); setShortId(event.shortId); setDate(event.date.slice(0, 10)); setTried(false); setServerError(null) }
    // Reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const errors = {
    name: name.trim().length < 3 ? 'Use at least 3 characters so guests recognise it.' : null,
    shortId: !ID_RE.test(shortId) ? 'Use exactly 7 letters or numbers.' : null,
    date: !date ? 'Pick the event date.' : null,
  }
  const save = async () => {
    setTried(true)
    if (errors.name || errors.shortId || errors.date) return
    const patch = {
      ...(name.trim() !== event.name ? { name: name.trim() } : {}),
      ...(shortId !== event.shortId ? { shortId } : {}),
      ...(date !== event.date.slice(0, 10) ? { date: new Date(date).toISOString() } : {}),
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
        <Field label="Event ID" htmlFor="ev-id" error={(tried && errors.shortId) || serverError}
          hint={`Gallery link: ${galleryUrl(shortId || event.shortId).replace(/^https?:\/\//, '')}. Changing it stops old links and QR codes working.`}>
          <Input id="ev-id" value={shortId} maxLength={7} className="tracking-wide" onChange={(e) => { setShortId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setServerError(null) }} />
        </Field>
        <Field label="Event date" htmlFor="ev-date" error={tried && errors.date}>
          <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
