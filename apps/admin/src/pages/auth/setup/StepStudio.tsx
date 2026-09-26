import { Building2, Camera, MapPin, Users } from 'lucide-react'
import { Card, cn, Field, Input, Select } from '@frameline/ui'
import { HEARD_OPTIONS, type Patch, type SetupDraft, type StudioKind } from './draft'

const KINDS: { value: StudioKind; label: string; body: string; icon: typeof Camera }[] = [
  { value: 'photographer', label: 'Photographer', body: 'I shoot on my own', icon: Camera },
  { value: 'studio', label: 'Studio', body: 'A small team, one brand', icon: Users },
  { value: 'agency', label: 'Agency', body: 'Many photographers and events', icon: Building2 },
]

export function StepStudio({ draft, patch, errors }: { draft: SetupDraft; patch: Patch; errors: Partial<Record<'name' | 'city', string>> }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-bold text-ink-2" id="kind-label">Who are you?</span>
        <div role="radiogroup" aria-labelledby="kind-label" className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => {
            const on = draft.kind === k.value
            return (
              <button
                key={k.value} type="button" role="radio" aria-checked={on} onClick={() => patch({ kind: k.value })}
                className={cn('flex items-start gap-2.5 rounded-[10px] border p-3 text-left transition',
                  on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-2')}
              >
                <k.icon size={16} className={cn('mt-0.5 shrink-0', on ? 'text-accent-text' : 'text-ink-3')} />
                <span><b className="block text-[13px]">{k.label}</b><span className="text-[12px] text-ink-2">{k.body}</span></span>
              </button>
            )
          })}
        </div>
      </div>
      <Field label="Studio name" htmlFor="st-name" error={errors.name} hint="Guests see this on every gallery.">
        <Input id="st-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Northlight Studio" autoComplete="organization" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City" htmlFor="st-city" error={errors.city}>
          <Input id="st-city" icon={<MapPin size={14} />} value={draft.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Mumbai" autoComplete="address-level2" />
        </Field>
        <Field label="How did you hear about us?" htmlFor="st-heard" hint="Optional">
          <Select id="st-heard" value={draft.heard} onChange={(e) => patch({ heard: e.target.value })}>
            <option value="">Choose one</option>
            {HEARD_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </Field>
      </div>
    </Card>
  )
}
