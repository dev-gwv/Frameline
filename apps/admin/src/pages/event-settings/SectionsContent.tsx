import { useNavigate } from 'react-router-dom'
import { CheckCheck, Droplet, Globe, MessageSquare, Palette, ShoppingBag, Stamp, Upload } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Chip, Toggle } from '@frameline/ui'
import { useStudio, useUsage } from '../../lib/queries'
import { AutoField, Row, SectionCard } from './parts'
import type { SectionProps } from './SectionsPrivacy'

const MAX_GUEST_LIMIT = 5000

export function GuestUploadsSection({ event, set }: SectionProps) {
  const s = event.settings
  const usage = useUsage().data
  const left = usage ? usage.photosLimit - usage.photosUsed : undefined
  return (
    <SectionCard id="guest-uploads" title="Guest uploads">
      <Row
        icon={<Upload size={15} />} title="Let guests upload their photos" description="Uploads land in the Guest uploads album"
        control={<Toggle label="Let guests upload their photos" checked={s.guestUploads} onCheckedChange={(v) => set({ guestUploads: v })} />}
      />
      {s.guestUploads && (
        <>
          <div className="border-t border-line py-3">
            <AutoField
              id="guest-limit" label="Most photos guests can upload" value={String(s.guestUploadLimit)} inputMode="numeric" className="max-w-[260px]"
              format={(v) => v.replace(/\D/g, '').slice(0, 5)}
              suffix={<span className="text-[12px] text-ink-3">photos</span>}
              validate={(v) => { const n = Number(v); return !v || n < 1 ? 'Enter at least 1 photo.' : n > MAX_GUEST_LIMIT ? `Keep it at ${fmt.count(MAX_GUEST_LIMIT)} or fewer.` : null }}
              hint={`Reserved from your plan${left !== undefined ? ` · ${fmt.count(left)} photos left` : ''}`}
              onSave={(v) => set({ guestUploadLimit: Number(v) })}
            />
          </div>
          <Row
            icon={<Droplet size={15} />} title="Watermark guest photos" description="Adds your watermark to what guests upload"
            control={<Toggle label="Watermark guest photos" checked={s.watermarkGuestUploads} onCheckedChange={(v) => set({ watermarkGuestUploads: v })} />}
          />
          <Row
            icon={<CheckCheck size={15} />} title="Review before publishing"
            description={s.reviewGuestUploads ? 'You or a host approve each upload in Guests' : 'Guest photos go live straight away'}
            control={<Toggle label="Review before publishing" checked={s.reviewGuestUploads} onCheckedChange={(v) => set({ reviewGuestUploads: v })} />}
          />
        </>
      )}
    </SectionCard>
  )
}

export function WatermarkSection({ event, set }: SectionProps) {
  const navigate = useNavigate()
  const s = event.settings
  return (
    <SectionCard id="watermark" title="Watermark">
      <Row
        icon={<Droplet size={15} />} title="Turn off the watermark for this event"
        description={s.watermarkOff ? 'Guests see and download clean photos' : 'Your studio watermark is on every photo guests see'}
        control={<Toggle label="Turn off the watermark for this event" checked={s.watermarkOff} onCheckedChange={(v) => set({ watermarkOff: v })} />}
      />
      <Row
        icon={<Stamp size={15} />} title="Use a different watermark for this event" description="Set an event rule in Watermarks, e.g. the couple’s monogram"
        control={<Button size="sm" disabled={s.watermarkOff} onClick={() => navigate(`/watermarks?event=${event.id}`)}>Open Watermarks</Button>}
      />
    </SectionCard>
  )
}

export function BrandingSection() {
  const navigate = useNavigate()
  const studio = useStudio().data
  return (
    <SectionCard id="branding" title="Branding" action={<Chip tone="accent">Uses studio brand</Chip>}>
      <Row
        icon={<Palette size={15} />}
        title={studio ? studio.name : 'Studio brand'}
        description={<>Logo, cover and colour come from your studio profile{studio && <> · <span className="font-mono">{studio.handle}.frameline.in</span></>}</>}
        control={
          <div className="flex items-center gap-2">
            {studio && <span className="size-7 rounded-control border border-line" style={{ background: studio.brandColor }} aria-label={`Brand colour ${studio.brandColor}`} />}
            <Button size="sm" onClick={() => navigate('/settings/profile')}>Edit studio brand</Button>
          </div>
        }
      />
    </SectionCard>
  )
}

export function StoreSection({ event, set }: SectionProps) {
  const navigate = useNavigate()
  const s = event.settings
  return (
    <SectionCard id="store" title="Store">
      <Row
        icon={<ShoppingBag size={15} />} title="Sell photos and prints from this event"
        description={s.storeEnabled ? 'Guests can buy downloads and prints. Money goes to your wallet' : 'Off: nothing is for sale'}
        control={
          <div className="flex items-center gap-2">
            {s.storeEnabled && <Button size="sm" variant="ghost" onClick={() => navigate('/store')}>Set prices</Button>}
            <Toggle label="Sell photos and prints from this event" checked={s.storeEnabled} onCheckedChange={(v) => set({ storeEnabled: v })} />
          </div>
        }
      />
    </SectionCard>
  )
}

export function WebsiteSection({ event, set }: SectionProps) {
  const studio = useStudio().data
  const s = event.settings
  return (
    <SectionCard id="website" title="Website & leads">
      <Row
        icon={<Globe size={15} />} title="Show on my website"
        description={<>Adds this event to Galleries{studio && <> on <span className="font-mono">{studio.handle}.frameline.in</span></>}</>}
        control={<Toggle label="Show on my website" checked={s.showOnWebsite} onCheckedChange={(v) => set({ showOnWebsite: v })} />}
      />
      <Row
        icon={<MessageSquare size={15} />} title="Allow enquiries" description="Guests can ask you about a shoot. Enquiries arrive in Website → Enquiries"
        control={<Toggle label="Allow enquiries" checked={s.allowEnquiries} onCheckedChange={(v) => set({ allowEnquiries: v })} />}
      />
    </SectionCard>
  )
}
