import { useEffect, useState } from 'react'
import { CheckCheck, Download, Droplet, EyeOff, ImageIcon, KeyRound, ScanFace, ShieldCheck, Smartphone, Upload, UserCheck, Users } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, ConfirmDialog, Input, Meter, SettingRow, Toggle, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useEventStats, useGuests } from '../../lib/queries'
import { MoreOptions, SettingsCard, TextLink, ToggleRow, type CardProps } from './parts'

export function AccessCard({ event, set }: CardProps) {
  const api = useApi()
  const toast = useToast()
  const signedUp = useGuests(event.id).data?.length
  const s = event.settings
  const [askPin, setAskPin] = useState(false)
  const approving = s.access === 'registered'
  const newPin = async () => {
    try {
      const pin = await api.resetPin(event.id)
      toast.success(`New PIN is ${pin}`, 'The old PIN no longer works. Your links and QR codes still do.')
    } catch (e) {
      toast.error('Couldn’t make a new PIN', errorMessage(e))
      throw e
    }
  }
  return (
    <SettingsCard id="access" title="Who can open the gallery">
      <ToggleRow
        icon={<KeyRound size={15} />} title="Ask for a PIN" checked={s.access === 'link-pin'} disabled={approving}
        onChange={(v) => set({ access: v ? 'link-pin' : 'link' })}
        description={approving ? 'Off while you approve each guest' : s.access === 'link-pin'
          ? <>PIN <b className="text-ink tnum">{s.pin}</b> · <TextLink onClick={() => setAskPin(true)}>New PIN</TextLink></>
          : 'Anyone with the link can open it'}
      />
      <ToggleRow
        icon={<Users size={15} />} title="Ask for name and phone first" checked={s.requireRegistration}
        onChange={(v) => set({ requireRegistration: v })}
        description={signedUp === undefined ? 'Guests sign up before they see photos' : `${fmt.count(signedUp)} guest${signedUp === 1 ? '' : 's'} signed up`}
      />
      <ToggleRow
        icon={<Smartphone size={15} />} title="Skip the “get the app” page" checked={s.skipAppLanding}
        onChange={(v) => set({ skipAppLanding: v })}
        description={s.skipAppLanding ? 'Guests go straight to the photos' : 'Guests see an app download page first'}
      />
      <MoreOptions>
        <ToggleRow
          icon={<UserCheck size={15} />} title="Only people you approve" checked={approving}
          onChange={(v) => set({ access: v ? 'registered' : 'link-pin' })}
          description={approving ? 'Guests ask first; you approve them in Guests' : 'Off: the link (and PIN) is enough'}
        />
      </MoreOptions>
      <ConfirmDialog
        open={askPin} onOpenChange={setAskPin} title="Make a new PIN?" confirmLabel="Make a new PIN" onConfirm={newPin}
        body={<>Guests who haven’t opened the gallery yet will need the new PIN. PIN <b className="text-ink">{s.pin}</b> stops working straight away.</>}
      />
    </SettingsCard>
  )
}

export function FacesCard({ event, set }: CardProps) {
  const api = useApi()
  const toast = useToast()
  const s = event.settings
  const stats = useEventStats(event.id)
  const faces = stats.data?.faces
  const scanning = !!faces && faces.pending > 0
  const again = () => api.reindexFaces(event.id).then(() => { void stats.refetch(); toast.success('Finding faces again', 'This page shows the progress.') }, (e) => toast.error('Couldn’t start face finding', errorMessage(e)))
  const progress = !s.faceSearch ? 'Off: guests browse the albums instead'
    : !faces ? 'Checking…'
      : faces.total === 0 ? 'Starts when you upload photos'
        : scanning ? `Finding faces: ${fmt.count(faces.ready)} of ${fmt.count(faces.total)} photos ready`
          : <>{fmt.count(faces.ready)} of {fmt.count(faces.total)} photos ready · <TextLink onClick={() => void again()}>Find faces again</TextLink></>
  return (
    <SettingsCard id="faces" title="Faces">
      <SettingRow
        icon={<ScanFace size={15} />} title="Find photos with a selfie"
        description={<>{progress}{s.faceSearch && faces && scanning && <Meter value={faces.ready} max={faces.total || 1} className="mt-1.5 max-w-[240px]" label="Face finding progress" />}</>}
        control={<Toggle label="Find photos with a selfie" checked={s.faceSearch} onCheckedChange={(v) => set({ faceSearch: v })} />}
      />
      <ToggleRow
        icon={<EyeOff size={15} />} title="Guests see only their own photos" checked={s.faceSearch && s.facePrivacy} disabled={!s.faceSearch}
        onChange={(v) => set({ facePrivacy: v })}
        description={!s.faceSearch ? 'Needs selfie search to be on' : s.facePrivacy ? 'Turn off to let everyone browse' : 'Everyone can browse every album'}
      />
      <MoreOptions>
        <ToggleRow
          icon={<ShieldCheck size={15} />} title="Selfie search without signing up" checked={s.faceSearch && s.anonymousSelfie} disabled={!s.faceSearch}
          onChange={(v) => set({ anonymousSelfie: v })}
          description="Guests find their photos without leaving a name or phone"
        />
      </MoreOptions>
    </SettingsCard>
  )
}

export const DOWNLOAD_WORDS = { all: 'Everything', own: 'Only photos they’re in', none: 'Nothing' } as const

export function DownloadsCard({ event, set, onChange }: CardProps & { onChange: () => void }) {
  const s = event.settings
  return (
    <SettingsCard id="downloads" title="Downloads">
      <SettingRow
        icon={<Download size={15} />} title="What guests can download"
        description={`${DOWNLOAD_WORDS[s.downloads]}${s.downloads !== 'none' && s.anonymousDownloads ? ' · no sign-up needed' : ''}`}
        control={<Button size="sm" className="max-sm:h-10" onClick={onChange}>Change</Button>}
      />
      <ToggleRow
        icon={<ImageIcon size={15} />} title="Full-size originals" checked={s.originalDownloads} disabled={s.downloads === 'none'}
        onChange={(v) => set({ originalDownloads: v })}
        description={s.downloads === 'none' ? 'Downloads are off' : s.originalDownloads ? 'On: guests get the full-size file' : 'Off: web size only'}
      />
    </SettingsCard>
  )
}

const MAX_LIMIT = 5000

export function GuestUploadsCard({ event, set }: CardProps) {
  const s = event.settings
  const [limit, setLimit] = useState(String(s.guestUploadLimit))
  useEffect(() => setLimit(String(s.guestUploadLimit)), [s.guestUploadLimit])
  const n = Number(limit)
  const error = !limit || n < 1 ? 'Enter at least 1' : n > MAX_LIMIT ? `Up to ${fmt.count(MAX_LIMIT)}` : null
  const commit = () => { if (!error && n !== s.guestUploadLimit) set({ guestUploadLimit: n }) }
  return (
    <SettingsCard id="guest-uploads" title="Guest uploads">
      <ToggleRow
        icon={<Upload size={15} />} title="Let guests add photos" checked={s.guestUploads}
        onChange={(v) => set({ guestUploads: v })}
        description={s.guestUploads ? `Up to ${fmt.count(s.guestUploadLimit)}${s.reviewGuestUploads ? ', you review first' : ', shown straight away'}` : 'Off'}
      />
      {s.guestUploads && (
        <>
          <SettingRow
            icon={<ImageIcon size={15} />} title="Most photos guests can add"
            description={error ? <span className="text-bad">{error}</span> : 'Counts toward this event’s photo limit'}
            control={<Input aria-label="Most photos guests can add" inputMode="numeric" value={limit} className="w-[92px] text-right tnum"
              aria-invalid={!!error} onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 5))} onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') commit() }} />}
          />
          <ToggleRow
            icon={<CheckCheck size={15} />} title="Review before they show" checked={s.reviewGuestUploads}
            onChange={(v) => set({ reviewGuestUploads: v })}
            description={s.reviewGuestUploads ? 'You approve each photo in Guests' : 'Guest photos show straight away'}
          />
        </>
      )}
      <ToggleRow
        icon={<Droplet size={15} />} title="Watermark guest photos" checked={s.watermarkGuestUploads} disabled={!s.guestUploads}
        onChange={(v) => set({ watermarkGuestUploads: v })}
        description={s.watermarkGuestUploads ? 'Your watermark goes on what guests add' : 'Off'}
      />
    </SettingsCard>
  )
}

