import { forwardRef, useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Heart, WifiOff } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, cn, Input, LogoMark, PhotoTile, Tip, type ButtonProps } from '@frameline/ui'
import { fmt, toneCss, type Photo, type PublicEvent } from '@frameline/shared'
import { useApi } from '../lib/api'
import { SaleMark } from './SaleWatermark'
import { friendlyError, isNotFound } from '../lib/errors'

/** Icon-only button (only for back / close / ⋯): always has an aria-label and a tooltip. */
export const IconBtn = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; dark?: boolean }>(
  function IconBtn({ label, dark, className, children, type = 'button', ...rest }, ref) {
    return (
      <Tip label={label}>
        <button
          ref={ref} type={type} aria-label={label}
          className={cn('grid size-11 shrink-0 place-items-center rounded-full transition-colors',
            dark ? 'text-side-ink hover:bg-side-2' : 'text-ink-2 hover:bg-sunk hover:text-ink', className)}
          {...rest}
        >
          {children}
        </button>
      </Tip>
    )
  },
)

/** The one gold action on a screen: full width, 46px on phones. */
export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function PrimaryButton({ className, ...rest }, ref) {
  return <Button ref={ref} variant="primary" size="lg" className={cn('h-[46px] w-full justify-center text-[15px]', className)} {...rest} />
})

/** Outlined full-width companion to PrimaryButton (44px). */
export const WideButton = forwardRef<HTMLButtonElement, ButtonProps>(function WideButton({ className, ...rest }, ref) {
  return <Button ref={ref} size="lg" className={cn('h-11 w-full justify-center', className)} {...rest} />
})

/** Classes for an <a>/<Link> that looks like a full-width button (no <button> inside <a>). */
export function linkBtn(variant: 'primary' | 'secondary' = 'secondary', className?: string) {
  return cn(
    'inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border px-5 font-bold transition-[background,filter]',
    variant === 'primary'
      ? 'h-[46px] border-transparent bg-gold text-[15px] text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_1px_2px_rgba(110,70,10,.3)] hover:brightness-105'
      : 'h-11 border-line-2 bg-surface text-[14px] text-ink hover:bg-sunk',
    className,
  )
}

/** Plain gold-text link-style button ("Not you? Retake", "See your orders"). */
export function TextButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn('inline-flex min-h-11 items-center justify-center gap-1.5 px-2 text-[13.5px] font-extrabold text-accent-text hover:underline', className)} {...rest} />
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-6', className)}>{children}</div>
}

/* ---------------------------------------------------------------- Hero */

/** Event cover with studio name, event name (the page title) and dates · place. */
export function EventHero({ event, size = 'lg', children }: { event: PublicEvent; size?: 'lg' | 'sm'; children?: ReactNode }) {
  return (
    <section className={cn('relative flex flex-col justify-end text-white', size === 'lg' ? 'min-h-[220px] sm:min-h-[320px]' : 'min-h-[150px] sm:min-h-[190px]')}
      style={{ background: toneCss(event.coverTones[0]) }}>
      {event.coverUrl && <img src={event.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />}
      <div className="hero-fade absolute inset-0" aria-hidden />
      {children}
      <Container className="relative pb-4 pt-safe sm:pb-6">
        <div className="text-[12.5px] font-semibold opacity-90">{event.studio.name}</div>
        <h1 className={cn('font-display font-semibold leading-[1.1]', size === 'lg' ? 'text-[28px] sm:text-[40px]' : 'text-[23px] sm:text-[30px]')}>{event.name}</h1>
        <div className="mt-0.5 text-[13px] opacity-90">{fmt.dateRange(event.date, event.endDate)} · {event.city}</div>
      </Container>
    </section>
  )
}

/* ---------------------------------------------------------------- Page top bar */

/** White bar with Back and the screen name (phones); a title row on wider screens. */
export function PageTop({ back, title, right, sticky = true }: { back: string; title: ReactNode; right?: ReactNode; sticky?: boolean }) {
  return (
    <div className={cn('z-20 border-b border-line bg-surface md:border-0 md:bg-transparent', sticky && 'sticky top-0 md:static')}>
      <Container className="flex min-h-[52px] items-center gap-1 px-2 sm:px-6 md:min-h-0 md:px-6 md:pt-6">
        <Tip label="Back">
          <Link to={back} aria-label="Back" className="-ml-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-sunk hover:text-ink md:-ml-3"><ArrowLeft size={20} /></Link>
        </Tip>
        <h1 className="min-w-0 flex-1 truncate font-sans text-[16px] font-extrabold md:font-display md:text-[28px] md:font-semibold">{title}</h1>
        {right}
      </Container>
    </div>
  )
}

/* ---------------------------------------------------------------- Photo grid */

/** Square photo grid; 3 across on phones, more on wider screens. */
/** With `shortId`, photos for sale (and not bought) carry the "For sale" preview watermark. */
export function PhotoGrid({ photos, hrefFor, className, favourites, shortId, logoUrl }: { photos: Photo[]; hrefFor: (p: Photo) => string; className?: string; favourites?: string[]; shortId?: string; logoUrl?: string }) {
  return (
    <ul className={cn('grid grid-cols-3 gap-[3px] sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-6', className)}>
      {photos.map((p) => (
        <li key={p.id} className="tile-auto relative overflow-hidden rounded-[3px]">
          <Link to={hrefFor(p)} aria-label={`Open photo ${p.filename}`} className="block rounded-[3px] focus-visible:outline-offset-1">
            <PhotoTile tone={p.tone} url={p.url} rotation={p.rotation} aspect="1 / 1" rounded="rounded-[3px]" alt={p.filename} />
          </Link>
          {shortId && <SaleMark shortId={shortId} photoId={p.id} logoUrl={logoUrl} />}
          {favourites?.includes(p.id) && <Heart size={14} className="pointer-events-none absolute right-1.5 top-1.5 fill-white text-white drop-shadow" aria-label="Favourite" />}
        </li>
      ))}
    </ul>
  )
}

export function GridSkeleton({ n = 18 }: { n?: number }) {
  return (
    <div className="grid grid-cols-3 gap-[3px] sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-6" aria-busy aria-label="Loading photos">
      {Array.from({ length: n }, (_, i) => <div key={i} className="shimmer aspect-square rounded-[3px] bg-sunk" />)}
    </div>
  )
}

/** Calls `onVisible` when scrolled into view (infinite loading). `watch` re-arms the observer. */
export function Sentinel({ onVisible, disabled, watch }: { onVisible: () => void; disabled?: boolean; watch?: unknown }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onVisible)
  cb.current = onVisible
  useEffect(() => {
    const el = ref.current
    if (!el || disabled) return
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) cb.current() }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [disabled, watch])
  return <div ref={ref} aria-hidden className="h-4" />
}

/* ---------------------------------------------------------------- States */

/** Round icon above a state message. */
export function StateIcon({ tone = 'gold', children }: { tone?: 'gold' | 'warn' | 'neutral' | 'ok' | 'bad'; children: ReactNode }) {
  const t = { gold: 'bg-accent-soft text-accent-text', warn: 'bg-warn-soft text-warn', neutral: 'bg-sunk text-ink-2', ok: 'bg-ok-soft text-ok', bad: 'bg-bad-soft text-bad' }[tone]
  return <span className={cn('grid size-14 place-items-center rounded-full', t)} aria-hidden>{children}</span>
}

/** Centred message: why it happened, and one way forward. */
export function StateBlock({ icon, tone, title, body, children, className }: { icon?: ReactNode; tone?: 'gold' | 'warn' | 'neutral' | 'ok' | 'bad'; title: ReactNode; body?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto flex w-full max-w-sm flex-col items-center gap-2 py-10 text-center', className)}>
      {icon && <div className="mb-1"><StateIcon tone={tone}>{icon}</StateIcon></div>}
      <h2 className="text-[18px] font-extrabold leading-snug">{title}</h2>
      {body && <p className="text-[14px] text-ink-2">{body}</p>}
      {children && <div className="mt-3 flex w-full flex-col items-stretch gap-2">{children}</div>}
    </div>
  )
}

/** Full-page message without an event (not found, broken link, route error). */
export function StatePage({ icon, tone, title, body, children }: { icon?: ReactNode; tone?: 'gold' | 'warn' | 'neutral' | 'ok' | 'bad'; title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <Container className="flex h-14 items-center">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-extrabold text-ink" aria-label="Frameline home"><LogoMark size={26} />Frameline</Link>
      </Container>
      <div className="flex flex-1 items-start justify-center px-4 pt-[8vh]">
        <div className="w-full max-w-md rounded-card border border-line bg-surface px-5 shadow-card">
          <StateBlock icon={icon} tone={tone} title={title} body={body}>{children}</StateBlock>
        </div>
      </div>
    </main>
  )
}

/** Error state for a failed list: says what went wrong in plain words, with a retry. */
export function LoadError({ error, onRetry, title = 'Photos didn’t load' }: { error: unknown; onRetry: () => void; title?: string }) {
  const f = friendlyError(error, title)
  return (
    <StateBlock icon={<WifiOff size={24} />} tone="neutral" title={f.code === 'unknown' ? title : f.title} body={f.body}>
      <WideButton onClick={onRetry}>Try again</WideButton>
    </StateBlock>
  )
}

/* ---------------------------------------------------------------- Event code form */

export const cleanCode = (raw: string) => raw.trim().replace(/^.*frameline\.in\//i, '').replace(/[^0-9a-z]/gi, '').toUpperCase()

/** "Enter the event code" field + Open button. Checks the code with getPublicEvent before navigating. */
export function CodeForm({ primary = true, initial = '', autoFocus }: { primary?: boolean; initial?: string; autoFocus?: boolean }) {
  const api = useApi()
  const navigate = useNavigate()
  const [code, setCode] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function open(e: FormEvent) {
    e.preventDefault()
    const c = cleanCode(code)
    if (c.length < 6) { setError('Enter the 7-character code from your invite, like 6402F9F.'); return }
    setBusy(true)
    try {
      await api.getPublicEvent(c)
      navigate(`/${c.toLowerCase()}`)
    } catch (err) {
      if (isNotFound(err)) setError(`No gallery uses the code ${c}. Check it against your invite.`)
      else { const f = friendlyError(err); setError(`${f.title}. ${f.body}`) }
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={open} className="flex w-full flex-col gap-2 text-left" noValidate>
      <label htmlFor="event-code" className="text-[12.5px] font-bold text-ink-2">Event code</label>
      <Input id="event-code" value={code} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="6402F9F" maxLength={40} autoFocus={autoFocus}
        onChange={(e) => { setCode(e.target.value); setError(null) }} aria-invalid={!!error} aria-describedby={error ? 'event-code-err' : undefined}
        className="h-12 text-[18px] font-bold uppercase tracking-[0.12em] placeholder:font-semibold" />
      {error && <p id="event-code-err" role="alert" className="text-[12.5px] font-semibold text-bad">{error}</p>}
      {primary
        ? <PrimaryButton type="submit" loading={busy} iconRight={<ArrowRight size={16} />} className="mt-1">Open gallery</PrimaryButton>
        : <WideButton type="submit" loading={busy} iconRight={<ArrowRight size={16} />} className="mt-1">Open gallery</WideButton>}
    </form>
  )
}

/* ---------------------------------------------------------------- Online / offline */

const onlineSub = (fn: () => void) => { window.addEventListener('online', fn); window.addEventListener('offline', fn); return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn) } }
export const useOnline = () => useSyncExternalStore(onlineSub, () => navigator.onLine, () => true)

/** Shown above the page while offline: photos already opened stay on screen. */
export function OfflineBanner({ forced }: { forced?: boolean }) {
  const online = useOnline()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  if (online && !forced) return null
  async function retry() {
    setBusy(true)
    try { await qc.refetchQueries({ type: 'active' }) } finally { setBusy(false) }
  }
  return (
    <div role="status" className="border-b border-line bg-surface">
      <Container className="flex items-center gap-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk text-ink-2"><WifiOff size={17} /></span>
        <div className="min-w-0 flex-1 text-[13px]">
          <b className="block">You seem to be offline</b>
          <span className="text-ink-2">Photos you’ve opened are still here. We’ll load the rest when you’re back.</span>
        </div>
        <Button size="md" loading={busy} onClick={() => void retry()} className="h-11">Try again</Button>
      </Container>
    </div>
  )
}

/** Album filter (a toggle, not a status chip). */
export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-bold transition sm:h-9',
        on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-2 bg-surface text-ink-2 hover:text-ink')}>
      {children}
    </button>
  )
}
