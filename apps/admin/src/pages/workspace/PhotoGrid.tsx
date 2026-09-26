import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Heart, Wand2 } from 'lucide-react'
import type { Photo } from '@frameline/shared'
import { PhotoTile, Tip, cn } from '@frameline/ui'
import { liveUrl } from './lib'

interface Props {
  photos: Photo[]
  selected: Set<string>
  /** Toggle selection at index; `range` extends from the last anchor (shift-click). */
  onToggle: (index: number, range: boolean) => void
  onOpen: (photo: Photo) => void
}

export const GRID_COLS = 'grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7'

export function PhotoGrid({ photos, selected, onToggle, onOpen }: Props) {
  return (
    <div className={GRID_COLS}>
      {photos.map((p, i) => (
        <Tile key={p.id} photo={p} index={i} selected={selected.has(p.id)} selecting={selected.size > 0} onToggle={onToggle} onOpen={onOpen} />
      ))}
    </div>
  )
}

function Tile({ photo, index, selected, selecting, onToggle, onOpen }: { photo: Photo; index: number; selected: boolean; selecting: boolean } & Pick<Props, 'onToggle' | 'onOpen'>) {
  const navigate = useNavigate()
  const press = useRef<{ timer?: number; fired: boolean }>({ fired: false })
  const processing = photo.status === 'processing'

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    press.current.fired = false
    press.current.timer = window.setTimeout(() => { press.current.fired = true; onToggle(index, false); navigator.vibrate?.(15) }, 450)
  }
  const cancelPress = () => { if (press.current.timer) window.clearTimeout(press.current.timer) }
  const onClick = (e: MouseEvent) => {
    if (press.current.fired) { press.current.fired = false; return }
    if (e.shiftKey) return onToggle(index, true)
    if (e.metaKey || e.ctrlKey || selecting) return onToggle(index, false)
    if (!processing) onOpen(photo)
  }

  return (
    <div className="group/tile relative" onContextMenu={(e) => { if (press.current.fired) e.preventDefault() }}>
      <PhotoTile tone={photo.tone} url={liveUrl(photo.url)} selected={selected} processing={processing} hidden={photo.hidden} alt={photo.filename} />
      <button
        type="button" aria-label={`Open ${photo.filename}`} aria-pressed={selecting ? selected : undefined}
        className="absolute inset-0 z-[4] rounded-md" onClick={onClick}
        onPointerDown={onPointerDown} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
      />
      {!processing && (
        <span className="pointer-events-none absolute inset-0 z-[5] flex flex-col justify-between rounded-md bg-gradient-to-b from-black/35 via-transparent to-black/60 p-1.5 opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
          <span className="truncate pr-6 font-mono text-[9.5px] text-white">{photo.filename}</span>
          <span className="flex items-center justify-between text-white">
            <span className="font-mono text-[9.5px]">#{photo.index}</span>
            <span className="flex items-center gap-1 pr-6 text-[10px] font-bold"><Heart size={11} />{photo.favourites}</span>
          </span>
        </span>
      )}
      {!processing && (
        <Tip label="AI enhance">
          <button type="button" aria-label={`AI enhance ${photo.filename}`} onClick={() => navigate(`/enhance/${photo.id}`)}
            className="absolute bottom-1 right-1 z-[6] grid size-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover/tile:opacity-100">
            <Wand2 size={12} />
          </button>
        </Tip>
      )}
      <button
        type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${photo.filename}`}
        onClick={(e) => onToggle(index, e.shiftKey)}
        className={cn('absolute right-1 top-1 z-[6] grid size-[20px] place-items-center rounded-full border-2 transition-opacity',
          selected ? 'border-transparent bg-gold text-accent-ink opacity-100' : 'border-white/90 bg-black/30 text-transparent opacity-0 hover:text-white focus-visible:opacity-100 group-hover/tile:opacity-100',
          selecting && 'opacity-100')}
      >
        <Check size={12} strokeWidth={3} />
      </button>
    </div>
  )
}
