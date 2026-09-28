import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Download, Globe, Smartphone } from 'lucide-react'
import { Field, Input, cn } from '@frameline/ui'
import type { PublicEvent, PublicStudio } from '@frameline/shared'
import { useApi } from '../lib/api'
import { authFrom, guest, useGuest, type EventSession } from '../lib/guest'
import { attemptsRemaining, errorCode, friendlyError, retrySeconds } from '../lib/errors'
import { isIOS, promptInstall, useCanInstall } from '../lib/pwa'
import { EventHero, PrimaryButton, TextButton, WideButton } from './common'
import { Sheet } from './Sheet'

/** Compact event hero above every gate; a white card on paper from `sm` up. */
export function GateFrame({ event, children }: { event: PublicEvent; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-surface sm:bg-paper sm:py-10">
      <div className="mx-auto w-full max-w-md bg-surface sm:overflow-hidden sm:rounded-card sm:border sm:border-line sm:shadow-card">
        <EventHero event={event} size="sm" />
        <div className="px-4 pb-8 pt-5 sm:px-6">{children}</div>
      </div>
    </main>
  )
}

/* ---------------------------------------------------------------- PIN boxes */

/** Four digit boxes: auto-advance, paste, backspace to the previous box; calls onComplete with 4 digits. */
export function PinBoxes({ onComplete, disabled, invalid, shakeKey, autoFocus = true, label = 'PIN' }: {
  onComplete: (pin: string) => void; disabled?: boolean; invalid?: boolean; shakeKey: number; autoFocus?: boolean; label?: string
}) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  // A new shake (wrong PIN) clears the boxes and puts the cursor back in the first one.
  useEffect(() => { if (shakeKey > 0) setDigits(['', '', '', '']) }, [shakeKey])
  useEffect(() => { if (autoFocus && !disabled) refs.current[0]?.focus() }, [shakeKey, autoFocus, disabled])

  function setAt(i: number, v: string) {
    const clean = v.replace(/\D/g, '')
    if (clean.length > 1) { // paste or autofill
      const next = clean.slice(0, 4).split('')
      while (next.length < 4) next.push('')
      setDigits(next)
      if (clean.length >= 4) onComplete(clean.slice(0, 4))
      else refs.current[clean.length]?.focus()
      return
    }
    const next = [...digits]; next[i] = clean
    setDigits(next)
    if (clean && i < 3) refs.current[i + 1]?.focus()
    if (next.every(Boolean)) onComplete(next.join(''))
  }

  return (
    <fieldset key={shakeKey} disabled={disabled} className={cn('flex justify-center gap-2.5', shakeKey > 0 && 'animate-shake')}>
      <legend className="sr-only">{label}, 4 digits</legend>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < 3) refs.current[i + 1]?.focus()
          }}
          inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={4} pattern="[0-9]*"
          aria-label={`${label} digit ${i + 1}`} aria-invalid={invalid}
          className={cn('h-[58px] w-[52px] rounded-[10px] border-[1.5px] bg-surface text-center text-[24px] font-extrabold text-ink outline-none transition tnum',
            'focus:border-accent focus:ring-[3px] focus:ring-accent-soft disabled:opacity-60',
            invalid ? 'border-bad' : 'border-line-2')}
        />
      ))}
    </fieldset>
  )
}

/* ---------------------------------------------------------------- PIN gate */

/** PIN gate: checked by api.verifyPin (5 wrong tries lock the gallery for 15 minutes on the server). */
export function PinGate({ event, studio, session }: { event: PublicEvent; studio: PublicStudio; session: EventSession }) {
  const api = useApi()
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const lockedFor = session.pinLockedUntil ? session.pinLockedUntil - clock : 0
  const locked = lockedFor > 0

  // Count down while locked; unlock the form when the server's lock should be over.
  useEffect(() => {
    if (!locked) return
    const t = setTimeout(() => {
      const now = Date.now()
      setClock(now)
      if (session.pinLockedUntil && session.pinLockedUntil <= now) guest.patchSession(event.shortId, { pinLockedUntil: undefined })
    }, Math.min(lockedFor, 30_000))
    return () => clearTimeout(t)
  }, [locked, lockedFor, event.shortId, session.pinLockedUntil])

  async function check(value: string) {
    if (busy) return
    setPin(value); setBusy(true); setError(null)
    try {
      const s = await api.verifyPin(event.shortId, value)
      guest.patchSession(event.shortId, (cur) => ({ pin: 'typed', pinLockedUntil: undefined, auth: authFrom(s, cur.auth) }))
    } catch (err) {
      setShake((x) => x + 1); setPin('')
      const code = errorCode(err)
      if (code === 'pin_locked') {
        setClock(Date.now())
        guest.patchSession(event.shortId, { pinLockedUntil: Date.now() + (retrySeconds(err) ?? 900) * 1000 })
      } else if (code === 'invalid_pin') {
        const n = attemptsRemaining(err)
        setError(`That PIN didn’t match.${n !== undefined ? ` ${n} ${n === 1 ? 'try' : 'tries'} left.` : ''}`)
      } else {
        const f = friendlyError(err, 'We couldn’t check the PIN')
        setError(`${f.title}. ${f.body}`)
      }
    } finally { setBusy(false) }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (pin.length === 4) void check(pin)
    else setError('Enter all 4 digits of the PIN.')
  }

  const mins = Math.max(1, Math.ceil(lockedFor / 60_000))
  const tel = `tel:${studio.phone.replace(/\s/g, '')}`

  return (
    <GateFrame event={event}>
      <form onSubmit={submit} className="flex flex-col items-center gap-3 text-center" noValidate>
        <div>
          <h2 className="text-[18px] font-extrabold">Enter the event PIN</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-2">It’s on the invite or the QR poster.</p>
        </div>
        {locked ? (
          <div role="alert" className="w-full rounded-card bg-bad-soft p-3.5 text-[13.5px] text-bad">
            <b className="block">Too many tries, wait {mins === 15 ? '15 minutes' : `${mins} ${mins === 1 ? 'minute' : 'minutes'}`}</b>
            <span>For safety this gallery is locked on this device for a while. Ask the host for the PIN.</span>
          </div>
        ) : (
          <div className="my-2">
            <PinBoxes shakeKey={shake} disabled={busy} invalid={!!error} onComplete={(v) => void check(v)} />
          </div>
        )}
        <div id="pin-help" aria-live="polite" className={cn('min-h-5 text-[13px]', error ? 'font-bold text-bad' : 'text-ink-3')}>{!locked && error}</div>
        <PrimaryButton type="submit" disabled={locked} loading={busy}>Open gallery</PrimaryButton>
        <p className="text-[12.5px] text-ink-3">No PIN? Ask the host, or <a className="font-bold text-accent-text underline-offset-2 hover:underline" href={tel}>call {studio.name}</a>.</p>
      </form>
    </GateFrame>
  )
}

/* ---------------------------------------------------------------- Registration */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const validPhone = (v: string) => { const d = v.replace(/[\s()-]/g, ''); return /^\+?\d{10,13}$/.test(d) }

/** Registration gate: api.registerGuest adds the guest to the studio's Guests list and returns a session. */
export function RegistrationGate({ event, studio, session }: { event: PublicEvent; studio: PublicStudio; session: EventSession }) {
  const api = useApi()
  const profile = useGuest((s) => s.profile)
  const knownEmail = profile?.email ?? ''
  const [form, setForm] = useState({ name: profile?.name || session.greeting || '', phone: profile?.phone ?? '', email: knownEmail })
  const [showEmail, setShowEmail] = useState(!!knownEmail)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name so the host knows who you are.'
    if (!validPhone(form.phone)) errs.phone = 'Enter a 10-digit mobile number (you can add +91).'
    if (form.email.trim() && !EMAIL.test(form.email.trim())) errs.email = 'Enter an email like name@example.com, or leave it empty.'
    setErrors(errs); setFormError(null)
    if (Object.keys(errs).length) {
      document.getElementById(`reg-${Object.keys(errs)[0]}`)?.focus()
      return
    }
    setBusy(true)
    // Email is optional: the mobile number is enough to sign up.
    const email = form.email.trim()
    const input = { name: form.name.trim(), email, phone: form.phone.trim() }
    try {
      const res = await api.registerGuest(event.shortId, { name: input.name, phone: input.phone, ...(email ? { email } : {}) })
      guest.setProfile({ name: input.name, phone: input.phone, ...(email ? { email } : {}) })
      guest.patchSession(event.shortId, (s) => ({
        registration: { ...input, at: new Date().toISOString() },
        greeting: s.greeting ?? input.name.split(/\s+/)[0],
        auth: authFrom(res, s.auth),
      }))
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t sign you in')
      setFormError(`${f.title}. ${f.body}`)
      setBusy(false)
    }
  }

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }) }

  return (
    <GateFrame event={event}>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <div>
          <h2 className="text-[18px] font-extrabold">Tell the host who you are</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-2">So they know who’s looking at their photos.</p>
        </div>
        <Field label="Your name" htmlFor="reg-name" error={errors.name}>
          <Input id="reg-name" autoComplete="name" value={form.name} onChange={set('name')} placeholder="Priya Rao" className="h-11 text-[15px]" aria-invalid={!!errors.name} />
        </Field>
        <Field label="Mobile" htmlFor="reg-phone" error={errors.phone}>
          <Input id="reg-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98450 55012" value={form.phone} onChange={set('phone')} className="h-11 text-[15px]" aria-invalid={!!errors.phone} />
        </Field>
        {showEmail ? (
          <Field label="Email (optional)" htmlFor="reg-email" error={errors.email} hint="For your photo links and receipts.">
            <Input id="reg-email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} className="h-11 text-[15px]" aria-invalid={!!errors.email} />
          </Field>
        ) : (
          <TextButton className="-mt-1 self-start px-0" onClick={() => { setShowEmail(true); setTimeout(() => document.getElementById('reg-email')?.focus(), 0) }}>Add your email (optional)</TextButton>
        )}
        {formError && <p role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">{formError}</p>}
        <PrimaryButton type="submit" loading={busy}>Continue</PrimaryButton>
        <p className="text-center text-[12px] text-ink-3">Only {studio.name} and the host see your details.</p>
      </form>
    </GateFrame>
  )
}

/* ---------------------------------------------------------------- Web or app */

export function AppInterstitial({ event, studio }: { event: PublicEvent; studio: PublicStudio }) {
  const canInstall = useCanInstall()
  const [help, setHelp] = useState(false)
  const web = () => guest.patchSession(event.shortId, { webChosen: true })
  async function getApp() {
    if (canInstall) { if (await promptInstall()) web() }
    else setHelp(true)
  }
  return (
    <GateFrame event={event}>
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-extrabold">See your photos</h2>
        <PrimaryButton icon={<Globe size={17} />} onClick={web}>Continue on the web</PrimaryButton>
        <WideButton icon={<Smartphone size={17} />} onClick={() => void getApp()}>Get the app</WideButton>
        <p className="text-center text-[12.5px] text-ink-3">The app lets you follow {studio.name}’s events.</p>
      </div>
      <Sheet open={help} onOpenChange={setHelp} title="Add Frameline to your home screen" description="It works like an app, with no store download."
        footer={<WideButton onClick={() => { setHelp(false); web() }}>Continue on the web</WideButton>}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] text-ink-2">
          {isIOS()
            ? <><li>Tap the <b className="text-ink">Share</b> button in Safari.</li><li>Choose <b className="text-ink">Add to Home Screen</b>.</li></>
            : <><li>Open your browser menu (<b className="text-ink">⋮</b>).</li><li>Choose <b className="text-ink">Install app</b> or <b className="text-ink">Add to Home screen</b>.</li></>}
          <li>Open Frameline and enter the code <b className="text-ink">{event.shortId}</b>.</li>
        </ol>
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3"><Download size={14} />The Frameline app for Android and iPhone is on its way.</p>
      </Sheet>
    </GateFrame>
  )
}
