import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@frameline/ui'
import { CodeInput } from './CodeInput'
import { DEMO_CODE, pause, useCodeCheck, useCountdown } from './mockAuth'

/** Enter the 6-digit code sent to `email`. Used by sign-in and by forgot password. */
export function CodeStep({ email, title, verifyLabel, onVerified, onChangeEmail, extra }: {
  email: string
  title: string
  verifyLabel: string
  onVerified: () => void | Promise<void>
  onChangeEmail: () => void
  extra?: ReactNode
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { left, start } = useCountdown()
  const check = useCodeCheck()

  useEffect(() => { start() }, [start])

  const verify = async (value = code) => {
    if (value.length < 6 || busy || check.locked) return
    setBusy(true)
    await pause(500)
    if (check.check(value)) {
      await onVerified()
    } else {
      setCode('')
    }
    setBusy(false)
  }

  const resend = async () => {
    setNotice(null)
    await pause(300)
    start()
    setCode('')
    check.clearError()
    setNotice(`New code sent to ${email}.`)
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
        onChange={(v) => { setCode(v); if (check.error && !check.locked) check.clearError() }}
        onComplete={(v) => void verify(v)}
        disabled={busy || check.locked}
        invalid={!!check.error}
        autoFocus
      />
      {check.error && <p role="alert" className="-mt-1 text-[12px] font-semibold text-bad">{check.error}</p>}
      {notice && !check.error && <p className="-mt-1 text-[12px] text-ok">{notice}</p>}
      {import.meta.env.DEV && <p className="-mt-1 rounded-control bg-sunk px-3 py-1.5 font-mono text-[11.5px] text-ink-2">Demo code: {DEMO_CODE}</p>}
      <Button variant="primary" size="lg" className="justify-center" loading={busy} disabled={code.length < 6 || check.locked} onClick={() => void verify()}>
        {verifyLabel}
      </Button>
      <div className="flex items-center justify-between text-[12px]">
        {left > 0
          ? <span className="text-ink-3">Resend code in <span className="font-mono tnum">0:{String(left).padStart(2, '0')}</span></span>
          : <button type="button" onClick={() => void resend()} className="font-bold text-accent-text hover:underline" disabled={check.locked}>Resend code</button>}
        {extra}
      </div>
    </div>
  )
}
