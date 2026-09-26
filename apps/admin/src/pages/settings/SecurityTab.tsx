import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Circle, Eye, EyeOff, LogOut, MonitorSmartphone } from 'lucide-react'
import { Button, Card, cn, ConfirmDialog, Field, Input, Skeleton, Tip, useToast } from '@frameline/ui'
import { errorMessage, useHttpApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useLocalState } from '../wallet/lib'

const ME_KEY = ['studio', 'me']

/**
 * Whether this account already has a password. The real API reports it in /auth/me; sample data has no
 * account store, so there this browser remembers it (frameline.passwordSet). The password itself is never stored.
 */
function useHasPassword() {
  const http = useHttpApi()
  const me = useQuery({ queryKey: ME_KEY, queryFn: () => http!.auth.me(), enabled: !!http })
  const [local, setLocal] = useLocalState<boolean>('frameline.passwordSet', false)
  if (http) return { hasPassword: me.data?.user.hasPassword ?? false, loading: me.isLoading, markSet: () => {} }
  return { hasPassword: local, loading: false, markSet: () => setLocal(true) }
}

export function SecurityTab() {
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, setPassword, signOut, mode } = useAuth()
  const { hasPassword, loading, markSet } = useHasPassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

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
    setTried(true); setFormError('')
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    try {
      await setPassword(next, hasPassword ? current : undefined)
      markSet(); qc.invalidateQueries({ queryKey: ME_KEY })
      setCurrent(''); setNext(''); setConfirm(''); setTried(false)
      toast.success(hasPassword ? 'Password changed' : 'Password set', 'Use it with your email to sign in on any device.')
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const out = async (allDevices: boolean) => {
    setSigningOut(true)
    try {
      await signOut({ allDevices })
      navigate('/login', { replace: true })
    } catch (err) {
      setSigningOut(false)
      toast.error('Couldn’t sign out', errorMessage(err))
    }
  }
  const eye = (
    <Tip label={show ? 'Hide passwords' : 'Show passwords'}>
      <button type="button" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow((v) => !v)} className="text-ink-3 hover:text-ink">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </Tip>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="flex flex-col gap-3">
        {loading ? <Skeleton className="h-72" /> : <>
          <div>
            <h3 className="font-display text-[15px] font-semibold">{hasPassword ? 'Change password' : 'Set a password'}</h3>
            <p className="text-[12px] text-ink-3">{hasPassword ? 'You sign in with Google, an email code, or your email and password.' : 'You sign in with Google or an email code now. Add a password to sign in with your email too.'}</p>
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
            {formError && <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[12.5px] font-semibold text-bad">{formError}</p>}
            <Button type="submit" variant="primary" className="self-start" loading={busy}>{hasPassword ? 'Change password' : 'Set password'}</Button>
          </form>
        </>}
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><MonitorSmartphone size={16} className="text-ink-2" /><h3 className="font-display text-[15px] font-semibold">Signed in somewhere else?</h3></div>
          <p className="text-[12.5px] text-ink-2">If you lost a phone or used a shared computer, sign out everywhere. Every device, including this one, has to sign in again.</p>
          <Button className="self-start" loading={signingOut} onClick={() => setConfirmAll(true)}>Sign out of all devices</Button>
          {mode === 'demo' && <p className="text-[11.5px] text-ink-3">With sample data there is only this browser to sign out.</p>}
        </Card>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-[13px] font-bold">Sign out</div><div className="text-[12px] text-ink-3">Signed in as {user?.email}</div></div>
          <Button variant="danger" icon={<LogOut size={14} />} disabled={signingOut} onClick={() => out(false)}>Sign out</Button>
        </Card>
      </div>

      <ConfirmDialog open={confirmAll} onOpenChange={setConfirmAll} danger title="Sign out of all devices?" confirmLabel="Sign out everywhere"
        body="Everyone signed in to this account on phones, computers and the desktop uploader is signed out, including you here. You can sign straight back in."
        onConfirm={() => out(true)} />
    </div>
  )
}
