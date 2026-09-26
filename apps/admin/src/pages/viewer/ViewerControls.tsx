import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  FlipHorizontal2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, ScanFace, ZoomIn, ZoomOut,
} from 'lucide-react'
import { toneCss, type Photo } from '@frameline/shared'
import { Tip, cn } from '@frameline/ui'
import { liveUrl } from '../workspace/lib'

/** Dark pill button used across the viewer chrome. */
export function VBtn({ label, icon, children, onClick, active, danger, primary, tip, className, ...rest }: {
  label: string; icon?: ReactNode; children?: ReactNode; onClick?: () => void; active?: boolean; danger?: boolean; primary?: boolean; tip?: string; className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'>) {
  const btn = (
    <button type="button" aria-label={children ? undefined : label} onClick={onClick} {...rest}
      className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-bold transition-colors disabled:opacity-40',
        primary ? 'bg-gold text-accent-ink hover:brightness-105' : 'text-side-ink hover:bg-side-2',
        active && 'text-side-gold', danger && 'text-bad', className)}>
      {icon}{children}
    </button>
  )
  return children && !tip ? btn : <Tip label={tip ?? label}>{btn}</Tip>
}

export const Sep = () => <span className="mx-0.5 h-[18px] w-px shrink-0 bg-side-line" aria-hidden />

export function BottomToolbar({ playing, onPlay, onZoomOut, onFit, onZoomIn, on100, fullscreen, onFullscreen, onRotate, onFlip, onReset, faces, onFaces, zoomPct }: {
  playing: boolean; onPlay: () => void; onZoomOut: () => void; onFit: () => void; onZoomIn: () => void; on100: () => void
  fullscreen: boolean; onFullscreen: () => void; onRotate: (d: -90 | 90) => void; onFlip: () => void; onReset: () => void; faces: boolean; onFaces: () => void; zoomPct: number
}) {
  return (
    <div role="toolbar" aria-label="View controls" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-card border border-side-line bg-side-2 px-2 py-1 scrollbar-thin">
      <VBtn label="Slideshow (Space)" primary icon={playing ? <Pause size={12} /> : <Play size={12} />} onClick={onPlay} tip="Slideshow · Space">{playing ? 'Pause' : 'Slideshow'}</VBtn>
      <Sep />
      <VBtn label="Zoom out" icon={<ZoomOut size={13} />} onClick={onZoomOut} />
      <VBtn label="Fit to screen" onClick={onFit} tip="Fit to screen">Fit</VBtn>
      <VBtn label="Zoom in" icon={<ZoomIn size={13} />} onClick={onZoomIn} />
      <VBtn label="Actual pixels" onClick={on100} tip="Actual pixels">100%</VBtn>
      <span className="w-10 shrink-0 text-center font-mono text-[10.5px] text-side-ink-2" aria-live="polite">{zoomPct}%</span>
      <VBtn label={fullscreen ? 'Exit full screen' : 'Full screen'} icon={fullscreen ? <Minimize size={13} /> : <Maximize size={13} />} onClick={onFullscreen} />
      <Sep />
      <VBtn label="Rotate left" icon={<RotateCcw size={13} />} onClick={() => onRotate(-90)} />
      <VBtn label="Rotate right" icon={<RotateCw size={13} />} onClick={() => onRotate(90)} />
      <VBtn label="Flip horizontally" icon={<FlipHorizontal2 size={13} />} onClick={onFlip} />
      <VBtn label="Reset zoom, rotation and flip" onClick={onReset} tip="Reset all">Reset</VBtn>
      <Sep />
      <VBtn label="Face boxes (F)" icon={<ScanFace size={13} />} active={faces} onClick={onFaces} tip="Face boxes · F" aria-pressed={faces}>Face boxes {faces ? 'on' : 'off'}</VBtn>
    </div>
  )
}

export function Filmstrip({ photos, currentId, onPick }: { photos: Photo[]; currentId: string; onPick: (p: Photo) => void }) {
  return (
    <div className="flex justify-center gap-1.5 overflow-x-auto px-4 scrollbar-thin" aria-label="Nearby photos">
      {photos.map((p) => {
        const url = liveUrl(p.url)
        const cur = p.id === currentId
        return (
          <button key={p.id} type="button" aria-label={p.filename} aria-current={cur || undefined} onClick={() => onPick(p)}
            className={cn('relative h-[38px] w-[58px] shrink-0 overflow-hidden rounded', cur ? 'outline outline-2 outline-offset-1 outline-side-gold' : 'opacity-60 hover:opacity-100', p.status === 'processing' && 'shimmer bg-side-2')}
            style={{ background: p.status === 'processing' || url ? undefined : toneCss(p.tone) }}>
            {url && p.status !== 'processing' && <img src={url} alt="" className="absolute inset-0 size-full object-cover" />}
          </button>
        )
      })}
    </div>
  )
}

