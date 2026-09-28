import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Camera, Check, ImageUp, RotateCcw, ScanFace } from 'lucide-react'
import { fmt, type PublicEvent, type PublicStudio } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { PrimaryButton, WideButton } from './common'
import { Sheet } from './Sheet'

const MAX_BYTES = 25 * 1024 * 1024

/** Small square thumbnail (data URL) so "Matched to your selfie" survives a reload; null if the image can't be read. */
async function readSelfie(file: File, size = 160): Promise<{ thumb: string; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const s = Math.min(bmp.width, bmp.height)
    c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
    return { thumb: c.toDataURL('image/jpeg', 0.8), w: bmp.width, h: bmp.height }
  } catch { return null }
}

const NO_FACE = { title: 'We couldn’t see a face', body: 'Try again facing the camera in good light, with just your face in the frame.' }

type Step = 'tips' | 'confirm' | 'finding'
interface Problem { title: string; body: string }

/**
 * Find my photos: tips → Take a selfie / Choose a photo → "Use this selfie?" → "Finding your photos…" → My photos.
 * Wrong file type, over 25 MB and "no face" are explained inline with a retry.
 */
export function SelfieFlow({ open, onOpenChange, event, base }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PublicEvent; studio?: PublicStudio; base: string
}) {
  const navigate = useNavigate()
  const api = useApi()
  const [step, setStep] = useState<Step>('tips')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [thumb, setThumb] = useState<string | undefined>()
  const [size, setSize] = useState<{ width: number; height: number } | undefined>()
  const [problem, setProblem] = useState<Problem | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!open) { setStep('tips'); setFile(null); setProblem(null) } }, [open])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function pick(f: File | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setProblem({ title: 'That file isn’t a photo', body: 'Choose a JPG, PNG or HEIC photo of your face.' }); setStep('tips'); return }
    if (f.size > MAX_BYTES) { setProblem({ title: 'That photo is too big', body: `It’s ${(f.size / 1024 / 1024).toFixed(0)} MB. Choose one under 25 MB, or take a new selfie.` }); setStep('tips'); return }
    const read = await readSelfie(f)
    // A photo the browser can't decode has no face we could send; everything else goes to the API, which decides.
    if (!read) { setProblem(NO_FACE); setStep('tips'); return }
    setProblem(null); setFile(f); setThumb(read.thumb); setSize({ width: read.w, height: read.h }); setPreview(URL.createObjectURL(f)); setStep('confirm')
  }

  async function find() {
    if (!file) return
    setStep('finding'); setProblem(null)
    // Same key as the API's deterministic dev match; the real API uses `embedding` once an on-device model exists.
    const key = `${event.id}:${file.name}:${file.size}`
    try {
      const [res] = await Promise.all([api.searchFaces(event.shortId, { key, ...(size ? { image: size } : {}) }), new Promise((r) => setTimeout(r, 1400))])
      if (res.faceFound === false) { setProblem(NO_FACE); setStep('tips'); return }
      const personId = res.personId ?? undefined
      guest.patchSession(event.shortId, {
        match: { personId, photoIds: personId ? undefined : res.photoIds, key, thumb, at: new Date().toISOString(), via: 'selfie' },
      })
      onOpenChange(false)
      navigate(`${base}/me`)
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t search for you')
      setProblem({ title: f.title, body: f.body })
      setStep('confirm')
    }
  }

  const inputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={libraryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )
  const problemBox = problem && (
    <div role="alert" className="flex gap-2.5 rounded-card bg-bad-soft p-3 text-[13px] text-bad">
      <AlertCircle size={17} className="mt-px shrink-0" />
      <div><b className="block">{problem.title}</b><span>{problem.body}</span></div>
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={(v) => { if (step !== 'finding') onOpenChange(v) }} hideClose={step === 'finding'}
      title={step === 'finding' ? 'Finding your photos…' : step === 'confirm' ? 'Use this selfie?' : 'Find your photos with a selfie'}
      footer={step === 'tips' ? (
        <>
          <PrimaryButton icon={<Camera size={17} />} onClick={() => cameraRef.current?.click()}>{problem ? 'Try again' : 'Take a selfie'}</PrimaryButton>
          <WideButton icon={<ImageUp size={16} />} onClick={() => libraryRef.current?.click()}>Choose a photo</WideButton>
        </>
      ) : step === 'confirm' ? (
        <>
          <PrimaryButton icon={<ScanFace size={17} />} onClick={() => void find()}>{problem ? 'Try again' : 'Find my photos'}</PrimaryButton>
          <WideButton icon={<RotateCcw size={15} />} onClick={() => cameraRef.current?.click()}>Retake</WideButton>
        </>
      ) : undefined}>
      {inputs}
      {step === 'tips' && (
        <div className="flex flex-col gap-3">
          {problemBox}
          <ul className="flex flex-col gap-2.5 text-[14px]">
            {['Face the camera in good light', 'Take off sunglasses', `Only used to find you in this event`].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><Check size={14} /></span>{t}</li>
            ))}
          </ul>
          <p className="text-[12.5px] text-ink-3">Your selfie is deleted after 30 days. {event.studio.name} never sees it.</p>
        </div>
      )}
      {step === 'confirm' && preview && (
        <div className="flex flex-col items-center gap-3 py-2">
          <img src={preview} alt="Your selfie" className="h-[220px] w-[176px] rounded-[50%] object-cover ring-[3px] ring-accent ring-offset-4 ring-offset-surface" />
          <p className="text-center text-[13.5px] text-ink-2">Is your face clear and in the middle?</p>
          {problemBox}
        </div>
      )}
      {step === 'finding' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center" role="status" aria-live="polite">
          <div className="relative size-[120px]">
            <span className="absolute inset-0 rounded-full border-2 border-accent motion-safe:animate-[fl-pulse-ring_1.4s_ease-out_infinite]" aria-hidden />
            {preview && <img src={preview} alt="" className="size-[120px] rounded-full object-cover ring-[6px] ring-accent-soft" />}
          </div>
          <p className="text-[13.5px] text-ink-2">Looking through {fmt.count(event.photoCount)} photos</p>
        </div>
      )}
    </Sheet>
  )
}
