import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { Check, Heart } from 'lucide-react'
import type { Photo } from '@frameline/shared'
import { PhotoTile, cn } from '@frameline/ui'
import { liveUrl } from './lib'

interface Props {
  photos: Photo[]
  selected: Set<string>
  /** Toggle selection at index; `range` extends from the last anchor (shift-click). */
  onToggle: (index: number, range: boolean) => void
  onOpen: (photo: Photo) => void
  /** Select mode: clicks toggle instead of opening. */
  selecting?: boolean
}

export const GRID_COLS = 'grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5 xl:grid-cols-6'

export function PhotoGrid({ photos, selected, onToggle, onOpen, selecting }: Props) {
  return (
    <div className={GRID_COLS}>
      {photos.map((p, i) => (
        <Tile key={p.id} photo={p} index={i} selected={selected.has(p.id)} selecting={!!selecting || selected.size > 0} onToggle={onToggle} onOpen={onOpen} />
      ))}
    </div>
  )
}

function Tile({ photo, index, selected, selecting, onToggle, onOpen }: { photo: Photo; index: number; selected: boolean; selecting: boolean } & Pick<Props, 'onToggle' | 'onOpen'>) {
  const press = useRef<{ timer?: number; fired: boolean }>({ fired: false })
  const processing = photo.status === 'processing'

  // Touch: long-press selects (then taps add to the selection).
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
      <PhotoTile tone={photo.tone} url={liveUrl(photo.url)} rotation={photo.rotation} selected={selected} processing={processing} hidden={photo.hidden} alt={photo.filename}
        rounded="rounded-[8px]" className="max-sm:!aspect-square max-sm:rounded-[4px]" />
      <button
        type="button" aria-label={processing ? `${photo.filename}, still processing` : `Open ${photo.filename}`} aria-pressed={selecting ? selected : undefined}
        className="absolute inset-0 z-[4] rounded-[8px]" onClick={onClick}
        onPointerDown={onPointerDown} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
      />
      {!processing && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] hidden items-end justify-between gap-2 rounded-b-[8px] bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 sm:flex">
          <span className="truncate">{photo.filename}</span>
          {photo.favourites > 0 && <span className="flex shrink-0 items-center gap-1"><Heart size={11} />{photo.favourites}</span>}
        </span>
      )}
      <button
        type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${photo.filename}`}
        onClick={(e) => onToggle(index, e.shiftKey)}
        className={cn('absolute right-1 top-1 z-[6] grid size-[22px] place-items-center rounded-full border-2 transition-opacity',
          selected ? 'border-transparent bg-gold text-accent-ink opacity-100' : 'border-white/90 bg-black/25 text-transparent opacity-0 hover:text-white focus-visible:opacity-100 group-hover/tile:opacity-100',
          selecting && 'opacity-100')}
      >
        <Check size={13} strokeWidth={3} />
      </button>
    </div>
  )
}
