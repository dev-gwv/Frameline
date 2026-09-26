import { useState } from 'react'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Button, Field, Input, Tip } from '@frameline/ui'
import { useAuth, type VerifyResult } from '../../../lib/auth'
import { CodeStep, type CodeSent } from './CodeStep'
import { ForgotPassword } from './ForgotPassword'
import { clock, describeAuthError, isEmail, useCountdown } from './authHelpers'

type View = 'start' | 'code' | 'forgot'

function GoogleMark() {
  // Google's brand mark keeps its own colours.
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/**
 * One flow for sign-in and sign-up: Google, or email + 6-digit code (default),
 * or email + password. `onDone` decides where the person goes next.
 */
export function SignInForm({ onDone, onGoogle, googleBusy, notice }: {
  onDone: (result: VerifyResult) => void
  onGoogle: () => void
  googleBusy?: boolean
  notice?: string
}) {
  const auth = useAuth()
  const [view, setView] = useState<View>('start')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<CodeSent | null>(null)
  const wait = useCountdown()

  const fail = (err: unknown, field: 'email' | 'password') => {
    const f = describeAuthError(err)
    if (f.waitSeconds) wait.start(f.waitSeconds)
    if (field === 'email') setEmailError(f.message); else setPwError(f.message)
  }

  const submit = async () => {
    if (!isEmail(email)) { setEmailError('Enter a valid email address, like studio@example.com.'); return }
    setEmailError(null)
    const address = email.trim().toLowerCase()
    if (usePassword) {
      if (!password) { setPwError('Enter your password, or sign in with an email code instead.'); return }
      setPwError(null); setBusy(true)
      try { onDone(await auth.signInWithPassword(address, password)) } catch (err) { fail(err, 'password') } finally { setBusy(false) }
      return
    }
    setBusy(true)
    try { setSent(await auth.requestCode(address)); setView('code') } catch (err) { fail(err, 'email') } finally { setBusy(false) }
  }

  if (view === 'code' && sent) {
    const address = email.trim().toLowerCase()
    return (
      <CodeStep
        email={address} title="Check your email" verifyLabel="Sign in" sent={sent}
        onVerify={async (code) => onDone(await auth.verifyCode(address, code))}
        onResend={() => auth.requestCode(address)}
        onChangeEmail={() => setView('start')}
        extra={<button type="button" className="font-bold text-accent-text hover:underline" onClick={() => { setUsePassword(true); setView('start') }}>Use password instead</button>}
      />
    )
  }
  if (view === 'forgot') {
    return <ForgotPassword initialEmail={email} onDone={onDone} onBack={(e) => { setEmail(e); setUsePassword(true); setView('start') }} />
  }

  return (
    <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); void submit() }} noValidate>
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight">Welcome back</h1>
        <p className="mt-0.5 text-[13px] text-ink-2">New here? The same steps create your studio.</p>
      </div>
      {notice && <p role="status" className="rounded-control bg-warn-soft px-3 py-2 text-[12.5px] font-semibold text-warn">{notice}</p>}
      <Button size="lg" className="mt-2 justify-center" icon={<GoogleMark />} loading={googleBusy} onClick={onGoogle}>
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-[12px] text-ink-3">
        <hr className="flex-1 border-0 border-t border-line" />or use email<hr className="flex-1 border-0 border-t border-line" />
      </div>
      <Field label="Email address" htmlFor="si-email" error={usePassword ? emailError : emailError && <>{emailError}{wait.left > 0 && <> · <span className="font-mono tnum">{clock(wait.left)}</span></>}</>}>
        <Input id="si-email" type="email" autoComplete="email" icon={<Mail size={14} />} placeholder="studio@example.com"
          value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(null) }} />
      </Field>
      {usePassword && (
        <Field label="Password" htmlFor="si-pw" error={pwError}>
          <Input id="si-pw" type={show ? 'text' : 'password'} autoComplete="current-password" autoFocus icon={<Lock size={14} />}
            value={password} onChange={(e) => { setPassword(e.target.value); setPwError(null) }}
            suffix={<Tip label={show ? 'Hide password' : 'Show password'}><button type="button" aria-label={show ? 'Hide password' : 'Show password'} className="text-ink-3 hover:text-ink" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button></Tip>} />
        </Field>
      )}
      <Button type="submit" variant="primary" size="lg" className="justify-center" loading={busy} disabled={wait.left > 0}>
        {wait.left > 0 ? `Try again in ${clock(wait.left)}` : usePassword ? 'Sign in' : 'Email me a 6-digit code'}
      </Button>
      <div className="flex items-center justify-between text-[12px]">
        <button type="button" className="font-bold text-accent-text hover:underline" onClick={() => { setUsePassword((v) => !v); setPwError(null) }}>
          {usePassword ? 'Email me a code instead' : 'Use password instead'}
        </button>
        <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setView('forgot')}>Forgot password?</button>
      </div>
      {auth.mode === 'demo' && usePassword && <p className="rounded-control bg-sunk px-3 py-1.5 font-mono text-[11.5px] text-ink-2">Sample data: any password with 6+ characters</p>}
      <p className="text-[11.5px] text-ink-3">
        By continuing you agree to the <a className="underline hover:text-ink" href="https://frameline.in/terms" target="_blank" rel="noreferrer">Terms of Use</a> and{' '}
        <a className="underline hover:text-ink" href="https://frameline.in/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>. Bot check runs invisibly.
      </p>
    </form>
  )
}
