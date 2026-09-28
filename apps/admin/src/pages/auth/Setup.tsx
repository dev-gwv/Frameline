import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, type NewEventInput, type Studio } from '@frameline/shared'
import { Button, Skeleton, StepIndicator, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useStudio } from '../../lib/queries'
import { validateBasics, type EventBasicsErrors } from '../events/EventBasics'
import { guessType } from '../events/lib'
import { Brand } from './signin/SignInForm'
import { draftFromStudio, suggestHandle, useHandleCheck, type SetupDraft } from './setup/draft'
import { PhonePreview } from './setup/PhonePreview'
import { StepBrand } from './setup/StepBrand'
import { StepEvent } from './setup/StepEvent'
import { StepStudio } from './setup/StepStudio'

const STEPS = ['Your studio', 'Your look', 'First event']
const TITLES = ['Tell us about your studio', 'Make it look like you', 'Create your first event']

/**
 * /setup: three short steps (Your studio · Your look · First event) with a live phone preview.
 * Every step can be skipped; creating the event lands on Home with the next step spelled out.
 */
export default function Setup() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const studio = useStudio()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<SetupDraft | null>(null)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'city', string>> & EventBasicsErrors>({})
  const [takenHandle, setTakenHandle] = useState<string>()
  const handleStatus = useHandleCheck(draft?.handle ?? '', studio.data?.handle, takenHandle)

  useEffect(() => { if (studio.data && !draft) setDraft(draftFromStudio(studio.data)) }, [studio.data, draft])
  useEffect(() => { if (studio.isError && !draft) setDraft(draftFromStudio()) }, [studio.isError, draft])
  useEffect(() => { window.scrollTo(0, 0) }, [step])

  const saveStudio = useAction((patch: Partial<Studio>) => api.updateStudio(patch), {
    error: 'Couldn’t save your studio',
    onError: (err, patch) => { if (err instanceof ApiError && err.code === 'handle_taken' && patch.handle) setTakenHandle(patch.handle) },
  })
  const createEvent = useAction((input: NewEventInput) => api.createEvent(input), {
    success: (e) => `${e.name} created`, error: 'Couldn’t create the event',
  })

  if (!draft) {
    return (
      <div className="grid min-h-dvh bg-surface lg:grid-cols-[1fr_440px]" aria-busy="true">
        <div className="flex flex-col gap-4 px-4 py-8 sm:px-10 lg:px-[70px]"><Skeleton className="h-7 w-32" /><Skeleton className="h-6 w-72" /><Skeleton className="h-9 w-80" /><Skeleton className="h-60 max-w-[440px]" /></div>
        <div className="hidden bg-sunk lg:block" />
      </div>
    )
  }

  const patch = (p: Partial<SetupDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setErrors((e) => {
      const n = { ...e }
      if ('name' in p) delete n.name
      if ('city' in p) delete n.city
      if ('eventName' in p) delete n.name
      if ('eventDate' in p) delete n.date
      if ('eventCity' in p) delete n.city
      return n
    })
  }
  const next = () => { setErrors({}); setStep((s) => Math.min(STEPS.length - 1, s + 1)) }
  const back = () => { setErrors({}); setStep((s) => Math.max(0, s - 1)) }
  const skip = () => (step === STEPS.length - 1 ? navigate('/', { replace: true }) : next())

  const onContinue = async () => {
    if (step === 0) {
      const e: typeof errors = {}
      if (draft.name.trim().length < 2) e.name = 'Enter your studio name, at least 2 characters.'
      if (!draft.city.trim()) e.city = 'Enter the city you work from.'
      setErrors(e)
      if (Object.keys(e).length) return
      await saveStudio.mutateAsync({ name: draft.name.trim(), city: draft.city.trim(), studioType: draft.kind })
      setDraft((d) => d && {
        ...d,
        handle: d.handle || suggestHandle(d.name),
        eventCity: d.eventCity || d.city.trim(),
      })
      next()
    } else if (step === 1) {
      if (handleStatus === 'checking') { toast.toast({ kind: 'info', title: 'Still checking your gallery address', body: 'Try again in a second.' }); return }
      if (handleStatus !== 'available') { toast.error('Choose a different gallery address', 'The one you typed is taken or not allowed.'); return }
      await saveStudio.mutateAsync({
        brandColor: draft.brandColor, handle: draft.handle.trim(), phone: draft.phone.trim(),
        ...(draft.logoUrl ? { logoUrl: draft.logoUrl } : {}),
      })
      next()
    } else {
      const e = validateBasics({ name: draft.eventName, date: draft.eventDate, city: draft.eventCity, preset: draft.preset })
      setErrors(e)
      if (Object.keys(e).length) return
      await createEvent.mutateAsync({
        name: draft.eventName.trim(), date: draft.eventDate, city: draft.eventCity.trim(),
        type: guessType(draft.eventName, draft.preset), preset: draft.preset, guestUploadLimit: 300,
      })
      navigate('/', { replace: true })
    }
  }
  const busy = saveStudio.isPending || createEvent.isPending

  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[1fr_440px]">
      <div className="flex min-w-0 flex-col px-4 py-6 sm:px-10 lg:px-[70px] lg:py-9">
        <Brand />
        <StepIndicator className="mb-2 mt-5" steps={STEPS} current={step} />
        <h1 className="font-display text-[26px] font-semibold leading-tight sm:text-[28px]">{TITLES[step]}</h1>
        <form className="mt-5 flex w-full max-w-[440px] flex-1 flex-col gap-4" noValidate
          onSubmit={(e) => { e.preventDefault(); void onContinue().catch(() => { /* toast already shown */ }) }}>
          {step === 0 && <StepStudio draft={draft} patch={patch} errors={errors} />}
          {step === 1 && <StepBrand draft={draft} patch={patch} handleStatus={handleStatus} onError={(m) => toast.error('Upload didn’t work', m)} />}
          {step === 2 && <StepEvent draft={draft} patch={patch} errors={errors} />}

          <details className="rounded-card border border-line bg-sunk lg:hidden">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-[13px] font-bold">See what guests will see</summary>
            <div className="grid place-items-center pb-5"><PhonePreview draft={draft} /></div>
          </details>

          <div className="mt-auto flex items-center gap-2 pt-6">
            {step > 0 && <Button variant="ghost" className="max-sm:h-[46px]" onClick={back} disabled={busy}>Back</Button>}
            <button type="button" className="ml-auto min-h-[44px] px-2 text-[13.5px] font-bold text-ink-3 hover:text-ink disabled:opacity-50" onClick={skip} disabled={busy}>Skip for now</button>
            <Button type="submit" variant="primary" className="max-sm:h-[46px]" loading={busy}>{step === 2 ? 'Create event' : 'Continue'}</Button>
          </div>
        </form>
      </div>
      <aside className="sticky top-0 hidden h-dvh place-items-center bg-sunk lg:grid" aria-label="Live preview">
        <PhonePreview draft={draft} />
      </aside>
    </div>
  )
}
