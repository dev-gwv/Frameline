import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { Card, CardHeader, cn, Field, IconTile, Input } from '@frameline/ui'
import { sectionDomId, type SectionId } from './SectionNav'

/** One settings card, registered with the scroll-spy nav. */
export function SectionCard({ id, title, action, children, className }: { id: SectionId; title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={sectionDomId(id)} className="scroll-mt-16 xl:scroll-mt-6" aria-labelledby={`${sectionDomId(id)}-h`}>
      <Card className={className}>
        <CardHeader title={<span id={`${sectionDomId(id)}-h`}>{title}</span>} action={action} />
        {children}
      </Card>
    </section>
  )
}

/** Icon · title/description · control. Wraps the control below the text on narrow screens. */
export function Row({ icon, title, description, control, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; control?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line py-3 first:border-t-0', className)}>
      <div className="flex min-w-[200px] flex-1 items-center gap-3.5">
        {icon && <IconTile>{icon}</IconTile>}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">{title}</div>
          {description && <div className="text-[12px] text-ink-2">{description}</div>}
        </div>
      </div>
      {control && <div className="ml-auto shrink-0">{control}</div>}
    </div>
  )
}

export function TextLink({ className, ...rest }: HTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn('font-bold text-accent-text hover:underline', className)} {...rest} />
}

/**
 * Text field that saves itself ~0.7 s after typing stops, but only when valid.
 * Shows the validation message inline instead of saving a bad value.
 */
export function AutoField({
  label, value, onSave, validate, format, hint, mono, inputMode, maxLength, className, suffix, id,
}: {
  label: ReactNode; value: string; onSave: (v: string) => void; validate?: (v: string) => string | null
  format?: (v: string) => string; hint?: ReactNode; mono?: boolean; inputMode?: 'text' | 'numeric'
  maxLength?: number; className?: string; suffix?: ReactNode; id: string
}) {
  const [v, setV] = useState(value)
  const focused = useRef(false)
  const save = useRef(onSave)
  save.current = onSave
  useEffect(() => { if (!focused.current) setV(value) }, [value])
  const error = validate?.(v) ?? null
  useEffect(() => {
    if (v === value || error) return
    const t = setTimeout(() => save.current(v), 700)
    return () => clearTimeout(t)
  }, [v, value, error])
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} className={className}>
      <Input
        id={id} value={v} inputMode={inputMode} maxLength={maxLength} suffix={suffix}
        className={cn(mono && 'font-mono tracking-wide')}
        aria-invalid={!!error}
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false }}
        onChange={(e) => setV(format ? format(e.target.value) : e.target.value)}
      />
    </Field>
  )
}
