import type { PhotoEvent } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { Card, DarkCard } from '@frameline/ui'
import { TextLink } from './parts'

/** Plain-language list of what a guest can do with the current settings. */
export function guestAbilities(event: PhotoEvent): string[] {
  const s = event.settings
  if (s.disabled) return ['Nothing right now: the event is disabled and guests see a “paused” message']
  const out: string[] = []
  out.push(s.access === 'link' ? 'Open the gallery with just the link'
    : s.access === 'link-pin' ? `Open the gallery with the link and PIN ${s.pin}`
      : 'Open the gallery only after you approve their registration')
  if (s.requireRegistration) out.push('Leave their name, email and mobile first')
  if (!s.skipAppLanding) out.push('See a “get the app” page before the gallery')
  if (s.faceSearch) {
    out.push(s.facePrivacy ? 'Take a selfie and see only their photos' : 'Browse every album, or take a selfie to find themselves')
    if (s.anonymousSelfie) out.push('Use selfie search without signing in')
  } else {
    out.push('Browse every album (selfie search is off)')
  }
  const quality = s.originalDownloads ? 'in original quality' : 'at up to 2048 px'
  const anon = s.anonymousDownloads ? ', without signing in' : ''
  if (s.downloads === 'all') out.push(`Download any photo ${quality}${anon}`)
  else if (s.downloads === 'own') out.push(`Download their own photos ${quality}${anon}`)
  else out.push('View photos, but not download them')
  out.push(s.watermarkOff ? 'See photos without your watermark' : 'See your watermark on every photo')
  if (s.guestUploads) out.push(`Upload up to ${fmt.count(s.guestUploadLimit)} photos${s.reviewGuestUploads ? ' (you review them)' : ' (they go live straight away)'}`)
  if (s.storeEnabled) out.push('Buy photos and prints from your store')
  if (s.allowEnquiries) out.push('Send you an enquiry')
  return out
}

export function GuestSummary({ event, onManageHosts }: { event: PhotoEvent; onManageHosts: () => void }) {
  const items = guestAbilities(event)
  const hosts = event.hosts
  return (
    <>
      <DarkCard aria-live="polite">
        <div className="font-mono text-[10.5px] uppercase tracking-[.09em] text-side-gold">What guests can do</div>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-[18px] text-[13px] leading-snug marker:text-side-ink-2">
          {items.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </DarkCard>
      <Card className="text-[12px] text-ink-2">
        <b className="text-[13px] text-ink">Hosts · {hosts.length}</b>
        <p className="mt-0.5">
          {hosts.length
            ? <>{hosts.map((h) => `${h.name}${h.role === 'client' ? ' (client)' : ''}`).join(', ')}. Hosts see everything and approve guest uploads. </>
            : <>No hosts yet. Hosts see everything and approve guest uploads. </>}
          <TextLink onClick={onManageHosts}>Manage</TextLink>
        </p>
      </Card>
    </>
  )
}
