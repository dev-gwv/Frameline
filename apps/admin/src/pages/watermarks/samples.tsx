import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@frameline/ui'

/*
 * Synthetic sample photos (gradient scenes with simple silhouettes). These are photo tones,
 * so hard-coded colours are allowed here — they stand in for real pictures.
 */
export interface Shape { l: string; t: string; w: string; h: string; r?: string; bg: string }
export interface Sample { id: string; name: string; orientation: 'portrait' | 'landscape'; bg: string; shapes: Shape[]; url?: string; ratio?: number }

const person = (l: string, t: string, w: string, h: string, dress: string, skin = '#efe6d6', hair = '#2a1a14'): Shape => ({
  l, t, w, h, r: '40% 40% 8% 8%', bg: `linear-gradient(180deg,${hair} 0 16%,${dress} 16% 70%,${skin} 70%)`,
})

export const SAMPLES: Sample[] = [
  { id: 's1', name: 'Bride at golden hour', orientation: 'portrait', bg: 'linear-gradient(180deg,#d9b06a,#a8733a 45%,#5b2e22 75%,#3a2419)', shapes: [person('34%', '14%', '34%', '74%', '#7a1f2b')] },
  { id: 's2', name: 'Couple by the lake', orientation: 'landscape', bg: 'linear-gradient(180deg,#8ec5fc,#c9b6f2 40%,#6e6a8e 62%,#2f3a4a)', shapes: [person('38%', '30%', '11%', '62%', '#f1e7d8'), person('50%', '26%', '12%', '66%', '#1f2433')] },
  { id: 's3', name: 'Haldi splash', orientation: 'portrait', bg: 'linear-gradient(160deg,#fff3c4,#e0a458 50%,#5b3a29)', shapes: [person('24%', '22%', '28%', '70%', '#f2c230'), person('54%', '28%', '26%', '64%', '#e8906b')] },
  { id: 's4', name: 'Sangeet dance floor', orientation: 'landscape', bg: 'linear-gradient(200deg,#2b2d42,#5c6378 45%,#8d99ae)', shapes: [{ l: '0%', t: '72%', w: '100%', h: '28%', bg: 'linear-gradient(180deg,#3a2f45,#1b1726)' }, person('18%', '34%', '10%', '56%', '#c0504d'), person('44%', '28%', '12%', '62%', '#e0a458'), person('70%', '36%', '10%', '54%', '#6b4f7a')] },
  { id: 's5', name: 'White studio portrait', orientation: 'portrait', bg: 'linear-gradient(180deg,#f7f3ec,#ece4d6 60%,#d8ccb8)', shapes: [person('30%', '18%', '40%', '76%', '#23303f', '#e9cdb4')] },
  { id: 's6', name: 'Mehendi hands', orientation: 'landscape', bg: 'linear-gradient(135deg,#d4a373,#faedcd 55%,#606c38)', shapes: [{ l: '22%', t: '30%', w: '26%', h: '44%', r: '45%', bg: 'radial-gradient(circle at 40% 40%,#b0703f,#7a4524)' }, { l: '52%', t: '34%', w: '24%', h: '40%', r: '45%', bg: 'radial-gradient(circle at 50% 40%,#b0703f,#7a4524)' }] },
  { id: 's7', name: 'Marathon finish', orientation: 'portrait', bg: 'linear-gradient(170deg,#f1faee,#a8dadc 45%,#1d3557)', shapes: [{ l: '0%', t: '8%', w: '100%', h: '10%', bg: '#e63946' }, person('36%', '28%', '28%', '66%', '#e76f51', '#c68b62')] },
  { id: 's8', name: 'Office keynote', orientation: 'landscape', bg: 'linear-gradient(180deg,#264653,#2a8a8f 55%,#0e2a30)', shapes: [{ l: '30%', t: '12%', w: '40%', h: '40%', r: '4px', bg: 'linear-gradient(135deg,#f4a261,#e9c46a)' }, person('14%', '46%', '9%', '48%', '#1b1b1b', '#c68b62')] },
  { id: 's9', name: 'Birthday candles', orientation: 'portrait', bg: 'linear-gradient(180deg,#3d2c3e,#b5838d 55%,#ffb4a2)', shapes: [{ l: '26%', t: '56%', w: '48%', h: '30%', r: '10px', bg: 'linear-gradient(180deg,#fff0f3,#f4acb7)' }, { l: '47%', t: '44%', w: '6%', h: '14%', r: '40%', bg: 'linear-gradient(180deg,#ffd166,#f77f00)' }] },
  { id: 's10', name: 'Beach walk', orientation: 'landscape', bg: 'linear-gradient(180deg,#ff9e7d,#ffd6a5 38%,#83c5be 60%,#e9d8a6)', shapes: [person('60%', '40%', '8%', '46%', '#264653', '#8a5a44')] },
]

export const aspectOf = (s: Sample) => s.ratio ?? (s.orientation === 'portrait' ? 2 / 3 : 3 / 2)

/**
 * A photo frame that is also a CSS size container, so overlays can size in `cqw`
 * (share of the photo width) and look identical at any preview size.
 */
export function PhotoFrame({ sample, children, className, style, fit }: { sample: Sample; children?: ReactNode; className?: string; style?: CSSProperties; fit?: 'height' | 'width' }) {
  const ratio = aspectOf(sample)
  const sizing: CSSProperties = fit === 'height'
    ? { height: '100%', maxWidth: '100%', width: 'auto' }
    : fit === 'width' ? { width: '100%', maxHeight: '100%' } : { width: '100%' }
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-[4px] shadow-card', className)}
      style={{ aspectRatio: String(ratio), background: sample.url ? '#111' : sample.bg, containerType: 'inline-size', ...sizing, ...style }}
    >
      <span className="sr-only">{sample.name}</span>
      {sample.url
        ? <img src={sample.url} alt="" className="absolute inset-0 size-full object-cover" />
        : sample.shapes.map((s, i) => <div key={i} className="absolute" style={{ left: s.l, top: s.t, width: s.w, height: s.h, borderRadius: s.r, background: s.bg }} />)}
      {children}
    </div>
  )
}
