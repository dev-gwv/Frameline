import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Crown, Mail, MoreHorizontal, Pencil, Trash2, Upload, UserCog } from 'lucide-react'
import { ApiError, fmt, PLANS, type ID, type PhotoEvent, type TeamMember } from '@frameline/shared'
import { Avatar, Button, Card, Chip, cn, ConfirmDialog, EmptyState, Input, Menu, Modal, Select, Skeleton, Tip } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction, useEvents, useTeam, useUsage } from '../../lib/queries'
import { QueryError } from '../system'
import { EMAIL_RE, td, th } from '../wallet/lib'

type Role = TeamMember['role']
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', uploader: 'Uploader' }
const ROLES: { role: Role; icon: ReactNode; body: string }[] = [
  { role: 'owner', icon: <Crown size={15} />, body: 'Everything, including billing, payouts, the store and team. A studio always keeps at least one.' },
  { role: 'editor', icon: <Pencil size={15} />, body: 'Creates and edits events, uploads, shares galleries and answers enquiries. No money settings.' },
  { role: 'uploader', icon: <Upload size={15} />, body: 'For second shooters. Uploads to the events you assign; can’t delete, share or see sales.' },
]
const article = (r: Role) => (r === 'owner' ? 'an Owner' : r === 'editor' ? 'an Editor' : 'an Uploader')

/** 409 last_owner → a sentence that says how to fix it. */
function explain(err: unknown): never {
  if (err instanceof ApiError && err.code === 'last_owner') {
    throw new Error('Your studio needs at least one owner. Make another member an Owner first, then try again.')
  }
  throw err
}

export function TeamTab() {
  const api = useApi()
  const { user } = useAuth()
  const team = useTeam()
  const usage = useUsage()
  const events = useEvents()
  const plan = PLANS.find((p) => p.id === usage.data?.planId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('uploader')
  const [inviteEvents, setInviteEvents] = useState<ID[]>([])
  const [emailError, setEmailError] = useState('')
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [picking, setPicking] = useState<{ member?: TeamMember } | null>(null)

  const members = team.data ?? []
  const seats = plan?.seats ?? Infinity
  const full = members.length >= seats
  const eventName = (id: ID) => events.data?.find((e) => e.id === id)?.name

  const invite = useAction((v: { email: string; role: Role; eventIds: ID[] }) => api.inviteMember(v.email, v.role, v.role === 'uploader' ? v.eventIds : undefined), {
    success: (_, v) => `Invite sent to ${v.email}`,
    onSuccess: () => { setEmail(''); setInviteEvents([]) },
    onError: (err) => { if (err instanceof ApiError && err.code === 'already_member') setEmailError(err.detail) },
  })
  const update = useAction((v: { m: TeamMember; role?: Role; eventIds?: ID[] }) => api.updateMember(v.m.id, { role: v.role, eventIds: v.eventIds }).catch(explain), {
    success: (m, v) => (v.role ? `${m.name} is now ${article(v.role)}` : `${m.name} can upload to ${m.eventIds?.length ?? 0} ${m.eventIds?.length === 1 ? 'event' : 'events'}`),
    error: 'Role not changed',
  })
  const remove = useAction((m: TeamMember) => api.removeMember(m.id).catch(explain), {
    success: (_, m) => `${m.name} removed`,
    error: 'Not removed',
  })

  const submit = () => {
    const e = email.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) return setEmailError('Enter a valid email, like name@studio.in')
    if (members.some((m) => m.email.toLowerCase() === e)) return setEmailError(`${e} is already on your team`)
    if (full) return setEmailError(`All ${seats} seats are used. Remove someone or upgrade your plan.`)
    setEmailError(''); invite.mutate({ email: e, role, eventIds: inviteEvents })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold">Team members</div>
          <div className="text-[12.5px] text-ink-2">
            {plan ? <>{members.length} of {seats} seats used · {plan.name} plan</> : <Skeleton className="inline-block h-3 w-40" />}
            {members.length > seats && <span className="font-bold text-warn"> · {members.length - seats} over your plan</span>}
            {full && <> · <Link to="/plan" className="font-bold text-accent-text hover:underline">Get more seats</Link></>}
          </div>
        </div>
        <form className="flex w-full flex-col gap-1 sm:w-auto" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Email to invite" className="min-w-0 flex-1 sm:w-[250px]" icon={<Mail size={14} />} placeholder="name@email.com" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailError('') }} />
            <Select aria-label="Role" className="w-[120px]" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="editor">Editor</option>
              <option value="uploader">Uploader</option>
              <option value="owner">Owner</option>
            </Select>
            <Button type="submit" variant="primary" loading={invite.isPending}>Invite</Button>
          </div>
          {role === 'uploader' && (
            <button type="button" onClick={() => setPicking({})} className="self-start text-[12px] font-bold text-accent-text hover:underline">
              {inviteEvents.length ? `Can upload to ${inviteEvents.length} ${inviteEvents.length === 1 ? 'event' : 'events'} · change` : 'Choose which events they can upload to'}
            </button>
          )}
          {emailError && <span className="text-[11.5px] font-semibold text-bad">{emailError}</span>}
        </form>
      </div>

      <Card padded={false}>
        {team.isError ? <QueryError error={team.error} retry={() => team.refetch()} /> : team.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !members.length ? (
          <EmptyState icon={<Mail size={22} />} title="Just you so far" body="Invite a second shooter or an editor with the form above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Access</th><th className={th}>Last active</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {members.map((m) => {
                  const you = !!user && m.email.toLowerCase() === user.email.toLowerCase()
                  const assigned = (m.eventIds ?? []).map(eventName).filter(Boolean)
                  return (
                    <tr key={m.id} className={cn(update.isPending && update.variables?.m.id === m.id && 'opacity-60')}>
                      <td className={td}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.name} tone={m.role === 'owner' ? 'dark' : m.role === 'editor' ? 'accent' : 'neutral'} />
                          <div className="min-w-0"><div className="font-bold">{m.name}{you && <span className="font-medium text-ink-3"> (you)</span>}</div><div className="truncate text-[11.5px] text-ink-3">{m.email}</div></div>
                        </div>
                      </td>
                      <td className={td}><Chip tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Chip></td>
                      <td className={td}>
                        {m.access}
                        {m.role === 'uploader' && <div className="max-w-[220px] truncate text-[11.5px] text-ink-3" title={assigned.join(', ')}>{assigned.length ? assigned.join(', ') : 'No events yet'}</div>}
                      </td>
                      <td className={`${td} text-ink-3`}>{m.pending || !m.lastActive ? <Chip tone="warn">Invite sent</Chip> : fmt.ago(m.lastActive)}</td>
                      <td className={`${td} text-right`}>
                        <Menu
                          trigger={<span className="inline-flex"><Tip label="More"><Button size="icon" variant="ghost" aria-label={`Actions for ${m.name}`}><MoreHorizontal size={16} /></Button></Tip></span>}
                          items={[
                            ...(['owner', 'editor', 'uploader'] as Role[]).filter((r) => r !== m.role).map((r) => ({
                              label: `Change to ${ROLE_LABEL[r]}`, icon: <UserCog size={14} />, onSelect: () => update.mutate({ m, role: r }),
                            })),
                            ...(m.role === 'uploader' ? [{ label: 'Choose events', icon: <CalendarCheck size={14} />, onSelect: () => setPicking({ member: m }) }] : []),
                            'separator' as const,
                            { label: you ? 'Leave the team' : 'Remove from team', icon: <Trash2 size={14} />, danger: true, onSelect: () => setRemoving(m) },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.role} className="flex gap-3">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text">{r.icon}</span>
            <div><div className="text-[13px] font-bold">{ROLE_LABEL[r.role]}</div><p className="text-[12px] text-ink-2">{r.body}</p></div>
          </Card>
        ))}
      </div>

      <EventPicker open={!!picking} onOpenChange={(v) => !v && setPicking(null)} events={events.data ?? []}
        name={picking?.member?.name} value={picking?.member ? picking.member.eventIds ?? [] : inviteEvents}
        onSave={(ids) => { if (picking?.member) update.mutate({ m: picking.member, eventIds: ids }); else setInviteEvents(ids) }} />

      <ConfirmDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)} danger title={`Remove ${removing?.name}?`} confirmLabel="Remove"
        body={<>They lose access right away. Photos they uploaded stay in your events.</>}
        onConfirm={() => { if (removing) remove.mutate(removing) }} />
    </div>
  )
}

function EventPicker({ open, onOpenChange, events, value, name, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; events: PhotoEvent[]; value: ID[]; name?: string; onSave: (ids: ID[]) => void
}) {
  const [picked, setPicked] = useState<ID[]>(value)
  // Start from the saved list each time the picker opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setPicked(value) }, [open])
  const list = events.filter((e) => e.status !== 'archived')
  return (
    <Modal open={open} onOpenChange={onOpenChange} width={480}
      title={name ? `Events ${name} can upload to` : 'Events they can upload to'}
      description="Uploaders only see these events. You can change this any time."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => { onSave(picked); onOpenChange(false) }}>Save {picked.length} {picked.length === 1 ? 'event' : 'events'}</Button></>}>
      <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-4 py-3 scrollbar-thin sm:px-5">
        {!list.length && <p className="py-6 text-center text-[13px] text-ink-2">No events yet. Create one first.</p>}
        {list.map((e) => {
          const on = picked.includes(e.id)
          return (
            <label key={e.id} className={cn('flex cursor-pointer items-center gap-3 rounded-control border p-2', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk')}>
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">{e.name}</div>
                <div className="text-[11.5px] text-ink-3">{fmt.date(e.date)} · {e.city}</div>
              </div>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
