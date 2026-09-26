import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@frameline/ui'
import type { Studio } from '@frameline/shared'
import { guest, uid, type EventSession } from '../lib/guest'
import { validPhone } from './Gates'
import { Sheet } from './Sheet'

/**
 * "Want photos like these? Enquire with <studio>" — turns viewers into leads.
 * TODO(api): api.createEnquiry({ name, phone, message, source }) so it lands in the admin Website → Enquiries list.
 */
export function EnquirySheet({ open, onOpenChange, studio, source, shortId, session, dark }: {
  open: boolean; onOpenChange: (v: boolean) => void; studio: Studio; source: string; shortId?: string; session?: EventSession; dark?: boolean
}) {
  const [form, setForm] = useState({ name: session?.registration?.name ?? '', phone: session?.registration?.phone ?? '', message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<'form' | 'sending' | 'sent'>('form')
  useEffect(() => { if (open) { setStage('form'); setErrors({}) } }, [open])

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name.'
    if (!validPhone(form.phone)) errs.phone = 'Enter a 10-digit mobile number so they can call you back.'
    if (form.message.trim().length < 5) errs.message = 'Tell them a little about your event — date, city, kind of shoot.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setStage('sending')
    setTimeout(() => {
      guest.update((s) => ({ ...s, enquiries: [{ id: uid('enq'), shortId, name: form.name.trim(), phone: form.phone.trim(), message: `${form.message.trim()}\n\n(Source: ${source})`, at: new Date().toISOString() }, ...s.enquiries] }))
      setStage('sent')
    }, 700)
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: '' }) }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} dark={dark}
      title={stage === 'sent' ? 'Enquiry sent' : `Enquire with ${studio.name}`}
      description={stage === 'sent' ? undefined : 'They usually reply within a day.'}>
      <div className={dark ? '[--surface:var(--side-2)] [--ink:var(--side-ink)] [--ink-2:var(--side-ink-2)] [--line-2:var(--side-line)] [--sunk:var(--side-2)]' : undefined}>
        {stage === 'sent' ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 size={38} className="text-ok" />
            <p className="max-w-xs text-[13.5px] text-ink-2">Thanks, {form.name.trim().split(/\s+/)[0]}. {studio.name} will call or WhatsApp you on <b className="text-ink">{form.phone.trim()}</b>.</p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <Field label="Your name" htmlFor="enq-name" error={errors.name}><Input id="enq-name" autoComplete="name" value={form.name} onChange={set('name')} className="h-11" /></Field>
            <Field label="Mobile number" htmlFor="enq-phone" error={errors.phone}><Input id="enq-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} className="h-11" /></Field>
            <Field label="What are you planning?" htmlFor="enq-msg" error={errors.message}>
              <Textarea id="enq-msg" rows={3} placeholder="Wedding in Goa on 14 Feb, about 200 guests" value={form.message} onChange={set('message')} />
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={stage === 'sending'} className="w-full justify-center">Send enquiry</Button>
          </form>
        )}
      </div>
    </Sheet>
  )
}
