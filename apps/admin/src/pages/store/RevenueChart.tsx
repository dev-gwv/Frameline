import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '@frameline/shared'
import type { DayPoint } from './revenue'

const niceStep = (max: number) => {
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}
const kLabel = (v: number) => (v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `₹${v}`)

/** Daily revenue bars, drawn to scale in pixel space so labels stay legible at any width. */
export function RevenueChart({ points }: { points: DayPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(620)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    setWidth(Math.max(280, Math.floor(el.clientWidth)))
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 180, top = 10, bottom = 24, left = 44
  const plotH = H - top - bottom
  const { step, yMax } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.revenue))
    const s = niceStep(max)
    return { step: s, yMax: s * 3 }
  }, [points])
  const plotW = width - left - 4
  const slot = plotW / points.length
  const barW = Math.max(2, Math.min(18, slot * 0.68))
  const y = (v: number) => top + plotH - (v / yMax) * plotH
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 70)))
  const h = hover !== null ? points[hover] : null

  return (
    <div ref={wrap} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}>
      <svg className="block" width={width} height={H} role="img" aria-label={`Daily revenue for the last ${points.length} days, total ${fmt.rupees(points.reduce((s, p) => s + p.revenue, 0))}`}>
        <defs>
          <linearGradient id="fl-rev-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--side-gold)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((k) => (
          <g key={k}>
            <line x1={left} x2={width} y1={y(k * step)} y2={y(k * step)} stroke="var(--line)" strokeDasharray={k === 0 ? undefined : '2 4'} />
            <text x={left - 6} y={y(k * step) + 3.5} fontSize="10" textAnchor="end" fill="var(--ink-3)" className="font-mono">{kLabel(k * step)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = left + i * slot + (slot - barW) / 2
          const bh = Math.max(p.revenue ? 2 : 0, (p.revenue / yMax) * plotH)
          const last = i === points.length - 1
          const r = Math.min(4, barW / 2, bh)
          return (
            <g key={p.iso}>
              {bh > 0 && (
                <path
                  d={`M${x},${top + plotH} V${top + plotH - bh + r} q0,-${r} ${r},-${r} H${x + barW - r} q${r},0 ${r},${r} V${top + plotH} Z`}
                  fill={last ? 'url(#fl-rev-gold)' : hover === i ? 'var(--accent)' : 'var(--accent-soft)'}
                  stroke={last || hover === i ? 'none' : 'var(--line-2)'} strokeWidth={0.5}
                />
              )}
              {/* Hit target wider and taller than the bar */}
              <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              {(i % labelEvery === 0 || last) && (points.length - 1 - i >= labelEvery * 0.9 || last) && (
                <text x={Math.min(width - 2, x + barW / 2)} y={H - 6} fontSize="10" textAnchor={last ? 'end' : 'middle'} fill="var(--ink-3)" className="font-mono">{fmt.dayMonth(p.iso)}</text>
              )}
            </g>
          )
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-control border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-card"
          style={{ left: Math.min(width - 70, Math.max(70, left + hover * slot + slot / 2)), top: Math.max(56, y(h.revenue) - 6) }}
        >
          <div className="font-bold">{fmt.date(h.iso)}</div>
          <div className="font-mono tnum">{fmt.rupees(h.revenue)} · {h.orders} {h.orders === 1 ? 'order' : 'orders'}</div>
          {h.usd > 0 && <div className="font-mono tnum text-ink-2">+ ${h.usd} international</div>}
        </div>
      )}
    </div>
  )
}
