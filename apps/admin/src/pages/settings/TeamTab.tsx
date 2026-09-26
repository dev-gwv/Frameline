import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Mail, MoreHorizontal, Pencil, Trash2, Upload, UserCog } from 'lucide-react'
import { fmt, type TeamMember } from '@frameline/shared'
import { Avatar, Button, Card, Chip, ConfirmDialog, Input, Menu, Select, Skeleton, Tip, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useTeam } from '../../lib/queries'
import { QueryError } from '../system'
import { EMAIL_RE, td, th, useLocalState } from '../wallet/lib'
import { usePlanState } from '../plan/usePlanState'

type Role = TeamMember['role']
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', uploader: 'Uploader' }
const ROLE_ACCESS: Record<Role, string> = { owner: 'All events, billing, payouts', editor: 'All events', uploader: 'Assigned events only' }
const ROLES: { role: Role; icon: ReactNode; body: string }[] = [
  { role: 'owner', icon: <Crown size={15} />, body: 'Everything, including billing, payouts, the store and team. One per studio.' },
  { role: 'editor', icon: <Pencil size={15} />, body: 'Creates and edits events, uploads, shares galleries and answers enquiries. No money settings.' },
  { role: 'uploader', icon: <Upload size={15} />, body: 'For second shooters. Uploads to the events you assign; can’t delete, share or see sales.' },
]

export function TeamTab() {
  const api = useApi()
  const toast = useToast()
  const team = useTeam()
  const { plan } = usePlanState()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('uploader')
  const [emailError, setEmailError] = useState('')
  // The mock API has no role-change or remove call; those changes are kept locally.
  const [overrides, setOverrides] = useLocalState<Record<string, Role | 'removed'>>('frameline.teamOverrides', {})
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const members = (team.data ?? []).filter((m) => overrides[m.id] !== 'removed').map((m) => {
    const o = overrides[m.id]
    return o && o !== 'removed' ? { ...m, role: o, access: ROLE_ACCESS[o] } : m
  })
  const seats = plan.seats
  const full = members.length >= seats

  const invite = useAction((v: { email: string; role: Role }) => api.inviteMember(v.email, v.role), {
    success: (_, v) => `Invite sent to ${v.email}`,
    onSuccess: () => setEmail(''),
  })
  const submit = () => {
    const e = email.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) return setEmailError('Enter a valid email, like name@studio.in')
    if (members.some((m) => m.email.toLowerCase() === e)) return setEmailError(`${e} is already on your team`)
    if (full) return setEmailError(`All ${seats} seats are used. Remove someone or upgrade your plan.`)
    setEmailError(''); invite.mutate({ email: e, role })
  }
  const changeRole = (m: TeamMember, r: Role) => { setOverrides((o) => ({ ...o, [m.id]: r })); toast.success(`${m.name} is now ${ROLE_LABEL[r] === 'Editor' ? 'an Editor' : 'an Uploader'}`) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold">Team members</div>
          <div className="text-[12.5px] text-ink-2">{members.length} of {seats} seats used · {plan.name} plan{members.length > seats && <span className="font-bold text-warn"> · {members.length - seats} over your plan</span>}{full && <> · <Link to="/plan" className="font-bold text-accent-text hover:underline">Get more seats</Link></>}</div>
        </div>
        <form className="flex w-full flex-col gap-1 sm:w-auto" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Email to invite" className="min-w-0 flex-1 sm:w-[250px]" icon={<Mail size={14} />} placeholder="name@email.com" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailError('') }} />
            <Select aria-label="Role" className="w-[120px]" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="editor">Editor</option>
              <option value="uploader">Uploader</option>
            </Select>
            <Button type="submit" variant="primary" loading={invite.isPending}>Invite</Button>
          </div>
          {emailError && <span className="text-[11.5px] font-semibold text-bad">{emailError}</span>}
        </form>
      </div>

      <Card padded={false}>
        {team.isError ? <QueryError error={team.error} retry={() => team.refetch()} /> : team.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Access</th><th className={th}>Last active</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.name} tone={m.role === 'owner' ? 'dark' : m.role === 'editor' ? 'accent' : 'neutral'} />
                        <div className="min-w-0"><div className="font-bold">{m.name}</div><div className="truncate text-[11.5px] text-ink-3">{m.email}</div></div>
                      </div>
                    </td>
                    <td className={td}><Chip tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Chip></td>
                    <td className={td}>{m.access}</td>
                    <td className={`${td} text-ink-3`}>{m.lastActive ? fmt.ago(m.lastActive) : <Chip tone="warn">Invite sent</Chip>}</td>
                    <td className={`${td} text-right`}>
                      {m.role !== 'owner' && (
                        <Menu
                          trigger={<span className="inline-flex"><Tip label="More"><Button size="icon" variant="ghost" aria-label={`Actions for ${m.name}`}><MoreHorizontal size={16} /></Button></Tip></span>}
                          items={[
                            { label: m.role === 'editor' ? 'Change to Uploader' : 'Change to Editor', icon: <UserCog size={14} />, onSelect: () => changeRole(m, m.role === 'editor' ? 'uploader' : 'editor') },
                            'separator',
                            { label: 'Remove from team', icon: <Trash2 size={14} />, danger: true, onSelect: () => setRemoving(m) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
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

      <ConfirmDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)} danger title={`Remove ${removing?.name}?`} confirmLabel="Remove"
        body={<>They lose access right away. Photos they uploaded stay in your events.</>}
        onConfirm={() => { if (removing) { setOverrides((o) => ({ ...o, [removing.id]: 'removed' })); toast.success(`${removing.name} removed`) } }} />
    </div>
  )
}
