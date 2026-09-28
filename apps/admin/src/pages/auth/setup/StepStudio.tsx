import { MapPin } from 'lucide-react'
import { cn, Field, Input } from '@frameline/ui'
import { KINDS, type Patch, type SetupDraft } from './draft'

export function StepStudio({ draft, patch, errors }: { draft: SetupDraft; patch: Patch; errors: Partial<Record<'name' | 'city', string>> }) {
  return (
    <>
      <Field label="Studio name" htmlFor="st-name" error={errors.name} hint="Guests see this on every gallery.">
        <Input id="st-name" autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Northlight Studio" autoComplete="organization"
          aria-invalid={!!errors.name || undefined} className="h-[42px]" />
      </Field>
      <Field label="City" htmlFor="st-city" error={errors.city}>
        <Input id="st-city" icon={<MapPin size={14} />} value={draft.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Bengaluru" autoComplete="address-level2"
          aria-invalid={!!errors.city || undefined} className="h-[42px]" />
      </Field>
      <div className="flex flex-col gap-[5px]">
        <span className="text-[12.5px] font-bold text-ink-2" id="kind-label">You are</span>
        <div role="radiogroup" aria-labelledby="kind-label" className="flex flex-wrap gap-2">
          {KINDS.map((k) => {
            const on = draft.kind === k.value
            return (
              <button key={k.value} type="button" role="radio" aria-checked={on} onClick={() => patch({ kind: k.value })}
                className={cn('min-h-[38px] rounded-full border px-3.5 text-[13px] font-bold transition max-sm:min-h-[44px]',
                  on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-2 bg-surface text-ink-2 hover:text-ink')}>
                {k.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
