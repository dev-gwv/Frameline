import { CalendarDays } from 'lucide-react'
import { PRESETS, type EventType, type PresetId } from '@frameline/shared'
import { Card, cn, Field, Input, Select } from '@frameline/ui'
import { EVENT_TYPE_LABELS, type Patch, type SetupDraft } from './draft'

export function StepEvent({ draft, patch, errors }: { draft: SetupDraft; patch: Patch; errors: Partial<Record<'eventName' | 'eventDate', string>> }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <Field label="Event name" htmlFor="fe-name" error={errors.eventName}>
        <Input id="fe-name" value={draft.eventName} onChange={(e) => patch({ eventName: e.target.value })} placeholder="Riya & Kabir Wedding" autoFocus />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="fe-date" error={errors.eventDate}>
          <Input id="fe-date" type="date" icon={<CalendarDays size={14} />} value={draft.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} />
        </Field>
        <Field label="Type" htmlFor="fe-type">
          <Select id="fe-type" value={draft.eventType} onChange={(e) => patch({ eventType: e.target.value as EventType })}>
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="preset-label" className="text-[12px] font-bold text-ink-2">Start from a preset</span>
        <div role="radiogroup" aria-labelledby="preset-label" className="flex flex-col gap-2">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => {
            const p = PRESETS[id]
            const on = draft.preset === id
            return (
              <button key={id} type="button" role="radio" aria-checked={on} onClick={() => patch({ preset: id })}
                className={cn('flex gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition', on ? 'border-[1.5px] border-accent bg-accent-soft' : 'border border-line bg-surface hover:border-line-2')}>
                <span className={cn('mt-0.5 size-4 shrink-0 rounded-full', on ? 'border-[5px] border-accent' : 'border-[1.5px] border-line-2')} aria-hidden />
                <span><b className="block text-[13px]">{p.label}</b><span className="text-[12px] text-ink-2">{p.description}</span></span>
              </button>
            )
          })}
        </div>
        <span className="text-[11.5px] text-ink-3">Every setting stays editable in the event’s Settings.</span>
      </div>
    </Card>
  )
}
