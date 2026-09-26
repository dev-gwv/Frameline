import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, Upload, X } from 'lucide-react'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Card, cn, Modal, Tip, useToast } from '@frameline/ui'
import { isEditableTarget, type LocalExtras } from './lib'
import { PhotoFrame, SAMPLES, type Sample } from './samples'
import { WatermarkOverlay } from './WatermarkOverlay'

/** Large preview: sample carousel with arrows, dots and ←/→ keys, "Try my photo" and a Gallery grid. */
export function PreviewPanel({ wm, extras }: { wm: WatermarkSettings; extras: LocalExtras }) {
  const toast = useToast()
  const [mine, setMine] = useState<Sample[]>([])
  const [index, setIndex] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  const photos = [...mine, ...SAMPLES]
  const current = photos[Math.min(index, photos.length - 1)]

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const go = (d: number) => setIndex((i) => (i + d + photos.length) % photos.length)
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (galleryOpen || isEditableTarget(e.target) || document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [galleryOpen])

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
    <Card className="flex min-w-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-ink-2">
          Preview on sample photos · <b className="text-ink">{current.orientation}</b>
          {current.url && <span className="ml-1 text-ink-3">(your photo)</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = '' }} />
          <Button size="sm" icon={<Upload size={12} />} onClick={() => fileRef.current?.click()}>Try my photo</Button>
          <Button size="sm" variant="dark" icon={<LayoutGrid size={12} />} onClick={() => setGalleryOpen(true)}>Gallery</Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 sm:gap-6">
        <Tip label="Previous photo (←)">
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="grid size-9 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-ink-2 hover:bg-sunk hover:text-ink">
            <ChevronLeft size={16} />
          </button>
        </Tip>
        <div className="flex h-[300px] min-w-0 flex-1 items-center justify-center sm:h-[440px]">
          <PhotoFrame key={current.id} sample={current} fit={current.orientation === 'portrait' ? 'height' : 'width'} className="animate-[fl-fade-in_180ms_ease-out]">
            <WatermarkOverlay wm={wm} extras={extras} />
            {current.url && (
              <Tip label="Remove my photo">
                <button type="button" aria-label="Remove my photo" onClick={() => removeMine(current.id)} className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75">
                  <X size={14} />
                </button>
              </Tip>
            )}
          </PhotoFrame>
        </div>
        <Tip label="Next photo (→)">
          <button type="button" aria-label="Next photo" onClick={() => go(1)} className="grid size-9 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-ink-2 hover:bg-sunk hover:text-ink">
            <ChevronRight size={16} />
          </button>
        </Tip>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="Sample photos">
        {photos.map((p, k) => (
          <button
            key={p.id} type="button" role="tab" aria-selected={k === index} aria-label={p.name} onClick={() => setIndex(k)}
            className={cn('h-1.5 rounded-full transition-all', k === index ? 'w-[18px] bg-accent' : 'w-1.5 bg-line-2 hover:bg-ink-3')}
          />
        ))}
      </div>
      <p className="text-center text-[11.5px] text-ink-3">{current.name} · use ← and → to flip through</p>

      <Modal open={galleryOpen} onOpenChange={setGalleryOpen} title="Your watermark on every sample" description="Click a photo to open it in the large preview." width={920}>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p, k) => (
            <button key={p.id} type="button" onClick={() => { setIndex(k); setGalleryOpen(false) }} className="flex flex-col items-center gap-1.5 rounded-card p-1.5 text-left hover:bg-sunk">
              <div className="flex h-[170px] w-full items-center justify-center">
                <PhotoFrame sample={p} fit={p.orientation === 'portrait' ? 'height' : 'width'}>
                  <WatermarkOverlay wm={wm} extras={extras} />
                </PhotoFrame>
              </div>
              <span className="w-full truncate text-[11.5px] font-semibold text-ink-2">{p.name}</span>
            </button>
          ))}
        </div>
      </Modal>
    </Card>
  )
}
