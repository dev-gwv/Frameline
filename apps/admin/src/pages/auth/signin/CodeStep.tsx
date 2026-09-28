import { useEffect, useState, type ReactNode } from 'react'
import { Mail } from 'lucide-react'
import { ApiError } from '@frameline/shared'
import { Button, IconTile } from '@frameline/ui'
import { CodeInput } from './CodeInput'
import { clock, describeAuthError, useCountdown } from './authHelpers'

export interface CodeSent { resendAfter: number; devCode?: string }

/** Wrong codes allowed per code when the server doesn't say (sample data). */
const MAX_TRIES = 5

/** Enter the 6-digit code sent to `email`. Used by sign-in and by forgot password. */
export function CodeStep({ email, title = 'Check your email', verifyLabel = 'Continue', sent, onVerify, onResend, onChangeEmail, extra, initialError }: {
  email: string
  title?: string
  verifyLabel?: string
  /** Result of the request that sent the first code. */
  sent: CodeSent
  /** Checks the code; throws when it's wrong. */
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
  const [wrong, setWrong] = useState(0)
  const [shake, setShake] = useState(0)
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
      const serverCounts = err instanceof ApiError && typeof err.problem.attemptsRemaining === 'number'
      if (serverCounts || f.locked || f.waitSeconds) {
        setError(f.message)
      } else {
        // The server didn't say how many tries are left: count them here.
        const left = MAX_TRIES - (wrong + 1)
        setWrong((n) => n + 1)
        if (left <= 0) { setError('Too many wrong codes. Send a new code, or use a password.'); setLocked(true) }
        else setError(`That code doesn’t match. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
      }
      if (f.locked) setLocked(true)
      if (f.waitSeconds) wait.start(f.waitSeconds)
      setShake((n) => n + 1)
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
      setWrong(0)
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
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void verify() }} noValidate>
      <IconTile className="size-11"><Mail size={20} aria-hidden /></IconTile>
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight">{title}</h1>
        <p className="mt-1 text-[14px] text-ink-2">We sent a 6-digit code to <b className="text-ink">{email}</b>. It works for 10 minutes.</p>
      </div>
      <CodeInput
        value={code}
        onChange={(v) => { setCode(v); if (error && !locked) setError(null) }}
        onComplete={(v) => void verify(v)}
        disabled={busy || locked}
        invalid={!!error}
        autoFocus
        shake={shake}
      />
      {error && <p role="alert" className="-mt-1 text-[13px] font-semibold text-bad">{error}{wait.left > 0 && <> · <span className="tnum">{clock(wait.left)}</span></>}</p>}
      {notice && !error && <p className="-mt-1 text-[13px] text-ok" role="status">{notice}</p>}
      {devCode && <p className="-mt-1 rounded-control bg-sunk px-3 py-1.5 text-[12px] text-ink-2">Sample data: the code is <b className="tnum">{devCode}</b></p>}
      <Button type="submit" variant="primary" size="lg" className="justify-center" loading={busy} disabled={code.length < 6 || locked || wait.left > 0}>
        {wait.left > 0 ? `Try again in ${clock(wait.left)}` : verifyLabel}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        {resend.left > 0
          ? <span className="text-ink-3">Resend in <span className="tnum">{clock(resend.left)}</span></span>
          : <button type="button" onClick={() => void doResend()} className="min-h-[36px] font-bold text-accent-text hover:underline disabled:opacity-50" disabled={resending}>{resending ? 'Sending…' : 'Send a new code'}</button>}
        <button type="button" onClick={onChangeEmail} className="min-h-[36px] font-bold text-accent-text hover:underline">Use a different email</button>
      </div>
      {extra && <div className="text-[13px]">{extra}</div>}
    </form>
  )
}
