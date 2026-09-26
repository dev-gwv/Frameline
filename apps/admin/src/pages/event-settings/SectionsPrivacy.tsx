import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EyeOff, Images, KeyRound, Lock, RefreshCw, ScanFace, ShieldCheck, Smartphone, Users } from 'lucide-react'
import type { AccessMode, PhotoEvent } from '@frameline/shared'
import { fmt, PACKS } from '@frameline/shared'
import { Button, Chip, ConfirmDialog, Field, Input, Menu, Meter, Segmented, Toggle } from '@frameline/ui'
import { useAction, useEvents, useGuests, useUsage } from '../../lib/queries'
import { errorMessage, useApi } from '../../lib/api'
import { GALLERY_URL, shortIdApiError } from '../events/lib'
import { AutoField, Row, SectionCard, TextLink } from './parts'
import type { SaveEvent, SaveSettings } from './useEventSaver'

export interface SectionProps { event: PhotoEvent; set: SaveSettings; update: SaveEvent }

const ID_RE = /^[A-Z0-9]{7}$/

export function GeneralSection({ event, update }: SectionProps) {
  const events = useEvents().data ?? []
  const [idError, setIdError] = useState<string | null>(null)
  const saveShortId = async (v: string) => {
    const err = await update({ shortId: v }, { quiet: true })
    if (err) setIdError(shortIdApiError(err) ?? errorMessage(err))
  }
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
          hint={<>Gallery link: <span className="font-mono">{GALLERY_URL.replace(/^https?:\/\//, '')}/{event.shortId}</span>. Changing it breaks links and QR codes already shared.</>}
          serverError={idError} onEdit={() => setIdError(null)}
          onSave={(v) => void saveShortId(v)}
        />
        <Field label="Event date" htmlFor="ev-date" hint={`Gallery expires ${fmt.date(event.expiresAt)}`}>
          <Input
            id="ev-date" type="date" value={event.date.slice(0, 10)}
            onChange={(e) => { if (e.target.value) update({ date: new Date(e.target.value).toISOString() }) }}
          />
        </Field>
      </div>
      <PhotoLimitRow event={event} />
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
  const navigate = useNavigate()
  const registered = useGuests(event.id).data?.length ?? 0
  const s = event.settings
  const resetPin = useAction(() => api.resetPin(event.id), { success: (pin) => `New PIN is ${pin}. The old one no longer works.`, error: 'Couldn’t change the PIN' })
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
          control={<Button size="sm" icon={<RefreshCw size={12} />} loading={resetPin.isPending} onClick={() => resetPin.mutate(undefined)}>New PIN</Button>}
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
  const api = useApi()
  const s = event.settings
  const [queued, setQueued] = useState<number | null>(null)
  const reindex = useAction(() => api.reindexFaces(event.id), {
    success: (r) => `Re-indexing ${fmt.count(r.queued)} photos. Selfie search updates as each one finishes.`,
    onSuccess: (r) => setQueued(r.queued),
  })
  // The API doesn't report indexing progress; show "queued" for a minute, then the normal state.
  useEffect(() => {
    if (queued === null) return
    const t = setTimeout(() => setQueued(null), 60_000)
    return () => clearTimeout(t)
  }, [queued])

  return (
    <SectionCard
      id="faces" title="Faces"
      action={
        <div className="flex items-center gap-2">
          {queued !== null ? <Chip tone="accent" dot>Re-indexing {fmt.count(queued)}</Chip> : s.faceSearch ? <Chip tone="ok">Index ready</Chip> : <Chip>Off</Chip>}
          <Button size="sm" icon={<RefreshCw size={12} />} loading={reindex.isPending} onClick={() => reindex.mutate(undefined)}
            disabled={queued !== null || !s.faceSearch || event.photoCount === 0}>Re-run indexing</Button>
        </div>
      }
    >
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

type Pack = (typeof PACKS)[number]

/** This event's photo limit, with one-off packs paid from wallet credits (api.buyPack). */
function PhotoLimitRow({ event }: { event: PhotoEvent }) {
  const api = useApi()
  const credits = useUsage().data?.walletCredits
  const [pack, setPack] = useState<Pack | null>(null)
  const buy = useAction((p: Pack) => api.buyPack(event.id, p.photos, { payWith: 'credits' }), {
    success: (r, p) => `${fmt.count(p.photos)} photos added. ${event.name} can now hold ${fmt.count(r.event.photoLimit)}.`,
    error: 'Couldn’t buy the pack',
  })
  const enough = (p: Pack) => credits === undefined || credits >= p.price
  return (
    <>
      <Row
        icon={<Images size={15} />} title="Photo limit for this event"
        description={<span className="flex flex-col gap-1"><span><span className="font-mono tnum">{fmt.count(event.photoCount)} / {fmt.count(event.photoLimit)}</span> photos used</span><Meter value={event.photoCount} max={event.photoLimit || 1} className="max-w-[240px]" /></span>}
        control={<Menu align="end" width={260} trigger={<Button size="sm" loading={buy.isPending}>Buy more photos</Button>}
          items={PACKS.map((p) => ({ label: `+${fmt.count(p.photos)} photos`, hint: `${fmt.rupees(p.price)}${enough(p) ? '' : ' · not enough credits'}`, onSelect: () => setPack(p) }))} />}
      />
      <ConfirmDialog open={!!pack} onOpenChange={(v) => !v && setPack(null)} title={pack ? `Add ${fmt.count(pack.photos)} photos to ${event.name}?` : ''}
        confirmLabel={pack ? `Pay ${fmt.rupees(pack.price)} in credits` : 'Pay'}
        body={pack && <>This pack is paid from your wallet credits{credits !== undefined ? <> (you have <b className="font-mono text-ink">{fmt.rupees(credits)}</b>)</> : null}. The limit goes up to <b className="font-mono text-ink">{fmt.count(event.photoLimit + pack.photos)}</b> straight away. {!enough(pack) && 'You don’t have enough credits: add some in Wallet first.'}</>}
        onConfirm={() => { if (pack) buy.mutate(pack) }} />
    </>
  )
}
