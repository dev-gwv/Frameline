import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Button, Field, Input, Tip } from '@frameline/ui'
import { CodeStep } from './CodeStep'
import { isEmail, pause } from './mockAuth'

type Step = 'email' | 'code' | 'password' | 'done'

/** Forgot password: email → 6-digit code → new password → done. */
export function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: (email: string) => void }) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState(initialEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendCode = async () => {
    if (!isEmail(email)) { setEmailError('Enter a valid email address, like studio@example.com.'); return }
    setEmailError(null); setBusy(true); await pause(); setBusy(false); setStep('code')
  }
  const savePassword = async () => {
    if (pw.length < 6) { setPwError('Use at least 6 characters.'); return }
    if (pw !== pw2) { setPwError('The two passwords don’t match. Type the same password twice.'); return }
    setPwError(null); setBusy(true); await pause(); setBusy(false); setStep('done')
  }

  if (step === 'code') {
    return <CodeStep email={email} title="Check your email" verifyLabel="Continue" onVerified={() => setStep('password')} onChangeEmail={() => setStep('email')} />
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">Password updated</h1>
          <p className="mt-1 text-[13px] text-ink-2">Sign in to <b className="text-ink">{email}</b> with your new password.</p>
        </div>
        <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => onBack(email)}>Back to sign in</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => onBack(email)} className="inline-flex w-fit items-center gap-1.5 text-[12px] font-bold text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> Back to sign in
      </button>
      {step === 'email' ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight">Reset your password</h1>
            <p className="mt-1 text-[13px] text-ink-2">We’ll email you a 6-digit code to confirm it’s you.</p>
          </div>
          <Field label="Email address" htmlFor="fp-email" error={emailError}>
            <Input id="fp-email" type="email" autoComplete="email" autoFocus icon={<Mail size={14} />} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="studio@example.com" />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="justify-center" loading={busy}>Email me a code</Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void savePassword() }}>
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight">Choose a new password</h1>
            <p className="mt-1 text-[13px] text-ink-2">At least 6 characters. You can still sign in with an email code any time.</p>
          </div>
          <Field label="New password" htmlFor="fp-pw" hint="6 or more characters">
            <Input id="fp-pw" type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus icon={<Lock size={14} />} value={pw} onChange={(e) => setPw(e.target.value)}
              suffix={<Tip label={show ? 'Hide password' : 'Show password'}><button type="button" aria-label={show ? 'Hide password' : 'Show password'} className="text-ink-3 hover:text-ink" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button></Tip>} />
          </Field>
          <Field label="Type it again" htmlFor="fp-pw2" error={pwError}>
            <Input id="fp-pw2" type={show ? 'text' : 'password'} autoComplete="new-password" icon={<Lock size={14} />} value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="justify-center" loading={busy}>Save new password</Button>
        </form>
      )}
    </div>
  )
}
