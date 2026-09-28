import { useState } from 'react'
import type { EventHost, HostAccess } from '@frameline/shared'
import { Button, Field, Input, Modal, RadioCardGroup } from '@frameline/ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** "riya.kabir@gmail.com" → "Riya Kabir"; a phone number stays as it is. */
const nameFrom = (contact: string) => contact.includes('@')
  ? contact.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || contact
  : contact

/** 'add-host': email or phone + two plain choices. */
export function AddHostModal({ open, onOpenChange, existing, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void; existing: EventHost[]; onAdd: (h: EventHost) => void
}) {
  const [contact, setContact] = useState('')
  const [access, setAccess] = useState<HostAccess>('full')
  const [tried, setTried] = useState(false)
  const v = contact.trim()
  const isEmail = v.includes('@')
  const error = isEmail
    ? !EMAIL_RE.test(v) ? 'Enter a full email address, like riya@gmail.com' : existing.some((h) => h.email.toLowerCase() === v.toLowerCase()) ? 'This person is already a host.' : null
    : v.replace(/\D/g, '').length < 10 ? 'Enter an email address or a 10-digit phone number.' : existing.some((h) => h.phone?.replace(/\D/g, '') === v.replace(/\D/g, '')) ? 'This person is already a host.' : null
  const close = (o: boolean) => { onOpenChange(o); if (!o) { setContact(''); setAccess('full'); setTried(false) } }
  const submit = () => {
    setTried(true)
    if (error) return
    onAdd({ id: `h_${Math.random().toString(36).slice(2, 9)}`, name: nameFrom(v), email: isEmail ? v : '', phone: isEmail ? undefined : v, role: 'host', access, status: 'invited' })
    close(false)
  }
  return (
    <Modal open={open} onOpenChange={close} width={520} title="Add a host"
      description="Hosts help run this event only. They don’t see your other events or money."
      footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant="primary" onClick={submit}>Send invite</Button></>}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Email or phone" htmlFor="host-contact" error={tried && error}>
          <Input id="host-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="riya.kabir@gmail.com" autoFocus autoComplete="off" />
        </Field>
        <div>
          <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">They can</div>
          <RadioCardGroup<HostAccess> label="They can" value={access} onChange={setAccess} options={[
            { value: 'full', title: 'See everything and change settings', description: 'For the couple or the event planner' },
            { value: 'upload', title: 'Only upload photos', description: 'For a second shooter' },
          ]} />
        </div>
      </form>
    </Modal>
  )
}
