import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Circle, Eye, EyeOff, LogOut, Monitor, Smartphone } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, Chip, cn, ConfirmDialog, Field, Input, Tip, useToast } from '@frameline/ui'
import { useAuth } from '../../lib/auth'
import { useLocalState } from '../wallet/lib'

interface Session { id: string; device: string; where: string; at: string; kind: 'desktop' | 'phone'; current?: boolean }
const SESSIONS: Session[] = [
  { id: 's1', device: 'Chrome on Windows', where: 'Mumbai, IN', at: new Date().toISOString(), kind: 'desktop', current: true },
  { id: 's2', device: 'Frameline app · iPhone 15', where: 'Mumbai, IN', at: '2026-09-26T14:10:00+05:30', kind: 'phone' },
  { id: 's3', device: 'Safari on macOS', where: 'Pune, IN', at: '2026-09-22T19:45:00+05:30', kind: 'desktop' },
]

export function SecurityTab() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  // Only whether a password exists is remembered; the password itself never leaves the form.
  const [hasPassword, setHasPassword] = useLocalState<boolean>('frameline.passwordSet', false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signedOutOthers, setSignedOutOthers] = useLocalState<boolean>('frameline.sessionsCleared', false)
  const [confirmOthers, setConfirmOthers] = useState(false)

  const rules = [
    { ok: next.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(next) && /\d/.test(next), label: 'Letters and at least one number' },
    { ok: !!next && !(user?.email && next.toLowerCase().includes(user.email.split('@')[0].toLowerCase())), label: 'Doesn’t contain your email name' },
  ]
  const errors = {
    current: hasPassword && !current ? 'Enter your current password' : '',
    next: rules.every((r) => r.ok) ? '' : 'Meet all the rules below',
    confirm: confirm !== next ? 'Passwords don’t match' : '',
  }
  const submit = async () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    await new Promise((r) => setTimeout(r, 500))
    setBusy(false); setHasPassword(true); setCurrent(''); setNext(''); setConfirm(''); setTried(false)
    toast.success(hasPassword ? 'Password changed' : 'Password set', 'Use it with your email to sign in on any device.')
  }
  const sessions = signedOutOthers ? SESSIONS.filter((s) => s.current) : SESSIONS
  const eye = (
    <Tip label={show ? 'Hide passwords' : 'Show passwords'}>
      <button type="button" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow((v) => !v)} className="text-ink-3 hover:text-ink">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </Tip>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="flex flex-col gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold">{hasPassword ? 'Change password' : 'Set a password'}</h3>
          <p className="text-[12px] text-ink-3">{hasPassword ? 'You sign in with Google or your email and password.' : 'You sign in with Google now. Add a password to sign in with your email too.'}</p>
        </div>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
          {hasPassword && (
            <Field label="Current password" error={tried ? errors.current : ''} htmlFor="pw-cur">
              <Input id="pw-cur" type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} suffix={eye} />
            </Field>
          )}
          <Field label="New password" error={tried ? errors.next : ''} htmlFor="pw-new">
            <Input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} suffix={hasPassword ? undefined : eye} />
          </Field>
          <ul className="flex flex-col gap-1 text-[12px]">
            {rules.map((r) => (
              <li key={r.label} className={cn('flex items-center gap-1.5', r.ok ? 'text-ok' : 'text-ink-3')}>{r.ok ? <Check size={13} /> : <Circle size={11} />}{r.label}</li>
            ))}
          </ul>
          <Field label="Confirm new password" error={tried || (confirm && confirm.length >= next.length) ? errors.confirm : ''} htmlFor="pw-conf">
            <Input id="pw-conf" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" className="self-start" loading={busy}>{hasPassword ? 'Change password' : 'Set password'}</Button>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold">Active sessions</h3>
            <Button size="sm" disabled={sessions.length < 2} onClick={() => setConfirmOthers(true)}>Sign out others</Button>
          </div>
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-t border-line py-2.5 first-of-type:border-t-0">
              <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-sunk text-ink-2">{s.kind === 'phone' ? <Smartphone size={15} /> : <Monitor size={15} />}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold">{s.device}</div>
                <div className="text-[12px] text-ink-3">{s.where} · {s.current ? 'active now' : fmt.ago(s.at)}</div>
              </div>
              {s.current && <Chip tone="ok" dot>This device</Chip>}
            </div>
          ))}
        </Card>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-[13px] font-bold">Sign out</div><div className="text-[12px] text-ink-3">Signed in as {user?.email}</div></div>
          <Button variant="danger" icon={<LogOut size={14} />} onClick={() => { signOut(); navigate('/login', { replace: true }) }}>Sign out</Button>
        </Card>
      </div>

      <ConfirmDialog open={confirmOthers} onOpenChange={setConfirmOthers} title="Sign out other devices?" confirmLabel="Sign out others"
        body="Everyone signed in to this account on other phones and computers is signed out. This device stays signed in."
        onConfirm={() => { setSignedOutOthers(true); toast.success('Signed out other devices', `${SESSIONS.length - 1} sessions ended.`) }} />
    </div>
  )
}
