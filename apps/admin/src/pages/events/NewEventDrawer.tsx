import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Mail, Phone } from 'lucide-react'
import { DEMO_NOW, fmt, PLANS, PRESETS, type EventType, type PresetId } from '@frameline/shared'
import { Button, Card, Drawer, Field, Input, Select, cn } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useUsage } from '../../lib/queries'
import { EMAIL_RE, EVENT_TYPES, PHONE_RE, toDateInput } from './lib'

interface Form {
  name: string; date: string; city: string; type: EventType; preset: PresetId
  hostEmail: string; hostPhone: string; guestLimit: string
}
const initial = (): Form => ({
  name: '', date: toDateInput(DEMO_NOW + 7 * 86_400_000), city: '', type: 'wedding', preset: 'private-family',
  hostEmail: '', hostPhone: '', guestLimit: '300',
})

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.name.trim().length < 3) e.name = 'Give the event a name of at least 3 characters.'
  if (!f.date) e.date = 'Pick the date of the event.'
  if (!f.city.trim()) e.city = 'Add the city so guests recognise the event.'
  if (f.hostEmail.trim() && !EMAIL_RE.test(f.hostEmail.trim())) e.hostEmail = 'This email looks incomplete. Check it, or leave it empty.'
  if (f.hostPhone.trim() && !PHONE_RE.test(f.hostPhone.trim())) e.hostPhone = 'Use digits only, with an optional + country code.'
  const n = Number(f.guestLimit)
  if (!Number.isInteger(n) || n < 0 || n > 5000) e.guestLimit = 'Enter a number from 0 to 5,000.'
  return e
}

export function NewEventDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const usage = useUsage().data
  const [f, setF] = useState<Form>(initial)
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (open) { setF(initial()); setTouched(false) } }, [open])

  const errors = validate(f)
  const show = (k: keyof Form) => (touched ? errors[k] : undefined)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))

  const create = useAction(() => api.createEvent({
    name: f.name.trim(), date: f.date, city: f.city.trim(), type: f.type, preset: f.preset,
    host: f.hostEmail.trim() ? { email: f.hostEmail.trim(), phone: f.hostPhone.trim() || undefined } : undefined,
    guestUploadLimit: Number(f.guestLimit),
  }), {
    success: (ev) => `${ev.name} created`,
    onSuccess: (ev) => navigate(`/events/${ev.id}`),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(errors).length === 0) create.mutate(undefined)
  }

  const plan = PLANS.find((p) => p.id === usage?.planId)
  const left = usage ? usage.photosLimit - usage.photosUsed - usage.guestReserved : 0

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()} title="New event"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" type="submit" form="new-event" loading={create.isPending}>Create event</Button>
      </>}>
      <form id="new-event" onSubmit={submit} noValidate className="flex flex-col gap-3.5 pb-2">
        <Field label="Event name" htmlFor="ne-name" error={show('name')}>
          <Input id="ne-name" autoFocus placeholder="Anaya’s First Birthday" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Field label="Date" htmlFor="ne-date" error={show('date')}>
            <Input id="ne-date" type="date" icon={<CalendarDays size={14} />} value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="City" htmlFor="ne-city" error={show('city')}>
            <Input id="ne-city" placeholder="Bengaluru" value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="ne-type">
            <Select id="ne-type" value={f.type} onChange={(e) => set('type', e.target.value as EventType)}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[12px] font-bold text-ink-2">Start from a preset</legend>
          {(Object.keys(PRESETS) as PresetId[]).map((id) => {
            const p = PRESETS[id]
            const on = f.preset === id
            return (
              <label key={id} className={cn('flex cursor-pointer gap-2.5 rounded-[10px] border px-3 py-2.5 transition', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-sunk')}>
                <input type="radio" name="preset" value={id} checked={on} onChange={() => set('preset', id)} className="sr-only" />
                <span aria-hidden className={cn('mt-0.5 size-4 shrink-0 rounded-full', on ? 'border-[5px] border-accent' : 'border-[1.5px] border-line-2')} />
                <span>
                  <b className="text-[13px]">{p.label}</b>
                  <span className="block text-[12px] text-ink-2">{p.description}</span>
                </span>
              </label>
            )
          })}
          <span className="text-[11.5px] text-ink-3">Every setting stays editable later in Event settings.</span>
        </fieldset>

        <Field label="Client host (optional)" hint={!touched || (!errors.hostEmail && !errors.hostPhone) ? 'Hosts can view everything and approve guest uploads.' : undefined}
          error={show('hostEmail') ?? show('hostPhone')}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input className="flex-1" type="email" aria-label="Host email" icon={<Mail size={13} />} placeholder="priya.rao@gmail.com" value={f.hostEmail} onChange={(e) => set('hostEmail', e.target.value)} />
            <Input className="sm:w-[160px]" type="tel" aria-label="Host mobile" icon={<Phone size={13} />} placeholder="+91 99870 22113" value={f.hostPhone} onChange={(e) => set('hostPhone', e.target.value)} />
          </div>
        </Field>

        <Field error={show('guestLimit')}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ne-limit" className="text-[13px]">Guest uploads · up to</label>
            <Input id="ne-limit" type="number" min={0} max={5000} className="w-[130px]" suffix={<span className="text-[12px] text-ink-3">photos</span>}
              value={f.guestLimit} onChange={(e) => set('guestLimit', e.target.value)} />
          </div>
        </Field>

        <Card className="border-0 bg-sunk py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span>Uses your {plan?.name ?? ''} plan</span>
            <span className="font-mono tnum">{usage ? `${fmt.count(Math.max(0, left))} photos left` : '…'}</span>
          </div>
          {usage && left <= 0 && <p className="mt-1 text-[12px] text-warn">Your plan is full. Create the event now and add photos after you renew or buy a pack in Plan & usage.</p>}
        </Card>
      </form>
    </Drawer>
  )
}
