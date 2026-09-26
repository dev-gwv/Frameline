import { useRef, useState, type CSSProperties } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { toneCss, type Photo } from '@frameline/shared'
import { cn } from '@frameline/ui'

function Layer({ photo, style }: { photo: Photo; style?: CSSProperties }) {
  return (
    <div className="absolute inset-0" style={{ background: photo.url ? undefined : toneCss(photo.tone), ...style }}>
      {photo.url && <img src={photo.url} alt="" className="size-full object-contain" draggable={false} />}
    </div>
  )
}

/** Before/after comparison with a draggable, keyboard-operable divider. */
export function Compare({ photo, filter, processing }: { photo: Photo; filter: string; processing?: boolean }) {
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const portrait = photo.exif.height > photo.exif.width

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      ref={box}
      className={cn('relative mx-auto w-full touch-none select-none overflow-hidden rounded-control bg-sunk', portrait ? 'max-w-[440px]' : '')}
      style={{ aspectRatio: `${photo.exif.width} / ${photo.exif.height}` }}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX) }}
      onPointerMove={(e) => { if (dragging.current) moveTo(e.clientX) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      <Layer photo={photo} />
      <Layer photo={photo} style={{ filter, clipPath: `inset(0 0 0 ${pos}%)`, transition: 'filter 300ms' }} />
      {processing && <div className="shimmer absolute inset-0" aria-hidden />}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-side-gold" style={{ left: `${pos}%` }} />
      <button
        type="button" role="slider" aria-label="Compare before and after" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% before`}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2
          if (e.key === 'ArrowLeft') { e.preventDefault(); setPos((p) => Math.max(0, p - step)) }
          if (e.key === 'ArrowRight') { e.preventDefault(); setPos((p) => Math.min(100, p + step)) }
          if (e.key === 'Home') { e.preventDefault(); setPos(0) }
          if (e.key === 'End') { e.preventDefault(); setPos(100) }
        }}
        className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-gold text-accent-ink shadow-float"
        style={{ left: `${pos}%` }}
      >
        <ArrowLeftRight size={16} />
      </button>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-side-gold">After</span>
    </div>
  )
}
