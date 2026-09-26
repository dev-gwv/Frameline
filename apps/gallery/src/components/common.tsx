import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Heart } from 'lucide-react'
import { cn, LogoMark, PhotoTile, Tip } from '@frameline/ui'
import type { Photo } from '@frameline/shared'

/** Icon-only button: always has an aria-label and a tooltip. */
export const IconBtn = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; dark?: boolean }>(
  function IconBtn({ label, dark, className, children, type = 'button', ...rest }, ref) {
    return (
      <Tip label={label}>
        <button
          ref={ref} type={type} aria-label={label}
          className={cn('grid size-10 shrink-0 place-items-center rounded-full transition-colors',
            dark ? 'text-side-ink hover:bg-side-2' : 'text-ink-2 hover:bg-sunk hover:text-ink', className)}
          {...rest}
        >
          {children}
        </button>
      </Tip>
    )
  },
)

/** The event's primary call to action, in the studio's brand colour (e.g. "Find my photos"). */
export const BrandButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; loading?: boolean }>(
  function BrandButton({ icon, loading, className, children, disabled, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref} type={type} disabled={disabled || loading}
        className={cn('bg-brand inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] px-5 text-[15px] font-bold shadow-card transition-[filter] hover:brightness-110 active:brightness-95 disabled:opacity-60', className)}
        {...rest}
      >
        {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : icon}
        {children}
      </button>
    )
  },
)

/** Full-page message (not found, expired, disabled…). */
export function StatePage({ icon, eyebrow, title, body, children }: { icon?: ReactNode; eyebrow?: string; title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Link to="/" className="mb-6 flex items-center gap-2 font-display text-[15px] font-semibold text-ink" aria-label="Frameline home"><LogoMark size={26} />Frameline</Link>
      {icon && <span className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-text">{icon}</span>}
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="font-display text-[26px] font-semibold leading-tight">{title}</h1>
      {body && <p className="max-w-sm text-[14px] text-ink-2">{body}</p>}
      {children && <div className="mt-3 flex w-full flex-col items-center gap-2">{children}</div>}
    </main>
  )
}

/** Sticky header for event sub-pages: back, studio name, favourites. */
export function TopBar({ back, studioName, favouritesTo, favCount, children }: {
  back: string; studioName: string; favouritesTo?: string; favCount?: number; children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/92 backdrop-blur-md pt-safe">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2 sm:px-5">
        <Tip label="Back">
          <Link to={back} aria-label="Back" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-sunk hover:text-ink"><ArrowLeft size={20} /></Link>
        </Tip>
        <span className="text-brand min-w-0 flex-1 truncate text-center font-display text-[11px] font-semibold uppercase tracking-[0.22em]">{studioName}</span>
        {children}
        {favouritesTo ? (
          <Tip label="Your favourites">
            <Link to={favouritesTo} aria-label={`Your favourites${favCount ? ` (${favCount})` : ''}`} className="relative grid size-10 place-items-center rounded-full text-ink-2 hover:bg-sunk hover:text-ink">
              <Heart size={19} />
              {!!favCount && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold px-1 font-mono text-[9.5px] font-bold text-accent-ink">{favCount}</span>}
            </Link>
          </Tip>
        ) : <span className="size-10" aria-hidden />}
      </div>
    </header>
  )
}

/** Square photo grid; 3 across on phones, more on wider screens. */
export function PhotoGrid({ photos, hrefFor, className, favourites }: { photos: Photo[]; hrefFor: (p: Photo) => string; className?: string; favourites?: string[] }) {
  return (
    <ul className={cn('grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-6', className)}>
      {photos.map((p) => (
        <li key={p.id} className="tile-auto relative">
          <Link to={hrefFor(p)} aria-label={`Open photo ${p.filename}`} className="block rounded-[4px] focus-visible:outline-offset-1">
            <PhotoTile tone={p.tone} url={p.url} aspect="1 / 1" rounded="rounded-[4px]" alt={p.filename} />
          </Link>
          {favourites?.includes(p.id) && <Heart size={14} className="pointer-events-none absolute right-1.5 top-1.5 fill-white text-white drop-shadow" aria-label="Favourite" />}
        </li>
      ))}
    </ul>
  )
}

export function GridSkeleton({ n = 18 }: { n?: number }) {
  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-6" aria-busy aria-label="Loading photos">
      {Array.from({ length: n }, (_, i) => <div key={i} className="shimmer aspect-square rounded-[4px] bg-sunk" />)}
    </div>
  )
}

/** Calls `onVisible` when scrolled into view (infinite loading). */
/** `watch` re-arms the observer (e.g. the number of loaded items) so a still-visible sentinel keeps loading. */
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

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 sm:px-7', className)}>{children}</div>
}
