import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Button, Field, Input, Tip } from '@frameline/ui'
import { ApiError } from '@frameline/shared'
import { useAuth, type VerifyResult } from '../../../lib/auth'
import { CodeStep, type CodeSent } from './CodeStep'
import { describeAuthError, isEmail } from './authHelpers'

type Step = 'email' | 'code' | 'password' | 'done'
const MIN_PASSWORD = 8

/**
 * Forgot password: email → 6-digit code → new password (resetPassword checks the code and signs in) → done.
 */
export function ForgotPassword({ initialEmail, onBack, onDone }: { initialEmail: string; onBack: (email: string) => void; onDone: (r: VerifyResult) => void }) {
  const auth = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState(initialEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<CodeSent | null>(null)
  const [code, setCode] = useState('')
  const [session, setSession] = useState<VerifyResult | null>(null)
  const address = email.trim().toLowerCase()

  const sendCode = async () => {
    if (!isEmail(email)) { setEmailError('Enter a valid email address, like studio@example.com.'); return }
    setEmailError(null); setBusy(true)
    try { setSent(await auth.requestCode(address)); setStep('code') } catch (err) { setEmailError(describeAuthError(err).message) } finally { setBusy(false) }
  }
  const savePassword = async () => {
    if (pw.length < MIN_PASSWORD) { setPwError(`Use at least ${MIN_PASSWORD} characters.`); return }
    if (pw !== pw2) { setPwError('The two passwords don’t match. Type the same password twice.'); return }
    setPwError(null); setBusy(true)
    try { setSession(await auth.resetPassword(address, code, pw)); setStep('done') } catch (err) {
      const f = describeAuthError(err)
      // A wrong or expired code sends them back to enter a new one.
      if (err instanceof ApiError && /otp|code/.test(err.code)) { setCode(''); setStep('code') }
      setPwError(f.message)
    } finally { setBusy(false) }
  }

  if (step === 'code' && sent) {
    return (
      <CodeStep email={address} title="Check your email" verifyLabel="Continue" sent={sent!}
        onVerify={async (c) => { setCode(c); setPwError(null); setStep('password') }}
        onResend={() => auth.requestCode(address)}
        onChangeEmail={() => setStep('email')} initialError={pwError} />
    )
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">Password updated</h1>
          <p className="mt-1 text-[13px] text-ink-2">Next time, sign in to <b className="text-ink">{address}</b> with your new password or an email code.</p>
        </div>
        <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => session && onDone(session)}>Continue to Frameline</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {step === 'email' ? (
        <button type="button" onClick={() => onBack(email)} className="inline-flex w-fit items-center gap-1.5 text-[12px] font-bold text-ink-2 hover:text-ink">
          <ArrowLeft size={14} /> Back to sign in
        </button>
      ) : (
        <button type="button" onClick={() => setStep('code')} className="inline-flex w-fit items-center gap-1.5 text-[12px] font-bold text-ink-2 hover:text-ink">
          <ArrowLeft size={14} /> Back to the code
        </button>
      )}
      {step === 'email' ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight">Reset your password</h1>
            <p className="mt-1 text-[13px] text-ink-2">We’ll email you a 6-digit code to confirm it’s you.</p>
          </div>
          <Field label="Email address" htmlFor="fp-email" error={emailError}>
            <Input id="fp-email" type="email" autoComplete="email" autoFocus icon={<Mail size={14} />} value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(null) }} placeholder="studio@example.com" />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="justify-center" loading={busy}>Email me a code</Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void savePassword() }}>
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight">Choose a new password</h1>
            <p className="mt-1 text-[13px] text-ink-2">At least {MIN_PASSWORD} characters. Saving it signs you in. Email codes keep working too.</p>
          </div>
          <Field label="New password" htmlFor="fp-pw" hint={`${MIN_PASSWORD} or more characters`}>
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
