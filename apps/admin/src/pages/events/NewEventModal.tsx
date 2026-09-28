import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Info, Mail, Phone } from 'lucide-react'
import { DEMO_NOW, EVENT_TYPES, fmt, type EventType } from '@frameline/shared'
import { Button, Field, Input, Modal, Select, cn } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useUsage } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { EventBasics, validateBasics, type EventBasicsValue } from './EventBasics'
import { EMAIL_RE, guessType, PHONE_RE, toDateInput } from './lib'

interface Form extends EventBasicsValue { type: EventType; typeTouched: boolean; hostEmail: string; hostPhone: string; guestLimit: string }
const initial = (): Form => ({
  name: '', date: toDateInput(DEMO_NOW + 7 * 86_400_000), city: '', preset: 'private-family',
  type: 'other', typeTouched: false, hostEmail: '', hostPhone: '', guestLimit: '300',
})

function validate(f: Form) {
  const e: Partial<Record<'name' | 'date' | 'city' | 'hostEmail' | 'hostPhone' | 'guestLimit', string>> = validateBasics(f)
  if (f.hostEmail.trim() && !EMAIL_RE.test(f.hostEmail.trim())) e.hostEmail = 'This email looks incomplete. Check it, or leave it empty.'
  if (f.hostPhone.trim() && !PHONE_RE.test(f.hostPhone.trim())) e.hostPhone = 'Use digits only, with an optional + country code.'
  const n = Number(f.guestLimit)
  if (f.guestLimit === '' || !Number.isInteger(n) || n < 0 || n > 5000) e.guestLimit = 'Enter a number from 0 to 5,000.'
  return e
}

/**
 * New event (a modal, never a drawer). Opens on any page with `?new=1` (/events?new=1 from search,
 * Home's New event button). Creates the event and goes straight to it.
 */
export function NewEventModal() {
  const api = useApi()
  const navigate = useNavigate()
  const [params, setParams] = useParamState()
  const open = params.get('new') === '1'
  const usage = useUsage().data
  const [f, setF] = useState<Form>(initial)
  const [touched, setTouched] = useState(false)
  const [more, setMore] = useState(false)
  useEffect(() => { if (open) { setF(initial()); setTouched(false); setMore(false) } }, [open])

  const close = () => setParams({ new: undefined })
  const errors = validate(f)
  const show = <K extends keyof typeof errors>(k: K) => (touched ? errors[k] : undefined)
  const patch = (p: Partial<Form>) => setF((s) => ({ ...s, ...p }))

  const create = useAction(() => api.createEvent({
    name: f.name.trim(), date: f.date, city: f.city.trim(), type: f.typeTouched ? f.type : guessType(f.name, f.preset), preset: f.preset,
    host: f.hostEmail.trim() ? { email: f.hostEmail.trim(), phone: f.hostPhone.trim() || undefined } : undefined,
    guestUploadLimit: Number(f.guestLimit),
  }), {
    success: (ev) => `${ev.name} created`,
    onSuccess: (ev) => navigate(`/events/${ev.id}`),
  })

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    setTouched(true)
    const errs = validate(f)
    if (errs.hostEmail || errs.hostPhone || errs.guestLimit) setMore(true)
    if (Object.keys(errs).length === 0) create.mutate(undefined)
  }

  const left = usage ? Math.max(0, usage.photosLimit - usage.photosUsed - usage.guestReserved) : null
  const moreError = !!(show('hostEmail') || show('hostPhone') || show('guestLimit'))

  return (
    <Modal open={open} onOpenChange={(v) => !v && close()} title="New event" description="You can change everything later." width={520}
      footer={<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" type="submit" form="new-event" loading={create.isPending}>Create event</Button>
      </>}>
      <form id="new-event" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <EventBasics value={f} onChange={patch} autoFocus errors={{ name: show('name'), date: show('date'), city: show('city') }} />

        <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}
          className={cn('flex w-fit items-center gap-1 text-left text-[13px] font-bold hover:underline', moreError ? 'text-bad' : 'text-accent-text')}>
          More options: event type, client’s contact, guest uploads
          <ChevronDown size={14} className={cn('shrink-0 transition', more && 'rotate-180')} aria-hidden />
        </button>
        {more && (
          <div className="flex flex-col gap-3.5 rounded-[10px] bg-sunk p-3.5">
            <Field label="Event type" htmlFor="ne-type">
              <Select id="ne-type" value={f.typeTouched ? f.type : guessType(f.name, f.preset)} onChange={(e) => patch({ type: e.target.value as EventType, typeTouched: true })}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Client’s contact (optional)" error={show('hostEmail') ?? show('hostPhone')}
              hint="They can see every photo and approve guest uploads.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input className="flex-1" type="email" aria-label="Client’s email" icon={<Mail size={13} />} placeholder="priya.rao@gmail.com" value={f.hostEmail} onChange={(e) => patch({ hostEmail: e.target.value })} />
                <Input className="sm:w-[170px]" type="tel" aria-label="Client’s mobile" icon={<Phone size={13} />} placeholder="+91 99870 22113" value={f.hostPhone} onChange={(e) => patch({ hostPhone: e.target.value })} />
              </div>
            </Field>
            <Field label="Guest uploads: up to" htmlFor="ne-limit" error={show('guestLimit')} hint="Photos guests can add. 0 turns guest uploads off.">
              <Input id="ne-limit" type="number" inputMode="numeric" min={0} max={5000} className="w-[160px]" suffix={<span className="text-[12px] text-ink-3">photos</span>}
                value={f.guestLimit} onChange={(e) => patch({ guestLimit: e.target.value })} />
            </Field>
          </div>
        )}

        {left === null ? null : left > 0 ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Info size={13} aria-hidden />Uses your plan: <span className="tnum">{fmt.count(left)}</span> photos left.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-[13px]">
            <span className="min-w-[12rem] flex-1"><b className="text-warn">Your plan is full.</b> <span className="text-ink-2">You can create the event now; add photos to your plan before uploading.</span></span>
            <Button size="sm" onClick={() => navigate('/plan')}>Add photos</Button>
            <Button size="sm" onClick={() => navigate('/plan')}>Upgrade</Button>
          </div>
        )}
      </form>
    </Modal>
  )
}
