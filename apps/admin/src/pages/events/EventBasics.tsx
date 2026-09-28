import { CalendarDays, MapPin } from 'lucide-react'
import type { PresetId } from '@frameline/shared'
import { Field, Input, RadioCardGroup } from '@frameline/ui'
import { AUDIENCE } from './lib'

export interface EventBasicsValue { name: string; date: string; city: string; preset: PresetId }
export type EventBasicsErrors = Partial<Record<'name' | 'date' | 'city', string>>

/** The three questions every new event asks (New event modal and setup step 3), so people learn them once. */
export function EventBasics({ value, onChange, errors = {}, idPrefix = 'ne', autoFocus }: {
  value: EventBasicsValue
  onChange: (patch: Partial<EventBasicsValue>) => void
  errors?: EventBasicsErrors
  idPrefix?: string
  autoFocus?: boolean
}) {
  return (
    <>
      <Field label="Event name" htmlFor={`${idPrefix}-name`} error={errors.name}>
        <Input id={`${idPrefix}-name`} autoFocus={autoFocus} placeholder="Anaya’s First Birthday" value={value.name}
          aria-invalid={!!errors.name || undefined} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor={`${idPrefix}-date`} error={errors.date}>
          <Input id={`${idPrefix}-date`} type="date" icon={<CalendarDays size={14} />} value={value.date}
            aria-invalid={!!errors.date || undefined} onChange={(e) => onChange({ date: e.target.value })} />
        </Field>
        <Field label="City" htmlFor={`${idPrefix}-city`} error={errors.city}>
          <Input id={`${idPrefix}-city`} icon={<MapPin size={14} />} placeholder="Bengaluru" value={value.city} autoComplete="address-level2"
            aria-invalid={!!errors.city || undefined} onChange={(e) => onChange({ city: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className="text-[12.5px] font-bold text-ink-2" id={`${idPrefix}-audience`}>Who should see the photos?</span>
        <RadioCardGroup label="Who should see the photos?" value={value.preset} onChange={(preset) => onChange({ preset })}
          options={AUDIENCE.map((a) => ({ value: a.value, title: a.title, description: a.description }))} />
      </div>
    </>
  )
}

export function validateBasics(v: EventBasicsValue): EventBasicsErrors {
  const e: EventBasicsErrors = {}
  if (v.name.trim().length < 3) e.name = 'Give the event a name of at least 3 characters.'
  if (!v.date) e.date = 'Pick the date of the event.'
  if (!v.city.trim()) e.city = 'Add the city so guests recognise the event.'
  return e
}
