import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Phone, Power, Trash2, UserPlus, X } from 'lucide-react'
import type { EventHost } from '@frameline/shared'
import { Avatar, Button, Chip, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Tip, Toggle, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { Row, SectionCard } from './parts'
import type { SectionProps } from './SectionsPrivacy'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function HostsSection({ event, update }: SectionProps) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const remove = (h: EventHost) => {
    const before = event.hosts
    update({ hosts: before.filter((x) => x.id !== h.id) })
    toast.toast({ kind: 'info', title: `${h.name} removed as host`, action: { label: 'Undo', onClick: () => update({ hosts: before }) } })
  }
  return (
    <SectionCard id="hosts" title="Hosts" action={<Button size="sm" icon={<UserPlus size={12} />} onClick={() => setAdding(true)}>Add host</Button>}>
      <p className="-mt-1 mb-1 text-[12px] text-ink-2">Hosts see every photo and approve guest uploads. Use this for the couple, the family or the client’s team.</p>
      {event.hosts.length === 0 ? (
        <EmptyState className="py-6" icon={<UserPlus size={20} />} title="No hosts yet" body="Add the client so they can see everything and review guest uploads."
          action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}>Add host</Button>} />
      ) : event.hosts.map((h) => (
        <div key={h.id} className="flex items-center gap-3 border-t border-line py-2.5 first-of-type:border-t-0">
          <Avatar name={h.name} tone={h.role === 'client' ? 'accent' : 'neutral'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold">{h.name}<Chip tone={h.role === 'client' ? 'accent' : 'neutral'}>{h.role === 'client' ? 'Client' : 'Host'}</Chip></div>
            <div className="truncate text-[12px] text-ink-2">{h.email}{h.phone && <> · <span className="font-mono">{h.phone}</span></>}</div>
          </div>
          <Tip label="Remove host">
            <button type="button" aria-label={`Remove ${h.name}`} onClick={() => remove(h)} className="rounded-md p-1.5 text-ink-3 hover:bg-sunk hover:text-bad"><X size={15} /></button>
          </Tip>
        </div>
      ))}
      <AddHostModal open={adding} onOpenChange={setAdding} existing={event.hosts} onAdd={(h) => update({ hosts: [...event.hosts, h] })} />
    </SectionCard>
  )
}

function AddHostModal({ open, onOpenChange, existing, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; existing: EventHost[]; onAdd: (h: EventHost) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<EventHost['role']>('host')
  const [tried, setTried] = useState(false)
  const errors = {
    name: name.trim().length < 2 ? 'Enter the host’s name.' : null,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a full email address, like priya@gmail.com' : existing.some((h) => h.email.toLowerCase() === email.trim().toLowerCase()) ? 'This person is already a host.' : null,
    phone: phone && phone.replace(/\D/g, '').length < 10 ? 'Enter at least 10 digits, or leave it empty.' : null,
  }
  const reset = () => { setName(''); setEmail(''); setPhone(''); setRole('host'); setTried(false) }
  const submit = () => {
    setTried(true)
    if (errors.name || errors.email || errors.phone) return
    onAdd({ id: `h_${Math.random().toString(36).slice(2, 9)}`, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role })
    onOpenChange(false); reset()
  }
  return (
    <Modal
      open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }} width={480} title="Add a host"
      description="They get an email with a link that shows every photo and the guest-upload queue."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" icon={<UserPlus size={14} />} onClick={submit}>Add host</Button></>}
    >
      <form className="flex flex-col gap-3.5 px-5 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Name" htmlFor="host-name" error={tried && errors.name}>
          <Input id="host-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Rao" autoFocus />
        </Field>
        <Field label="Email" htmlFor="host-email" error={tried && errors.email}>
          <Input id="host-email" type="email" icon={<Mail size={14} />} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya.rao@gmail.com" />
        </Field>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Mobile (optional)" htmlFor="host-phone" error={tried && errors.phone}>
            <Input id="host-phone" type="tel" icon={<Phone size={14} />} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 99870 22113" className="font-mono" />
          </Field>
          <Field label="Role" htmlFor="host-role">
            <Select id="host-role" value={role} onChange={(e) => setRole(e.target.value as EventHost['role'])}>
              <option value="client">Client (who booked you)</option>
              <option value="host">Host (family or team)</option>
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}

export function DangerSection({ event, set }: SectionProps) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const del = async () => {
    try {
      await api.deleteEvent(event.id)
      toast.success('Moved to trash', `Restore ${event.name} from Events → Recently deleted within 30 days.`)
      navigate('/events', { replace: true })
    } catch (e) {
      toast.error('Couldn’t delete the event', e instanceof Error ? e.message : 'Try again.')
    }
  }
  return (
    <SectionCard id="danger" title={<span className="text-bad">Danger zone</span>} className="border-bad-soft">
      <Row
        icon={<Power size={15} />} title="Disable this event"
        description={event.settings.disabled ? 'Guests see a “this gallery is paused” message. Turn off to reopen' : 'Pause the gallery without deleting anything'}
        control={<Toggle label="Disable this event" checked={event.settings.disabled} onCheckedChange={(v) => set({ disabled: v })} />}
      />
      <Row
        icon={<Trash2 size={15} />} title="Delete this event" description="Moves it to trash: guests lose access now, and it’s removed for good after 30 days"
        control={<Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => setConfirm(true)}>Move to trash</Button>}
      />
      <ConfirmDialog
        open={confirm} onOpenChange={setConfirm} danger title="Move this event to trash?" confirmLabel="Move to trash" onConfirm={del}
        body={<><b className="text-ink">{event.name}</b> goes to Events → Recently deleted with its photos, albums, guests and share links. Guests lose access right away. Restore it within 30 days; after that it’s deleted for good.</>}
      />
    </SectionCard>
  )
}
