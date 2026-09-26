import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BellRing, CalendarClock, CreditCard, Mail, Plus, X } from 'lucide-react'
import type { NotificationPrefs } from '@frameline/shared'
import { Button, Card, Chip, Input, Modal, SettingRow, Skeleton, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useNotificationPrefs } from '../../lib/queries'
import { QueryError } from '../system'
import { EMAIL_RE } from '../wallet/lib'

const KEY = ['team', 'notification-prefs']
type Flag = 'eventExpiry' | 'planExpiry' | 'weeklySummary'

/** Notification preferences, stored on the studio (get/updateNotificationPrefs). */
export function NotificationsTab() {
  const api = useApi()
  const qc = useQueryClient()
  const q = useNotificationPrefs()
  const [editing, setEditing] = useState(false)

  // Toggles flip at once and roll back if the save fails.
  const save = useAction((patch: Partial<NotificationPrefs>) => api.updateNotificationPrefs(patch), {
    success: (_, patch) => {
      if (patch.enquiryEmails) return patch.enquiryEmails.length ? `Enquiries also go to ${patch.enquiryEmails.length} ${patch.enquiryEmails.length === 1 ? 'address' : 'addresses'}` : 'Enquiries go to your studio email only'
      const [k, v] = Object.entries(patch)[0] as [Flag, boolean]
      return `${LABELS[k]} ${v ? 'on' : 'off'}`
    },
    onMutate: (patch) => {
      const prev = qc.getQueryData<NotificationPrefs>(KEY)
      qc.setQueryData<NotificationPrefs>(KEY, (p) => (p ? { ...p, ...patch } : p))
      return prev
    },
    onError: (_e, _v, prev) => { if (prev) qc.setQueryData(KEY, prev) },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })

  if (q.isError) return <QueryError error={q.error} retry={() => q.refetch()} />
  const prefs = q.data
  const toggle = (k: Flag) => prefs && <Toggle label={LABELS[k]} checked={prefs[k]} onCheckedChange={(v) => save.mutate({ [k]: v })} />

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold">Notifications</h3>
        <span className="text-[12px] text-ink-3">Payment emails are always sent</span>
      </div>
      {!prefs ? <Skeleton className="h-64" /> : <>
        <SettingRow icon={<Mail size={15} />} title="Enquiries also go to"
          description={prefs.enquiryEmails.length ? prefs.enquiryEmails.join(', ') : 'Only your studio email'}
          control={<Button size="sm" onClick={() => setEditing(true)}>Edit list</Button>} />
        <SettingRow icon={<CalendarClock size={15} />} title={LABELS.eventExpiry} description="Before and after an event expires" control={toggle('eventExpiry')} />
        <SettingRow icon={<BellRing size={15} />} title={LABELS.planExpiry} description="Before and after your plan renews" control={toggle('planExpiry')} />
        <SettingRow icon={<Mail size={15} />} title={LABELS.weeklySummary} description="Visits, face searches and sales, every Monday" control={toggle('weeklySummary')} />
        <SettingRow icon={<CreditCard size={15} />} title="Payment and invoice emails" description="Receipts, payouts and failed payments. Needed for your records, so they can’t be turned off."
          control={<Chip>Always on</Chip>} />
        <EmailListModal open={editing} onOpenChange={setEditing} value={prefs.enquiryEmails} saving={save.isPending}
          onSave={(list) => save.mutate({ enquiryEmails: list }, { onSuccess: () => setEditing(false) })} />
      </>}
    </Card>
  )
}

const LABELS: Record<Flag, string> = { eventExpiry: 'Event expiry reminders', planExpiry: 'Plan expiry reminders', weeklySummary: 'Weekly summary' }

function EmailListModal({ open, onOpenChange, value, onSave, saving }: { open: boolean; onOpenChange: (v: boolean) => void; value: string[]; onSave: (l: string[]) => void; saving: boolean }) {
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
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => onSave(list)}>Save list</Button></>}>
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
