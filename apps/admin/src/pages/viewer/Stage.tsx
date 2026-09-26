import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { toneCss, type Photo } from '@frameline/shared'
import { cn } from '@frameline/ui'

export interface ViewState { scale: number; x: number; y: number; rotate: number; flip: boolean }
export const INITIAL_VIEW: ViewState = { scale: 1, x: 0, y: 0, rotate: 0, flip: false }
export const MIN_SCALE = 0.5

interface Props {
  photo: Photo
  url?: string
  view: ViewState
  setView: Dispatch<SetStateAction<ViewState>>
  showFaces: boolean
  personName: (id: string) => string
  watermark?: string
  /** Reports the scale at which one image pixel = one screen pixel. */
  onNaturalScale: (s: number) => void
  maxScale: number
}

export function Stage({ photo, url, view, setView, showFaces, personName, watermark, onNaturalScale, maxScale }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const W = photo.exif.width || 6000, H = photo.exif.height || 4000
  const sideways = Math.abs(view.rotate % 180) === 90
  const aspect = sideways ? H / W : W / H
  const availW = Math.max(100, size.w - 32), availH = Math.max(100, size.h - 32)
  const fitW = Math.min(availW, availH * aspect)
  const fitH = fitW / aspect
  // Unrotated element size (rotation swaps what we see).
  const elW = sideways ? fitH : fitW
  const elH = sideways ? fitW : fitH
  useEffect(() => { onNaturalScale(W / elW) }, [W, elW, onNaturalScale])

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left - r.width / 2, py = e.clientY - r.top - r.height / 2
      setView((v) => {
        const next = Math.min(maxScale, Math.max(MIN_SCALE, v.scale * Math.exp(-e.deltaY * 0.0015)))
        const k = next / v.scale
        return next <= 1 ? { ...v, scale: next, x: 0, y: 0 } : { ...v, scale: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView, maxScale])

  // Drag to pan when zoomed in.
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const zoomed = view.scale > 1

  return (
    <div ref={box} className={cn('relative h-full w-full touch-none select-none overflow-hidden', zoomed ? (drag.current ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default')}
      onPointerDown={(e) => { if (!zoomed) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y } }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setView((v) => ({ ...v, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onDoubleClick={() => setView((v) => (v.scale > 1 ? { ...v, scale: 1, x: 0, y: 0 } : { ...v, scale: 2.5 }))}
    >
      <div
        className={cn('absolute left-1/2 top-1/2 rounded-[3px] shadow-float', photo.status === 'processing' && 'shimmer bg-side-2')}
        style={{
          width: elW, height: elH, marginLeft: -elW / 2, marginTop: -elH / 2,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotate}deg) scaleX(${view.flip ? -1 : 1})`,
          transition: drag.current ? 'none' : 'transform 160ms ease-out',
          background: photo.status === 'processing' || url ? undefined : toneCss(photo.tone),
        }}
      >
        {url && photo.status !== 'processing' && <img src={url} alt={photo.filename} draggable={false} className="absolute inset-0 size-full rounded-[3px] object-contain" />}
        {showFaces && photo.faces.map((f, i) => {
          const name = personName(f.personId)
          return (
            <div key={i} className="absolute rounded-md border-[1.5px] border-side-gold" style={{ left: `${f.box[0] * 100}%`, top: `${f.box[1] * 100}%`, width: `${f.box[2] * 100}%`, height: `${f.box[3] * 100}%` }}>
              {name && (
                <span className="absolute -top-5 left-[-1.5px] whitespace-nowrap rounded bg-side-gold px-1.5 text-[10px] font-extrabold text-accent-ink" style={{ transform: view.flip ? 'scaleX(-1)' : undefined, transformOrigin: 'left' }}>{name}</span>
              )}
            </div>
          )
        })}
        {watermark && <div className="pointer-events-none absolute bottom-2.5 right-3.5 font-display text-[15px] text-white/70" style={{ transform: view.flip ? 'scaleX(-1)' : undefined }}>© {watermark}</div>}
      </div>
    </div>
  )
}
