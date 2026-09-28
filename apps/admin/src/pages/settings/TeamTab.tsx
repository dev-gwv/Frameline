import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, LogOut, MoreHorizontal, Plus, Trash2, UserCog } from 'lucide-react'
import { ApiError, fmt, PLANS, type ID, type PhotoEvent, type TeamMember } from '@frameline/shared'
import { Avatar, Button, Card, Chip, cn, ConfirmDialog, EmptyState, Field, Input, Menu, Modal, RadioCardGroup, Skeleton, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction, useEvents, useTeam, useUsage } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { QueryError } from '../system'
import { EMAIL_RE } from '../wallet/lib'
import { SectionTitle } from './SideList'

type Role = TeamMember['role']
const ROLE: Record<Role, { label: string; can: string }> = {
  owner: { label: 'Owner', can: 'Everything, including money, plan and team' },
  editor: { label: 'Editor', can: 'Manage all events and guests. No money or plan.' },
  uploader: { label: 'Uploader', can: 'Only upload to the events you choose' },
}
const article = (r: Role) => (r === 'owner' ? 'an Owner' : r === 'editor' ? 'an Editor' : 'an Uploader')
/** 409 last_owner → a sentence that says how to fix it. */
function explain(err: unknown): never {
  if (err instanceof ApiError && err.code === 'last_owner') throw new Error('Your studio needs at least one owner. Make another member an Owner first.')
  throw err
}

/** Removals wait for the Undo toast to time out before they reach the API (kept outside React so leaving the page doesn't cancel them). */
const pendingRemovals = new Map<ID, ReturnType<typeof setTimeout>>()
const UNDO_MS = 6000

export function TeamTab() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const team = useTeam()
  const usage = useUsage()
  const events = useEvents()
  const [params, set] = useParamState()
  const [hidden, setHidden] = useState<ID[]>([])
  const [picking, setPicking] = useState<TeamMember | null>(null)
  const [leaving, setLeaving] = useState<TeamMember | null>(null)

  const plan = PLANS.find((p) => p.id === usage.data?.planId)
  const all = team.data ?? []
  const members = all.filter((m) => !hidden.includes(m.id))
  const seats = plan?.seats ?? 0
  const full = !!plan && !!team.data && members.length >= seats
  const inviteOpen = params.get('invite') === '1'
  const eventName = (id: ID) => events.data?.find((e) => e.id === id)?.name

  const update = useAction((v: { m: TeamMember; role?: Role; eventIds?: ID[] }) => api.updateMember(v.m.id, { role: v.role, eventIds: v.eventIds }).catch(explain), {
    success: (m, v) => (v.role ? `${m.name} is now ${article(v.role)}` : `${m.name} can upload to ${m.eventIds?.length ?? 0} ${m.eventIds?.length === 1 ? 'event' : 'events'}`),
    error: 'Not changed',
  })
  const leave = useAction((m: TeamMember) => api.removeMember(m.id).catch(explain), { error: 'You’re still on the team', onSuccess: async () => { await signOut(); navigate('/login', { replace: true }) } })

  const remove = (m: TeamMember) => {
    setHidden((h) => [...h, m.id])
    const t = setTimeout(async () => {
      pendingRemovals.delete(m.id)
      try { await api.removeMember(m.id) } catch (err) {
        setHidden((h) => h.filter((x) => x !== m.id))
        toast.error(`${m.name} wasn’t removed`, err instanceof ApiError && err.code === 'last_owner' ? 'Your studio needs at least one owner. Make someone else an Owner first.' : errorMessage(err))
      }
    }, UNDO_MS)
    pendingRemovals.set(m.id, t)
    toast.undo(`${m.name} removed from the team`, () => {
      clearTimeout(pendingRemovals.get(m.id)); pendingRemovals.delete(m.id)
      setHidden((h) => h.filter((x) => x !== m.id))
    }, 'They lose access right away. Their photos stay in your events.')
  }

  return (
    <div>
      <SectionTitle
        title={<>Team {plan && team.data && <span className="ml-1 text-[14px] font-semibold text-ink-3">{fmt.count(members.length)} of {seats} seats</span>}</>}
        description="People who help you shoot and deliver."
        action={full
          ? <Button onClick={() => navigate('/plan')}>All {seats} seats used · Upgrade</Button>
          : <Button variant="primary" icon={<Plus size={15} />} disabled={!plan} onClick={() => set({ invite: '1' })}>Invite someone</Button>} />
      <Card padded={false} className="overflow-hidden">
        {team.isError ? <QueryError error={team.error} retry={() => team.refetch()} what="your team" /> : team.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !members.length ? (
          <EmptyState title="Just you so far" body="Invite a second shooter or an editor." />
        ) : (
          <ul>
            {members.map((m) => {
              const you = !!user && m.email.toLowerCase() === user.email.toLowerCase()
              const assigned = (m.eventIds ?? []).map(eventName).filter(Boolean)
              return (
                <li key={m.id} className={cn('flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0', update.isPending && update.variables?.m.id === m.id && 'opacity-60')}>
                  <Avatar name={m.name} tone={m.role === 'owner' ? 'dark' : 'accent'} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate">{m.name}{you && <span className="font-medium text-ink-3"> (you)</span>}</b>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {ROLE[m.role].label} · {m.role === 'uploader' ? (assigned.length ? assigned.join(', ') : 'No events yet') : m.email}
                    </span>
                  </div>
                  {m.pending || !m.lastActive ? <Chip tone="warn">Invite sent</Chip> : <span className="hidden text-[12.5px] text-ink-3 sm:block">{fmt.ago(m.lastActive)}</span>}
                  <Menu trigger={<Button size="icon" variant="ghost" aria-label={`More for ${m.name}`}><MoreHorizontal size={16} /></Button>}
                    items={[
                      ...(['owner', 'editor', 'uploader'] as Role[]).filter((r) => r !== m.role).map((r) => ({
                        label: `Make ${ROLE[r].label}`, description: ROLE[r].can, icon: <UserCog size={15} />, onSelect: () => update.mutate({ m, role: r }),
                      })),
                      ...(m.role === 'uploader' ? [{ label: 'Choose events', icon: <CalendarCheck size={15} />, onSelect: () => setPicking(m) }] : []),
                      'separator' as const,
                      you
                        ? { label: 'Leave the team', icon: <LogOut size={15} />, danger: true, onSelect: () => setLeaving(m) }
                        : { label: 'Remove from team', icon: <Trash2 size={15} />, danger: true, onSelect: () => remove(m) },
                    ]} />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <InviteModal open={inviteOpen} onOpenChange={(v) => set({ invite: v ? '1' : undefined })} events={events.data ?? []} members={all} full={full} seats={seats} />
      <EventsModal member={picking} events={events.data ?? []} onClose={() => setPicking(null)} onSave={(ids) => picking && update.mutate({ m: picking, eventIds: ids })} />
      <ConfirmDialog open={!!leaving} onOpenChange={(v) => !v && setLeaving(null)} title="Leave this studio?" confirmLabel="Leave the team"
        body="You lose access to its events straight away. An owner can invite you again." onConfirm={() => leaving && leave.mutateAsync(leaving)} />
    </div>
  )
}

function EventChecklist({ events, value, onChange }: { events: PhotoEvent[]; value: ID[]; onChange: (ids: ID[]) => void }) {
  const list = events.filter((e) => e.status !== 'archived')
  if (!list.length) return <p className="text-[13px] text-ink-3">No events yet. Create one first.</p>
  return (
    <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto rounded-card border border-line p-1.5 scrollbar-thin">
      {list.map((e) => {
        const on = value.includes(e.id)
        return (
          <label key={e.id} className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-control px-2.5', on ? 'bg-accent-soft' : 'hover:bg-sunk')}>
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== e.id) : [...value, e.id])} />
            <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px]">{e.name}</b><span className="block text-[12px] text-ink-3">{fmt.date(e.date)} · {e.city}</span></span>
          </label>
        )
      })}
    </div>
  )
}

function InviteModal({ open, onOpenChange, events, members, full, seats }: {
  open: boolean; onOpenChange: (v: boolean) => void; events: PhotoEvent[]; members: TeamMember[]; full: boolean; seats: number
}) {
  const api = useApi()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'uploader'>('uploader')
  const [ids, setIds] = useState<ID[]>([])
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setEmail(''); setRole('uploader'); setIds([]); setError('') } }, [open])
  const invite = useAction((v: { email: string; role: Role; eventIds: ID[] }) => api.inviteMember(v.email, v.role, v.role === 'uploader' ? v.eventIds : undefined), {
    errorToast: false,
    success: (_, v) => `Invite sent to ${v.email}`,
    onSuccess: () => onOpenChange(false),
    onError: (err) => setError(errorMessage(err)),
  })
  const submit = () => {
    const e = email.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) return setError('Enter a valid email, like name@studio.in')
    if (members.some((m) => m.email.toLowerCase() === e)) return setError(`${e} is already on your team`)
    setError(''); invite.mutate({ email: e, role, eventIds: ids })
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Invite someone to your studio" width={540}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        {full ? <Button variant="primary" onClick={() => navigate('/plan')}>All {seats} seats used · Upgrade</Button>
          : <Button variant="primary" loading={invite.isPending} disabled={role === 'uploader' && !ids.length} onClick={submit}>Send invite</Button>}</>}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Email" error={error} htmlFor="inv-email">
          <Input id="inv-email" type="email" autoFocus placeholder="name@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} />
        </Field>
      </form>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-bold text-ink-2">What can they do?</span>
        <RadioCardGroup label="Role" value={role} onChange={setRole} options={[
          { value: 'editor', title: 'Editor', description: ROLE.editor.can },
          { value: 'uploader', title: 'Uploader', description: ROLE.uploader.can },
        ]} />
      </div>
      {role === 'uploader' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold text-ink-2">Events they can upload to {ids.length > 0 && <span className="font-semibold text-ink-3">· {ids.length} chosen</span>}</span>
          <EventChecklist events={events} value={ids} onChange={setIds} />
        </div>
      )}
    </Modal>
  )
}

function EventsModal({ member, events, onClose, onSave }: { member: TeamMember | null; events: PhotoEvent[]; onClose: () => void; onSave: (ids: ID[]) => void }) {
  const [ids, setIds] = useState<ID[]>([])
  useEffect(() => { if (member) setIds(member.eventIds ?? []) }, [member])
  return (
    <Modal open={!!member} onOpenChange={(v) => !v && onClose()} width={480} title={`Events ${member?.name ?? ''} can upload to`} description="Uploaders only see these events."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onSave(ids); onClose() }}>Save {ids.length} {ids.length === 1 ? 'event' : 'events'}</Button></>}>
      <EventChecklist events={events} value={ids} onChange={setIds} />
    </Modal>
  )
}
