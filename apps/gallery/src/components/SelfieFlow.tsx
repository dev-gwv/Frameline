import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ImageUp, RotateCcw, ShieldCheck } from 'lucide-react'
import { Button } from '@frameline/ui'
import type { PublicEvent, PublicStudio } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { BrandButton } from './common'
import { Sheet } from './Sheet'

/** Small square thumbnail (data URL) so "Matched to your selfie" survives a reload. */
async function thumbnail(file: File, size = 160): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const s = Math.min(bmp.width, bmp.height)
    c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
    return c.toDataURL('image/jpeg', 0.8)
  } catch { return undefined }
}

type Step = 'intro' | 'preview' | 'matching'

export function SelfieFlow({ open, onOpenChange, event, studio, base }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PublicEvent; studio: PublicStudio; base: string
}) {
  const navigate = useNavigate()
  const api = useApi()
  const [step, setStep] = useState<Step>('intro')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!open) { setStep('intro'); setFile(null); setError(null) } }, [open])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function pick(f: File | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('That file isn\'t a photo. Choose a JPG, PNG or HEIC image.'); return }
    if (f.size > 25_000_000) { setError('That photo is over 25 MB. Choose a smaller one.'); return }
    setError(null); setFile(f); setPreview(URL.createObjectURL(f)); setStep('preview')
  }

  async function match() {
    if (!file) return
    setStep('matching'); setError(null)
    // Same key as the API's deterministic dev match; the real API uses `embedding` once an on-device model exists.
    const key = `${event.id}:${file.name}:${file.size}`
    try {
      const [thumb, res] = await Promise.all([thumbnail(file), api.searchFaces(event.shortId, { key }), new Promise((r) => setTimeout(r, 1600))])
      const personId = res.personId ?? undefined
      guest.patchSession(event.shortId, {
        match: { personId, photoIds: personId ? undefined : res.photoIds, key, thumb, at: new Date().toISOString(), via: 'selfie' },
      })
      onOpenChange(false)
      navigate(`${base}/me`)
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t search for you')
      setError(`${f.title}. ${f.body}`)
      setStep('preview')
    }
  }

  const inputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={libraryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )

  return (
    <Sheet open={open} onOpenChange={(v) => { if (step !== 'matching') onOpenChange(v) }}
      title={step === 'matching' ? 'Finding your photos…' : step === 'preview' ? 'Use this selfie?' : 'Take a selfie'}
      description={step === 'intro' ? `We'll look for you in all ${event.photoCount.toLocaleString('en-IN')} photos.` : undefined}>
      {inputs}
      {step === 'intro' && (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2.5 text-[13.5px] text-ink-2">
            <li className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold font-mono text-[11px] font-bold text-accent-ink">1</span>Face the camera in good light, with no sunglasses.</li>
            <li className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold font-mono text-[11px] font-bold text-accent-ink">2</span>Keep just your face in the frame.</li>
            <li className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold font-mono text-[11px] font-bold text-accent-ink">3</span>We show every photo you're in.</li>
          </ol>
          <BrandButton icon={<Camera size={18} />} onClick={() => cameraRef.current?.click()}>Take a selfie</BrandButton>
          <Button size="lg" icon={<ImageUp size={16} />} className="w-full justify-center" onClick={() => libraryRef.current?.click()}>Choose a photo instead</Button>
          {error && <p role="alert" className="text-[12.5px] font-semibold text-bad">{error}</p>}
          <p className="flex items-start gap-2 text-[11.5px] text-ink-3"><ShieldCheck size={14} className="mt-0.5 shrink-0" />Your selfie is only used to match you in {event.name} and is deleted after 30 days. {studio.name} never sees it.</p>
        </div>
      )}
      {step === 'preview' && preview && (
        <div className="flex flex-col items-center gap-4">
          <img src={preview} alt="Your selfie" className="size-44 rounded-full border-4 border-surface object-cover shadow-card" />
          <p className="text-center text-[13px] text-ink-2">Make sure your face is clear and centred.</p>
          {error && <p role="alert" className="text-center text-[12.5px] font-semibold text-bad">{error}</p>}
          <BrandButton onClick={match}>{error ? 'Try again' : 'Find my photos'}</BrandButton>
          <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={() => cameraRef.current?.click()}>Retake</Button>
        </div>
      )}
      {step === 'matching' && preview && (
        <div className="flex flex-col items-center gap-5 py-4" role="status" aria-live="polite">
          <div className="relative size-44">
            <span className="absolute inset-0 rounded-full border-2 border-accent motion-safe:animate-[fl-pulse-ring_1.4s_ease-out_infinite]" aria-hidden />
            <img src={preview} alt="" className="size-44 rounded-full object-cover" />
            <span className="absolute inset-x-6 h-0.5 rounded bg-marker shadow-[0_0_12px_var(--marker)] motion-safe:animate-[fl-scan_1.8s_ease-in-out_infinite]" style={{ top: '50%' }} aria-hidden />
          </div>
          <div className="text-center">
            <div className="font-display text-[18px] font-semibold">Matching…</div>
            <div className="text-[12.5px] text-ink-2">Looking through {event.photoCount.toLocaleString('en-IN')} photos</div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
