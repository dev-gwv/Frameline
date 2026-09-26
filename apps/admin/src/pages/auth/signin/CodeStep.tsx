import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@frameline/ui'
import { CodeInput } from './CodeInput'
import { clock, describeAuthError, useCountdown } from './authHelpers'

export interface CodeSent { resendAfter: number; devCode?: string }

/** Enter the 6-digit code sent to `email`. Used by sign-in and by forgot password. */
export function CodeStep({ email, title, verifyLabel, sent, onVerify, onResend, onChangeEmail, extra, initialError }: {
  email: string
  title: string
  verifyLabel: string
  /** Result of the request that sent the first code. */
  sent: CodeSent
  /** Checks the code; throws an ApiError when it's wrong. */
  onVerify: (code: string) => Promise<void>
  onResend: () => Promise<CodeSent>
  onChangeEmail: () => void
  extra?: ReactNode
  /** Shown when coming back to this step after the code was rejected later on. */
  initialError?: string | null
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [locked, setLocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [devCode, setDevCode] = useState(sent.devCode)
  const resend = useCountdown()
  const wait = useCountdown()

  useEffect(() => { resend.start(sent.resendAfter) }, [resend.start, sent.resendAfter])

  const verify = async (value = code) => {
    if (value.length < 6 || busy || locked || wait.left > 0) return
    setBusy(true)
    try {
      await onVerify(value)
    } catch (err) {
      const f = describeAuthError(err)
      setError(f.message)
      if (f.locked) setLocked(true)
      if (f.waitSeconds) wait.start(f.waitSeconds)
      setCode('')
      setBusy(false)
    }
  }

  const doResend = async () => {
    setNotice(null)
    setResending(true)
    try {
      const r = await onResend()
      resend.start(r.resendAfter)
      setDevCode(r.devCode)
      setCode('')
      setError(null)
      setLocked(false)
      setNotice(`New code sent to ${email}.`)
    } catch (err) {
      const f = describeAuthError(err)
      setError(f.message)
      if (f.waitSeconds) resend.start(f.waitSeconds)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onChangeEmail} className="inline-flex w-fit items-center gap-1.5 text-[12px] font-bold text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> Use a different email
      </button>
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-2">We emailed a 6-digit code to <b className="text-ink">{email}</b>. It works for 10 minutes.</p>
      </div>
      <CodeInput
        value={code}
        onChange={(v) => { setCode(v); if (error && !locked) setError(null) }}
        onComplete={(v) => void verify(v)}
        disabled={busy || locked}
        invalid={!!error}
        autoFocus
      />
      {error && <p role="alert" className="-mt-1 text-[12px] font-semibold text-bad">{error}{wait.left > 0 && <> · <span className="font-mono tnum">{clock(wait.left)}</span></>}</p>}
      {notice && !error && <p className="-mt-1 text-[12px] text-ok" role="status">{notice}</p>}
      {devCode && <p className="-mt-1 rounded-control bg-sunk px-3 py-1.5 font-mono text-[11.5px] text-ink-2">Development code: {devCode}</p>}
      <Button variant="primary" size="lg" className="justify-center" loading={busy} disabled={code.length < 6 || locked || wait.left > 0} onClick={() => void verify()}>
        {verifyLabel}
      </Button>
      <div className="flex items-center justify-between text-[12px]">
        {resend.left > 0
          ? <span className="text-ink-3">Resend code in <span className="font-mono tnum">{clock(resend.left)}</span></span>
          : <button type="button" onClick={() => void doResend()} className="font-bold text-accent-text hover:underline disabled:opacity-50" disabled={resending}>{resending ? 'Sending…' : 'Resend code'}</button>}
        {extra}
      </div>
    </div>
  )
}
