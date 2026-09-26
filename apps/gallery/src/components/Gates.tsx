import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Download, Globe, Lock, Smartphone, UserRound } from 'lucide-react'
import { Button, Field, Input, cn } from '@frameline/ui'
import { fmt, toneCss, type PhotoEvent, type Studio } from '@frameline/shared'
import { guest, type EventSession } from '../lib/guest'
import { MAX_PIN_TRIES, now, PIN_LOCK_MS } from '../lib/access'
import { isIOS, promptInstall, useCanInstall } from '../lib/pwa'
import { BrandButton } from './common'
import { Sheet } from './Sheet'

/** Compact event hero used above every gate. */
export function GateFrame({ event, studio, session, children }: { event: PhotoEvent; studio: Studio; session: EventSession; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-surface sm:my-8 sm:min-h-0 sm:overflow-hidden sm:rounded-[20px] sm:border sm:border-line sm:shadow-card">
      <div className="relative flex h-[230px] flex-col justify-end p-5 text-white" style={{ background: toneCss(event.coverTones[0]) }}>
        <div className="hero-fade absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 top-5 text-center font-display text-[11px] font-semibold uppercase tracking-[0.24em] pt-safe">{studio.name}</div>
        <div className="relative">
          {session.greeting && <div className="text-[12.5px] opacity-90">Welcome, {session.greeting}</div>}
          <h1 className="font-display text-[28px] font-semibold leading-[1.05]">{event.name}</h1>
          <div className="mt-1 text-[12.5px] opacity-90">{fmt.dateRange(event.date, event.endDate)} · {event.city}</div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </main>
  )
}

/* ---------------------------------------------------------------- PIN */

export function PinGate({ event, studio, session }: { event: PhotoEvent; studio: Studio; session: EventSession }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const lockedFor = session.pinLockedUntil ? session.pinLockedUntil - now() : 0
  const locked = lockedFor > 0
  const triesLeft = MAX_PIN_TRIES - session.pinTries

  useEffect(() => { if (!locked) refs.current[0]?.focus() }, [locked, shake])
  // Unlock automatically when the lock expires.
  const [, force] = useState(0)
  useEffect(() => {
    if (!locked) return
    const t = setTimeout(() => { guest.patchSession(event.shortId, { pinTries: 0, pinLockedUntil: undefined }); force((x) => x + 1) }, Math.min(lockedFor, 60_000))
    return () => clearTimeout(t)
  }, [locked, lockedFor, event.shortId])

  function check(pin: string) {
    if (pin === event.settings.pin) {
      guest.patchSession(event.shortId, { pin: 'typed', pinTries: 0, pinLockedUntil: undefined })
      return
    }
    const tries = session.pinTries + 1
    setShake((s) => s + 1)
    setDigits(['', '', '', ''])
    refs.current[0]?.focus()
    if (tries >= MAX_PIN_TRIES) {
      guest.patchSession(event.shortId, { pinTries: tries, pinLockedUntil: now() + PIN_LOCK_MS })
      setError(null)
    } else {
      guest.patchSession(event.shortId, { pinTries: tries })
      const left = MAX_PIN_TRIES - tries
      setError(`That PIN didn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
    }
  }

  function setAt(i: number, v: string) {
    const clean = v.replace(/\D/g, '')
    if (clean.length > 1) { // paste
      const next = clean.slice(0, 4).split('')
      while (next.length < 4) next.push('')
      setDigits(next)
      if (clean.length >= 4) check(clean.slice(0, 4))
      else refs.current[clean.length]?.focus()
      return
    }
    const next = [...digits]; next[i] = clean
    setDigits(next); setError(null)
    if (clean && i < 3) refs.current[i + 1]?.focus()
    if (next.every(Boolean)) check(next.join(''))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (digits.every(Boolean)) check(digits.join(''))
    else setError('Enter all 4 digits of the PIN.')
  }

  return (
    <GateFrame event={event} studio={studio} session={session}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent-text"><Lock size={15} /></span>
          <div>
            <h2 className="text-[16px]">Enter the gallery PIN</h2>
            <p className="text-[12.5px] text-ink-2">It's in the message {studio.name} sent you.</p>
          </div>
        </div>
        {locked ? (
          <div role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">
            Too many wrong PINs. Try again in {Math.ceil(lockedFor / 60_000)} min, or ask the host for the PIN.
          </div>
        ) : (
          <fieldset key={shake} className={cn('flex min-w-0 gap-2.5', shake > 0 && 'animate-shake')} aria-describedby="pin-help">
            <legend className="sr-only">4-digit PIN</legend>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el }}
                value={d}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digits[i] && i > 0) { refs.current[i - 1]?.focus() }
                  if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
                  if (e.key === 'ArrowRight' && i < 3) refs.current[i + 1]?.focus()
                }}
                inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={4} pattern="[0-9]*"
                aria-label={`PIN digit ${i + 1}`} aria-invalid={!!error}
                className={cn('h-14 w-0 min-w-0 flex-1 rounded-[10px] border bg-surface text-center font-mono text-[24px] font-semibold text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft',
                  error ? 'border-bad' : 'border-line-2')}
              />
            ))}
          </fieldset>
        )}
        <div id="pin-help" aria-live="polite" className={cn('min-h-5 text-[12.5px]', error ? 'font-semibold text-bad' : 'text-ink-3')}>
          {error ?? (!locked && session.pinTries > 0 ? `${triesLeft} tries left.` : '')}
        </div>
        <BrandButton type="submit" disabled={locked}>Continue</BrandButton>
        <p className="text-center text-[12px] text-ink-3">No PIN? Ask the host, or call {studio.name} at <a className="font-semibold text-ink-2 underline" href={`tel:${studio.phone.replace(/\s/g, '')}`}>{studio.phone}</a>.</p>
      </form>
    </GateFrame>
  )
}

/* ---------------------------------------------------------------- Registration */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const validPhone = (v: string) => { const d = v.replace(/[\s()-]/g, ''); return /^\+?\d{10,13}$/.test(d) }

export function RegistrationGate({ event, studio, session }: { event: PhotoEvent; studio: Studio; session: EventSession }) {
  const [form, setForm] = useState({ name: session.greeting ?? '', email: '', phone: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [busy, setBusy] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name so the host knows who you are.'
    if (!EMAIL.test(form.email.trim())) errs.email = 'Enter an email like name@example.com.'
    if (!validPhone(form.phone)) errs.phone = 'Enter a 10-digit mobile number (you can add +91).'
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]
      document.getElementById(`reg-${first}`)?.focus()
      return
    }
    setBusy(true)
    // TODO(api): api.registerGuest(event.id, { name, email, phone }) — no endpoint yet; stored on this device.
    setTimeout(() => {
      const name = form.name.trim()
      guest.patchSession(event.shortId, (s) => ({
        registration: { name, email: form.email.trim(), phone: form.phone.trim(), at: new Date().toISOString() },
        greeting: s.greeting ?? name.split(/\s+/)[0],
      }))
    }, 350)
  }

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }) }

  return (
    <GateFrame event={event} studio={studio} session={session}>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent-text"><UserRound size={15} /></span>
          <div>
            <h2 className="text-[16px]">Tell us who you are</h2>
            <p className="text-[12.5px] text-ink-2">The host asked guests to sign in once to see photos.</p>
          </div>
        </div>
        <Field label="Your name" htmlFor="reg-name" error={errors.name}>
          <Input id="reg-name" autoComplete="name" value={form.name} onChange={set('name')} className="h-11 text-[15px]" aria-invalid={!!errors.name} />
        </Field>
        <Field label="Email" htmlFor="reg-email" error={errors.email}>
          <Input id="reg-email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} className="h-11 text-[15px]" aria-invalid={!!errors.email} />
        </Field>
        <Field label="Mobile number" htmlFor="reg-phone" error={errors.phone} hint="We'll only use it to send you your photos.">
          <Input id="reg-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98xxx xxxxx" value={form.phone} onChange={set('phone')} className="h-11 text-[15px]" aria-invalid={!!errors.phone} />
        </Field>
        <BrandButton type="submit" loading={busy} className="mt-1">See the photos</BrandButton>
        <p className="text-center text-[11.5px] text-ink-3">Your details are shared with {studio.name} and the host only.</p>
      </form>
    </GateFrame>
  )
}

/* ---------------------------------------------------------------- App interstitial */

export function AppInterstitial({ event, studio, session }: { event: PhotoEvent; studio: Studio; session: EventSession }) {
  const canInstall = useCanInstall()
  const [help, setHelp] = useState(false)
  async function getApp() {
    if (canInstall) {
      const ok = await promptInstall()
      if (ok) guest.patchSession(event.shortId, { webChosen: true })
    } else setHelp(true)
  }
  return (
    <GateFrame event={event} studio={studio} session={session}>
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px]">How would you like to see your photos?</h2>
        <button type="button" onClick={getApp} className="flex items-center gap-3 rounded-card border border-line-2 bg-surface p-3.5 text-left hover:bg-sunk">
          <span className="grid size-10 place-items-center rounded-[10px] bg-side text-side-gold"><Smartphone size={19} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[14px]">Get the app</b>
            <span className="text-[12.5px] text-ink-2">Keep every event in one place. Event code <span className="font-mono font-semibold text-ink">{event.shortId}</span></span>
          </span>
        </button>
        <BrandButton icon={<Globe size={18} />} onClick={() => guest.patchSession(event.shortId, { webChosen: true })}>Continue on web</BrandButton>
        <p className="text-center text-[11.5px] text-ink-3">No download needed on the web.</p>
      </div>
      <Sheet open={help} onOpenChange={setHelp} title="Add Frameline to your home screen" description="It works like an app, with no store download."
        footer={<Button variant="primary" size="lg" className="w-full justify-center" onClick={() => { setHelp(false); guest.patchSession(event.shortId, { webChosen: true }) }}>Continue on web</Button>}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] text-ink-2">
          {isIOS()
            ? <><li>Tap the <b className="text-ink">Share</b> button in Safari.</li><li>Choose <b className="text-ink">Add to Home Screen</b>.</li></>
            : <><li>Open your browser menu (<b className="text-ink">⋮</b>).</li><li>Choose <b className="text-ink">Install app</b> or <b className="text-ink">Add to Home screen</b>.</li></>}
          <li>Open Frameline and enter code <b className="font-mono text-ink">{event.shortId}</b>.</li>
        </ol>
        <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-3"><Download size={13} />The Frameline app for Android and iPhone is on its way.</p>
      </Sheet>
    </GateFrame>
  )
}
