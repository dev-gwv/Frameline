import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@frameline/ui'
import type { PublicStudio } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest, useGuest, type EventSession } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { validPhone } from './Gates'
import { Sheet } from './Sheet'

/**
 * "Want photos like these? Enquire with <studio>" — turns viewers into leads. api.createEnquiry sends it to the
 * studio's Enquiries list (from a gallery by short id, or from the studio profile by follow code).
 */
export function EnquirySheet({ open, onOpenChange, studio, source, shortId, session, dark }: {
  open: boolean; onOpenChange: (v: boolean) => void; studio: Pick<PublicStudio, 'name' | 'followCode'>; source: string; shortId?: string; session?: EventSession; dark?: boolean
}) {
  const api = useApi()
  const profile = useGuest((s) => s.profile)
  const [form, setForm] = useState({ name: session?.registration?.name ?? profile?.name ?? '', phone: session?.registration?.phone ?? profile?.phone ?? '', message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sendError, setSendError] = useState<string | null>(null)
  const [stage, setStage] = useState<'form' | 'sending' | 'sent'>('form')
  useEffect(() => { if (open) { setStage('form'); setErrors({}); setSendError(null) } }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name.'
    if (!validPhone(form.phone)) errs.phone = 'Enter a 10-digit mobile number so they can call you back.'
    if (form.message.trim().length < 5) errs.message = 'Tell them a little about your event — date, city, kind of shoot.'
    setErrors(errs); setSendError(null)
    if (Object.keys(errs).length) return
    setStage('sending')
    const input = { name: form.name.trim(), phone: form.phone.trim(), email: session?.registration?.email || profile?.email || '', message: form.message.trim(), source }
    try {
      await api.createEnquiry(shortId ? { shortId } : { studio: studio.followCode }, input)
      guest.setProfile({ name: input.name, phone: input.phone })
      setStage('sent')
    } catch (err) {
      const f = friendlyError(err, 'Your enquiry wasn’t sent')
      setSendError(`${f.title}. ${f.body}`)
      setStage('form')
    }
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
            {sendError && <p role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">{sendError}</p>}
            <Button type="submit" variant="primary" size="lg" loading={stage === 'sending'} className="w-full justify-center">Send enquiry</Button>
          </form>
        )}
      </div>
    </Sheet>
  )
}
