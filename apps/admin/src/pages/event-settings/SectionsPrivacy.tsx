import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EyeOff, KeyRound, Lock, RefreshCw, ScanFace, ShieldCheck, Smartphone, Users } from 'lucide-react'
import type { AccessMode, PhotoEvent } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { Button, Chip, Field, Input, Meter, Segmented, Toggle, useToast } from '@frameline/ui'
import { useEvents, useGuests } from '../../lib/queries'
import { useApi } from '../../lib/api'
import { AutoField, Row, SectionCard, TextLink } from './parts'
import type { SaveEvent, SaveSettings } from './useEventSaver'

export interface SectionProps { event: PhotoEvent; set: SaveSettings; update: SaveEvent }

const ID_RE = /^[A-Z0-9]{7}$/

export function GeneralSection({ event, update }: SectionProps) {
  const events = useEvents().data ?? []
  return (
    <SectionCard id="general" title="General">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <AutoField
          id="ev-name" label="Event name" value={event.name} className="sm:col-span-2"
          validate={(v) => (v.trim().length < 3 ? 'Use at least 3 characters so guests recognise the event.' : null)}
          onSave={(v) => update({ name: v.trim() })}
        />
        <AutoField
          id="ev-shortid" label="Event ID" value={event.shortId} mono maxLength={7}
          format={(v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')}
          validate={(v) => !ID_RE.test(v) ? 'Use exactly 7 letters or numbers (A–Z, 0–9).'
            : events.some((e) => e.id !== event.id && e.shortId === v) ? 'Another event already uses this ID. Try a different one.' : null}
          hint={<>Gallery link: <span className="font-mono">frameline.in/{event.shortId}</span>. Changing it breaks links and QR codes already shared.</>}
          onSave={(v) => update({ shortId: v })}
        />
        <Field label="Event date" htmlFor="ev-date" hint={`Gallery expires ${fmt.date(event.expiresAt)}`}>
          <Input
            id="ev-date" type="date" value={event.date.slice(0, 10)}
            onChange={(e) => { if (e.target.value) update({ date: new Date(e.target.value).toISOString() }) }}
          />
        </Field>
      </div>
    </SectionCard>
  )
}

const ACCESS: { value: AccessMode; label: string }[] = [
  { value: 'link', label: 'Link' },
  { value: 'link-pin', label: 'Link + PIN' },
  { value: 'registered', label: 'Registered' },
]

export function AccessSection({ event, set }: SectionProps) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const registered = useGuests(event.id).data?.length ?? 0
  const s = event.settings
  const [resetting, setResetting] = useState(false)
  const newPin = async () => {
    setResetting(true)
    try { await api.resetPin(event.id) } catch (e) { toast.error('Couldn’t change the PIN', e instanceof Error ? e.message : 'Try again.') }
    setResetting(false)
  }
  return (
    <SectionCard id="access" title="Access">
      <Row
        icon={<Lock size={15} />} title="Who can open the gallery"
        description={s.access === 'link' ? 'Anyone with the link' : s.access === 'link-pin'
          ? <>PIN <span className="font-mono font-bold text-ink">{s.pin}</span> · <TextLink onClick={() => navigate(`/events/${event.id}?modal=share`)}>share it</TextLink></>
          : 'Only guests you approve after they register'}
        control={<Segmented size="sm" value={s.access} onChange={(v) => set({ access: v })} options={ACCESS} />}
      />
      {s.access === 'link-pin' && (
        <Row
          icon={<KeyRound size={15} />} title="Gallery PIN" description="Guests type this once. A new PIN stops the old one working."
          control={<Button size="sm" icon={<RefreshCw size={12} />} loading={resetting} onClick={newPin}>New PIN</Button>}
        />
      )}
      <Row
        icon={<Users size={15} />} title="Ask for name, email and mobile first"
        description={<>{registered} registered · <TextLink onClick={() => navigate(`/events/${event.id}/guests?tab=registered`)}>see Guests</TextLink></>}
        control={<Toggle label="Ask for name, email and mobile first" checked={s.requireRegistration} onCheckedChange={(v) => set({ requireRegistration: v })} />}
      />
      <Row
        icon={<Smartphone size={15} />} title="Skip the “get the app” page"
        description={s.skipAppLanding ? 'Guests go straight to the web gallery' : 'Guests see an app download page first'}
        control={<Toggle label="Skip the get the app page" checked={s.skipAppLanding} onCheckedChange={(v) => set({ skipAppLanding: v })} />}
      />
    </SectionCard>
  )
}

export function FacesSection({ event, set }: SectionProps) {
  const toast = useToast()
  const s = event.settings
  const [progress, setProgress] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  useEffect(() => {
    if (progress === null || progress < 100) return
    clearInterval(timer.current)
    const t = setTimeout(() => {
      setProgress(null)
      toast.success('Face index ready', `${fmt.count(event.photoCount)} photos indexed. Selfie search uses the new index now.`)
    }, 400)
    return () => clearTimeout(t)
  }, [progress, toast, event.photoCount])

  const rerun = () => {
    setProgress(0)
    toast.toast({ kind: 'info', title: 'Re-running face indexing', body: `${fmt.count(event.photoCount)} photos · about a minute. You can keep working.` })
    clearInterval(timer.current)
    timer.current = setInterval(() => setProgress((p) => Math.min(100, (p ?? 0) + 6 + Math.random() * 8)), 350)
  }

  return (
    <SectionCard
      id="faces" title="Faces"
      action={
        <div className="flex items-center gap-2">
          {progress !== null ? <Chip tone="accent" dot>Indexing {Math.round(progress)}%</Chip> : s.faceSearch ? <Chip tone="ok">Index ready</Chip> : <Chip>Off</Chip>}
          <Button size="sm" icon={<RefreshCw size={12} />} onClick={rerun} disabled={progress !== null || !s.faceSearch || event.photoCount === 0}>Re-run indexing</Button>
        </div>
      }
    >
      {progress !== null && <Meter value={progress} className="mb-2" />}
      <Row
        icon={<ScanFace size={15} />} title="Selfie search" description="Guests find themselves across all albums"
        control={<Toggle label="Selfie search" checked={s.faceSearch} onCheckedChange={(v) => set({ faceSearch: v })} />}
      />
      <Row
        icon={<EyeOff size={15} />} title="Guests only see their own photos"
        description={s.faceSearch ? 'Everything else stays hidden. The PIN shows all' : 'Needs selfie search to be on'}
        control={<Toggle label="Guests only see their own photos" disabled={!s.faceSearch} checked={s.faceSearch && s.facePrivacy} onCheckedChange={(v) => set({ facePrivacy: v })} />}
      />
      <Row
        icon={<ShieldCheck size={15} />} title="Selfie search without signing in" description="Anonymous “My photos”: no name or email needed"
        control={<Toggle label="Selfie search without signing in" disabled={!s.faceSearch} checked={s.faceSearch && s.anonymousSelfie} onCheckedChange={(v) => set({ anonymousSelfie: v })} />}
      />
    </SectionCard>
  )
}
