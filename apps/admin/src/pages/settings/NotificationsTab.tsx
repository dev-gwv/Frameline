import { useEffect, useState } from 'react'
import { BellRing, CalendarClock, CreditCard, Mail, Plus, X } from 'lucide-react'
import { Button, Card, Chip, Input, Modal, SettingRow, Toggle, useToast } from '@frameline/ui'
import { EMAIL_RE, useLocalState } from '../wallet/lib'

interface Prefs { enquiryEmails: string[]; eventExpiry: boolean; planExpiry: boolean; weekly: boolean }
const DEFAULTS: Prefs = { enquiryEmails: ['meera@northlight.in', 'bookings@northlight.in'], eventExpiry: true, planExpiry: true, weekly: false }

/** Notification preferences. No API yet, so they're kept in localStorage (frameline.notifications). */
export function NotificationsTab() {
  const toast = useToast()
  const [prefs, setPrefs] = useLocalState<Prefs>('frameline.notifications', DEFAULTS)
  const [editing, setEditing] = useState(false)
  const toggle = (k: 'eventExpiry' | 'planExpiry' | 'weekly', label: string) => (v: boolean) => {
    setPrefs((p) => ({ ...p, [k]: v }))
    toast.success(v ? `${label} on` : `${label} off`)
  }
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold">Notifications</h3>
        <span className="text-[12px] text-ink-3">Payment emails are always sent</span>
      </div>
      <SettingRow icon={<Mail size={15} />} title="Enquiries also go to"
        description={prefs.enquiryEmails.length ? prefs.enquiryEmails.join(', ') : 'Only your studio email'}
        control={<Button size="sm" onClick={() => setEditing(true)}>Edit list</Button>} />
      <SettingRow icon={<CalendarClock size={15} />} title="Event expiry reminders" description="Before and after an event expires"
        control={<Toggle label="Event expiry reminders" checked={prefs.eventExpiry} onCheckedChange={toggle('eventExpiry', 'Event expiry reminders')} />} />
      <SettingRow icon={<BellRing size={15} />} title="Plan expiry reminders" description="Before and after your plan renews"
        control={<Toggle label="Plan expiry reminders" checked={prefs.planExpiry} onCheckedChange={toggle('planExpiry', 'Plan expiry reminders')} />} />
      <SettingRow icon={<Mail size={15} />} title="Weekly summary" description="Visits, face searches and sales, every Monday"
        control={<Toggle label="Weekly summary" checked={prefs.weekly} onCheckedChange={toggle('weekly', 'Weekly summary')} />} />
      <SettingRow icon={<CreditCard size={15} />} title="Payment and invoice emails" description="Receipts, payouts and failed payments. Needed for your records, so they can’t be turned off."
        control={<Chip>Always on</Chip>} />
      <EmailListModal open={editing} onOpenChange={setEditing} value={prefs.enquiryEmails}
        onSave={(list) => { setPrefs((p) => ({ ...p, enquiryEmails: list })); toast.success('Saved', list.length ? `Enquiries also go to ${list.length} ${list.length === 1 ? 'address' : 'addresses'}.` : 'Enquiries go to your studio email only.') }} />
    </Card>
  )
}

function EmailListModal({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; value: string[]; onSave: (l: string[]) => void }) {
  const [list, setList] = useState(value)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setList(value); setInput(''); setError('') } }, [open, value])
  const add = () => {
    const parts = input.split(/[,\s;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return
    const bad = parts.filter((p) => !EMAIL_RE.test(p))
    if (bad.length) return setError(`${bad.join(', ')} ${bad.length === 1 ? 'isn’t a valid email' : 'aren’t valid emails'}.`)
    const next = [...new Set([...list, ...parts])]
    if (next.length > 5) return setError('Add up to 5 extra addresses.')
    setList(next); setInput(''); setError('')
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Enquiry recipients" description="Website and gallery enquiries go to your studio email plus these addresses." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => { onSave(list); onOpenChange(false) }}>Save list</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex min-h-9 flex-wrap gap-1.5">
          {list.map((e) => (
            <Chip key={e} tone="accent" className="py-1 pl-2.5 pr-1 text-[12px]">
              {e}
              <button type="button" aria-label={`Remove ${e}`} onClick={() => setList((l) => l.filter((x) => x !== e))} className="rounded-full p-0.5 hover:bg-surface"><X size={12} /></button>
            </Chip>
          ))}
          {!list.length && <span className="text-[12.5px] text-ink-3">No extra recipients.</span>}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
          <Input aria-label="Add email" placeholder="name@studio.in" value={input} onChange={(e) => { setInput(e.target.value); setError('') }} />
          <Button type="submit" icon={<Plus size={14} />}>Add</Button>
        </form>
        {error && <span className="text-[11.5px] font-semibold text-bad">{error}</span>}
      </div>
    </Modal>
  )
}
