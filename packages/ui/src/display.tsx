import { useMemo, type ReactNode } from 'react'
import type { Tone } from '@frameline/shared'
import { toneCss } from '@frameline/shared'
import { cn } from './primitives'

/* ---------------- Photo tile ---------------- */
export interface PhotoTileProps {
  tone: Tone
  url?: string
  label?: string // frame number or filename shown bottom-left
  selected?: boolean
  processing?: boolean
  hidden?: boolean
  aspect?: string // CSS aspect ratio, default 3/2
  className?: string
  rounded?: string
  overlay?: ReactNode // hover content
  onClick?: () => void
  alt?: string
}
export function PhotoTile({ tone, url, label, selected, processing, hidden, aspect = '3 / 2', className, rounded = 'rounded-md', overlay, onClick, alt = '' }: PhotoTileProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('group relative block w-full overflow-hidden text-left', rounded, processing ? 'shimmer bg-sunk' : 'vignette', selected && 'outline outline-[3px] -outline-offset-[3px] outline-marker', className)}
      style={{ aspectRatio: aspect, background: processing ? undefined : url ? undefined : toneCss(tone) }}
    >
      {url && !processing && <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" loading="lazy" />}
      {hidden && !processing && <span className="absolute inset-0 z-[1] bg-black/45" aria-hidden />}
      {label && <span className={cn('absolute bottom-1 left-1.5 z-[2] font-mono text-[9.5px] tracking-wide', processing ? 'text-ink-3' : 'text-white/85')}>{processing ? 'processing' : label}</span>}
      {hidden && !processing && <span className="absolute left-1.5 top-1.5 z-[2] rounded bg-black/60 px-1.5 py-0.5 text-[9.5px] font-bold text-white">Hidden</span>}
      {selected && <span className="absolute right-1.5 top-1.5 z-[3] grid size-[18px] place-items-center rounded-full bg-gold text-[11px] font-extrabold text-accent-ink">✓</span>}
      {overlay && !processing && <span className="absolute inset-0 z-[2] flex flex-col justify-between bg-gradient-to-b from-transparent via-transparent to-black/55 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{overlay}</span>}
    </Comp>
  )
}

/** Three-photo mosaic used as an event cover. */
export function CoverMosaic({ tones, className, empty }: { tones: [Tone, Tone, Tone]; className?: string; empty?: ReactNode }) {
  if (empty) return <div className={cn('grid place-items-center bg-sunk text-ink-3', className)}>{empty}</div>
  return (
    <div className={cn('grid grid-cols-[2fr_1fr] gap-0.5', className)}>
      <div style={{ background: toneCss(tones[0]) }} />
      <div className="grid gap-0.5">
        <div style={{ background: toneCss(tones[1]) }} />
        <div style={{ background: toneCss(tones[2]) }} />
      </div>
    </div>
  )
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({ points, width = 80, height = 26 }: { points: number[]; width?: number; height?: number }) {
  const { d, end } = useMemo(() => {
    const mx = Math.max(...points), mn = Math.min(...points)
    const xs = points.map((p, i) => [i * (width / (points.length - 1)), height - 3 - ((p - mn) / (mx - mn || 1)) * (height - 6)] as const)
    return { d: xs.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), end: xs[xs.length - 1] }
  }, [points, width, height])
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={`${d} L${width} ${height} L0 ${height}Z`} fill="var(--accent-soft)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      <circle cx={end[0]} cy={end[1]} r="2.6" fill="var(--accent)" />
    </svg>
  )
}

/* ---------------- Stat card ---------------- */
export function StatCard({ label, value, trend, spark, sub, className }: { label: ReactNode; value: ReactNode; trend?: string; spark?: number[]; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface p-4', className)}>
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className="font-display text-[25px] font-semibold tnum leading-tight tracking-tight">{value}</div>
      {(trend || spark || sub) && (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          {trend ? <span className="text-[11.5px] font-bold text-ok">{trend}</span> : <span className="text-[12px] text-ink-3">{sub}</span>}
          {spark && <Sparkline points={spark} />}
        </div>
      )}
    </div>
  )
}

/* ---------------- Page header ---------------- */
export function PageHeader({ title, subtitle, crumb, actions, className }: { title: ReactNode; subtitle?: ReactNode; crumb?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-5 sm:px-7 sm:pt-6', className)}>
      <div className="min-w-0">
        {crumb && <div className="mb-0.5 text-[12px] text-ink-3">{crumb}</div>}
        <h1 className="font-display text-[25px] font-semibold leading-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-[13px] text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------- Setting row ---------------- */
export function SettingRow({ icon, title, description, control, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; control?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3.5 border-t border-line py-3 first:border-t-0', className)}>
      {icon && <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">{title}</div>
        {description && <div className="text-[12px] text-ink-2">{description}</div>}
      </div>
      {control}
    </div>
  )
}

/* ---------------- Empty & error states ---------------- */
export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      {icon && <span className="mb-1 grid size-14 place-items-center rounded-full bg-accent-soft text-accent-text">{icon}</span>}
      <div className="font-display text-[18px] font-semibold">{title}</div>
      {body && <p className="max-w-sm text-[13px] text-ink-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md bg-sunk', className)} />
}

/* ---------------- Logo ---------------- */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-[7px] bg-side-2 shadow-[inset_0_0_0_1px_rgba(226,180,88,.35)]', className)} style={{ width: size, height: size }} aria-hidden>
      <span className="relative block rounded-[2px] bg-gold" style={{ width: size * 0.54, height: size * 0.38 }}>
        <span className="absolute rounded-[1px] bg-side-2" style={{ inset: `${size * 0.08}px ${size * 0.11}px` }} />
      </span>
    </span>
  )
}

/* ---------------- QR code (decorative until a real encoder is wired) ---------------- */
export function QRCode({ seed, size = 120, color = '#1B1712', rounded = false }: { seed: number; size?: number; color?: string; rounded?: boolean }) {
  const cells = useMemo(() => {
    let x = seed * 9301 + 49297
    const r = () => (x = (x * 9301 + 49297) % 233280) / 233280
    const out: [number, number][] = []
    for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) {
      const inFinder = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12)
      if (!inFinder && r() > 0.52) out.push([i, j])
    }
    return out
  }, [seed])
  const c = size / 21
  const finder = (a: number, b: number) => (
    <g key={`${a}-${b}`}>
      <rect x={a * c} y={b * c} width={7 * c} height={7 * c} rx={rounded ? c * 2 : 0} fill={color} />
      <rect x={(a + 1) * c} y={(b + 1) * c} width={5 * c} height={5 * c} rx={rounded ? c * 1.4 : 0} fill="#fff" />
      <rect x={(a + 2) * c} y={(b + 2) * c} width={3 * c} height={3 * c} rx={rounded ? c : 0} fill={color} />
    </g>
  )
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code">
      <rect width={size} height={size} fill="#fff" />
      {cells.map(([i, j]) => rounded
        ? <circle key={`${i}-${j}`} cx={i * c + c / 2} cy={j * c + c / 2} r={c * 0.45} fill={color} />
        : <rect key={`${i}-${j}`} x={i * c} y={j * c} width={c} height={c} fill={color} />)}
      {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    </svg>
  )
}

/* ---------------- Status chip for events ---------------- */
import type { EventStatus } from '@frameline/shared'
import { Chip } from './primitives'
export function EventStatusChip({ status, expiresInDays }: { status: EventStatus; expiresInDays?: number }) {
  switch (status) {
    case 'live': return <Chip tone="ok" dot>Live</Chip>
    case 'uploading': return <Chip tone="accent" dot>Uploading</Chip>
    case 'expiring': return <Chip tone="warn" dot>{expiresInDays !== undefined ? `Expires in ${expiresInDays} days` : 'Expiring'}</Chip>
    case 'draft': return <Chip>Draft</Chip>
    case 'archived': return <Chip>Archived</Chip>
  }
}
