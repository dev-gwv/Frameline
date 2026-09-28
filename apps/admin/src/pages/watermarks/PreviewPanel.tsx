import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button, Card, cn, useToast } from '@frameline/ui'
import { isEditableTarget, type WmDraft } from './lib'
import { aspectOf, PhotoFrame, SAMPLES, type Sample } from './samples'
import { WatermarkOverlay } from './WatermarkOverlay'

/** Large live preview with thumbnails to switch photos (← / → also work) and "Try my photo". */
export function PreviewPanel({ wm }: { wm: WmDraft }) {
  const toast = useToast()
  const [mine, setMine] = useState<Sample[]>([])
  const [index, setIndex] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  const photos = [...mine, ...SAMPLES]
  const current = photos[Math.min(index, photos.length - 1)]

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const goRef = useRef((d: number) => setIndex((i) => (i + d + photos.length) % photos.length))
  goRef.current = (d: number) => setIndex((i) => (i + d + photos.length) % photos.length)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function addPhoto(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('That isn’t a photo', 'Choose a JPG, PNG or WebP image.'); return }
    const url = URL.createObjectURL(file)
    urls.current.push(url)
    const img = new Image()
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight || 1.5
      setMine((m) => [{ id: url, name: `Your photo · ${file.name}`, orientation: ratio < 1 ? 'portrait' : 'landscape', bg: '', shapes: [], url, ratio }, ...m])
      setIndex(0)
    }
    img.onerror = () => toast.error('Couldn’t open that photo', 'Try a JPG or PNG exported from your editor.')
    img.src = url
  }

  function removeMine(id: string) {
    URL.revokeObjectURL(id)
    setMine((m) => m.filter((s) => s.id !== id))
    setIndex(0)
  }

  return (
    <Card padded={false} className="min-w-0 overflow-hidden">
      <div className="flex h-[300px] items-center justify-center bg-sunk p-3 sm:h-[470px] sm:p-5">
        <PhotoFrame key={current.id} sample={current} fit={current.orientation === 'portrait' ? 'height' : 'width'} className="animate-[fl-fade-in_180ms_ease-out]">
          <WatermarkOverlay wm={wm} ratio={aspectOf(current)} />
          {current.url && (
            <button type="button" aria-label="Remove my photo" onClick={() => removeMine(current.id)}
              className="absolute left-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75">
              <X size={14} />
            </button>
          )}
        </PhotoFrame>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3.5 py-2.5">
        <span className="flex-1 text-[13px] text-ink-2 sm:flex-none">Preview on {current.url ? 'your photo' : 'sample photos'}</span>
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:justify-end sm:gap-1.5">
          <div className="order-last flex w-full min-w-0 gap-1.5 overflow-x-auto p-1 scrollbar-none sm:order-none sm:w-auto" role="tablist" aria-label="Preview photos">
            {photos.map((p, k) => (
              <button key={p.id} type="button" role="tab" aria-selected={k === index} aria-label={p.name} title={p.name} onClick={() => setIndex(k)}
                className={cn('h-[30px] w-[44px] shrink-0 overflow-hidden rounded-[5px] transition', k === index ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'opacity-80 hover:opacity-100')}
                style={p.url ? { backgroundImage: `url(${p.url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: p.bg }} />
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = '' }} />
          <Button size="sm" variant="ghost" icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>Try my photo</Button>
        </div>
      </div>
    </Card>
  )
}
