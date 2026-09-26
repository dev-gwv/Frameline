import { useMemo, useState, type ReactNode } from 'react'
import type { Tone } from '@frameline/shared'
import { toneCss } from '@frameline/shared'
import { encode } from 'uqr'
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
export function PhotoTile({ tone, url: givenUrl, label, selected, processing, hidden, aspect = '3 / 2', className, rounded = 'rounded-md', overlay, onClick, alt = '' }: PhotoTileProps) {
  const Comp = onClick ? 'button' : 'div'
  // Fall back to the colour tone when the file is gone (e.g. a stale object URL after reload).
  const [broken, setBroken] = useState(false)
  const url = givenUrl && !broken ? givenUrl : undefined
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('group relative block w-full overflow-hidden text-left', rounded, processing ? 'shimmer bg-sunk' : 'vignette', selected && 'outline outline-[3px] -outline-offset-[3px] outline-marker', className)}
      style={{ aspectRatio: aspect, background: processing ? undefined : url ? undefined : toneCss(tone) }}
    >
      {url && !processing && <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" loading="lazy" onError={() => setBroken(true)} />}
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

/* ---------------- QR code (real, scannable) ---------------- */
/**
 * Scannable QR code. Pass `value` (the URL to encode). `seed` is accepted for
 * backwards compatibility and encodes a placeholder URL when no value is given.
 * Error correction "Q" keeps it readable with a centre logo.
 */
export function QRCode({ value, seed = 0, size = 120, color = '#1B1712', rounded = false, logo }: {
  value?: string; seed?: number; size?: number; color?: string; rounded?: boolean; logo?: string
}) {
  const text = value ?? `https://frameline.in/q/${seed.toString(36)}`
  const qr = useMemo(() => encode(text, { ecc: logo ? 'H' : 'Q', border: 1 }), [text, logo])
  const n = qr.size
  const c = size / n
  const b = 1 // border modules
  const isFinder = (x: number, y: number) => {
    const inner = n - 2 * b
    const fx = x - b, fy = y - b
    return (fx >= 0 && fy >= 0 && fx < 7 && fy < 7) || (fx >= inner - 7 && fx < inner && fy >= 0 && fy < 7) || (fx >= 0 && fx < 7 && fy >= inner - 7 && fy < inner)
  }
  const finder = (fx: number, fy: number) => (
    <g key={`f-${fx}-${fy}`}>
      <rect x={fx * c} y={fy * c} width={7 * c} height={7 * c} rx={rounded ? c * 2 : 0} fill={color} />
      <rect x={(fx + 1) * c} y={(fy + 1) * c} width={5 * c} height={5 * c} rx={rounded ? c * 1.4 : 0} fill="#fff" />
      <rect x={(fx + 2) * c} y={(fy + 2) * c} width={3 * c} height={3 * c} rx={rounded ? c : 0} fill={color} />
    </g>
  )
  const inner = n - 2 * b
  const logoSize = size * 0.22
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code for ${text}`}>
      <rect width={size} height={size} fill="#fff" />
      {qr.data.flatMap((row, y) => row.map((on, x) => {
        if (!on || isFinder(x, y)) return null
        return rounded
          ? <circle key={`${x}-${y}`} cx={x * c + c / 2} cy={y * c + c / 2} r={c * 0.46} fill={color} />
          : <rect key={`${x}-${y}`} x={x * c} y={y * c} width={c + 0.2} height={c + 0.2} fill={color} />
      }))}
      {finder(b, b)}{finder(b + inner - 7, b)}{finder(b, b + inner - 7)}
      {logo && (
        <g>
          <rect x={(size - logoSize) / 2 - 4} y={(size - logoSize) / 2 - 4} width={logoSize + 8} height={logoSize + 8} rx={6} fill="#fff" />
          <image href={logo} x={(size - logoSize) / 2} y={(size - logoSize) / 2} width={logoSize} height={logoSize} preserveAspectRatio="xMidYMid meet" />
        </g>
      )}
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
