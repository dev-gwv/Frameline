import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ApiError, type NewEventInput, type Studio } from '@frameline/shared'
import { Button, LogoMark, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction, useStudio } from '../../lib/queries'
import { draftFromStudio, isHex, useHandleCheck, type SetupDraft } from './setup/draft'
import { PhonePreview } from './setup/PhonePreview'
import { StepBrand } from './setup/StepBrand'
import { StepEvent } from './setup/StepEvent'
import { StepStudio } from './setup/StepStudio'
import { Stepper } from './setup/Stepper'

const STEPS = ['Studio', 'Brand', 'First event']
const HEADINGS = [
  { title: 'Tell us about your studio', sub: 'Three quick answers so your galleries start out right.' },
  { title: 'Make galleries look like yours', sub: 'Guests see this on every event. Change it any time in Settings → Studio profile.' },
  { title: 'Create your first event', sub: 'Pick a preset for privacy and downloads. You can upload photos right after.' },
]

type Errors = Partial<Record<'name' | 'city' | 'eventName' | 'eventDate', string>>

/** /setup — 3-step studio onboarding: Studio · Brand · First event. */
export default function Setup() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const studio = useStudio()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<SetupDraft | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [takenHandle, setTakenHandle] = useState<string>()
  const handleStatus = useHandleCheck(draft?.handle ?? '', takenHandle)
  const { mode } = useAuth()

  useEffect(() => { if (studio.data && !draft) setDraft(draftFromStudio(studio.data)) }, [studio.data, draft])
  useEffect(() => { if (studio.isError && !draft) setDraft(draftFromStudio()) }, [studio.isError, draft])

  const saveStudio = useAction((patch: Partial<Studio>) => api.updateStudio(patch), {
    error: 'Couldn’t save your studio',
    onError: (err, patch) => { if (err instanceof ApiError && err.code === 'handle_taken' && patch.handle) setTakenHandle(patch.handle) },
  })
  const createEvent = useAction((input: NewEventInput) => api.createEvent(input), {
    success: (e) => `${e.name} created`, error: 'Couldn’t create the event',
  })

  if (!draft) {
    return (
      <div className="grid min-h-full place-items-center bg-paper p-6" aria-busy="true">
        <div className="flex w-full max-w-[580px] flex-col gap-4"><Skeleton className="h-6 w-60" /><Skeleton className="h-10 w-80" /><Skeleton className="h-72" /></div>
      </div>
    )
  }

  const patch = (p: Partial<SetupDraft>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setErrors((e) => { const n = { ...e }; for (const k of Object.keys(p)) delete n[k as keyof Errors]; return n }) }
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => (step === 0 ? navigate('/login') : setStep((s) => s - 1))
  const skip = () => (step === STEPS.length - 1 ? navigate('/') : next())

  const validate = (): Errors => {
    const e: Errors = {}
    if (step === 0) {
      if (draft.name.trim().length < 2) e.name = 'Enter your studio name, at least 2 characters.'
      if (!draft.city.trim()) e.city = 'Enter the city you work from.'
    }
    if (step === 2) {
      if (draft.eventName.trim().length < 3) e.eventName = 'Give the event a name, at least 3 characters.'
      if (!draft.eventDate) e.eventDate = 'Choose the event date.'
    }
    return e
  }

  const onContinue = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    if (step === 0) {
      await saveStudio.mutateAsync({ name: draft.name.trim(), city: draft.city.trim(), studioType: draft.kind, referralSource: draft.heard || undefined })
      next()
    } else if (step === 1) {
      if (handleStatus === 'checking') { toast.toast({ kind: 'info', title: 'Still checking your gallery address', body: 'Try again in a second.' }); return }
      if (handleStatus !== 'available') { toast.error('Choose a different gallery address', 'The one you typed is taken or not allowed.'); return }
      if (!isHex(draft.brandColor)) { toast.error('Brand colour isn’t valid', 'Use a 6-digit hex colour, like #8C2F39.'); return }
      // The API stores image addresses (https://…), not file contents; picked files stay in the preview until uploads exist.
      const storable = (url?: string) => (url && (mode === 'demo' || /^https?:\/\//.test(url)) ? url : undefined)
      const logoUrl = storable(draft.logoUrl), coverUrl = storable(draft.coverUrl)
      await saveStudio.mutateAsync({
        brandColor: draft.brandColor, handle: draft.handle.trim(),
        phone: draft.phone.trim(), instagram: draft.instagram.trim() || undefined,
        ...(logoUrl ? { logoUrl } : {}), ...(coverUrl ? { coverUrl } : {}),
      })
      if ((draft.logoUrl && !logoUrl) || (draft.coverUrl && !coverUrl)) {
        toast.toast({ kind: 'info', title: 'Logo and cover not saved yet', body: 'Add them again in Settings → Studio profile once image uploads are available.' })
      }
      next()
    } else {
      const ev = await createEvent.mutateAsync({
        name: draft.eventName.trim(), date: draft.eventDate, city: draft.city.trim(), type: draft.eventType, preset: draft.preset, guestUploadLimit: 300,
      })
      navigate(`/events/${ev.id}`)
    }
  }
  const busy = saveStudio.isPending || createEvent.isPending

  return (
    <div className="grid min-h-full bg-paper lg:grid-cols-[1fr_420px]">
      <div className="flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-7 lg:px-14 lg:py-8">
        <div className="flex items-center gap-2.5"><LogoMark /><span className="font-display text-[18px] font-semibold">Frameline</span></div>
        <Stepper steps={STEPS} current={step} onJump={setStep} />
        <div>
          <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight sm:text-[30px]">{HEADINGS[step].title}</h1>
          <p className="mt-1 text-[13px] text-ink-2">{HEADINGS[step].sub}</p>
        </div>
        <form className="flex max-w-[580px] flex-col gap-5" noValidate onSubmit={(e) => { e.preventDefault(); void onContinue().catch(() => { /* toast already shown */ }) }}>
          {step === 0 && <StepStudio draft={draft} patch={patch} errors={errors} />}
          {step === 1 && <StepBrand draft={draft} patch={patch} handleStatus={handleStatus} onError={(m) => toast.error('Upload didn’t work', m)} />}
          {step === 2 && <StepEvent draft={draft} patch={patch} errors={errors} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={back}>Back</Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={skip} disabled={busy}>Skip for now</Button>
              <Button type="submit" variant="primary" size="lg" loading={busy}>{step === 2 ? 'Create event' : 'Continue'}</Button>
            </div>
          </div>
        </form>
      </div>
      <aside className="relative hidden place-items-center border-l border-line bg-sunk py-10 lg:grid">
        <PhonePreview draft={draft} />
        <div className="eyebrow absolute bottom-6">Live guest preview</div>
      </aside>
    </div>
  )
}
