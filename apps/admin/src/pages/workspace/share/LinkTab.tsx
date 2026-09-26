import { useState } from 'react'
import { Copy, Link2, Lock, Mail, MessageCircle, RefreshCw, Smartphone } from 'lucide-react'
import type { AccessMode, EventSettings, PhotoEvent, Studio } from '@frameline/shared'
import { Button, ConfirmDialog, Input, Segmented, Textarea, Toggle, useToast } from '@frameline/ui'
import { useApi } from '../../../lib/api'
import { useAction } from '../../../lib/queries'
import { copyText, galleryLink, https } from '../lib'
import { GuestPreview } from './GuestPreview'
import { fillTemplate, loadTemplate, mailtoUrl, variableValues, whatsappUrl } from './message'

export function useCopy() {
  const toast = useToast()
  return async (text: string, what = 'Link') => {
    const ok = await copyText(text)
    if (ok) toast.success(`${what} copied`)
    else toast.error(`Couldn’t copy the ${what.toLowerCase()}`, 'Select the text and press Ctrl+C instead.')
  }
}

export function useSettings(event: PhotoEvent) {
  const api = useApi()
  return useAction((patch: Partial<EventSettings>) => api.updateEventSettings(event.id, patch), { success: 'Saved' })
}

export function LinkTab({ event, studio }: { event: PhotoEvent; studio?: Studio }) {
  const api = useApi()
  const copy = useCopy()
  const settings = useSettings(event)
  const [confirmPin, setConfirmPin] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const s = event.settings
  const link = https(galleryLink(event, s.shortLinks))
  const resetPin = useAction(() => api.resetPin(event.id), { success: (pin) => `New PIN is ${pin}. The old one no longer works.` })

  const message = fillTemplate(loadTemplate(), variableValues(event, studio))
  const subject = `Your photos from ${event.name}`

  return (
    <div className="grid md:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4 px-5 py-4 sm:px-6">
        <div>
          <div className="mb-1.5 text-[12px] font-bold text-ink-2">Gallery link</div>
          <div className="flex gap-2">
            <Input readOnly value={link.replace(/^https:\/\//, '')} aria-label="Gallery link" icon={<Link2 size={14} />} className="min-w-0 flex-1 font-mono"
              onFocus={(e) => e.target.select()}
              suffix={<label className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-3">Short link <Toggle size="sm" label="Short links" checked={s.shortLinks} onCheckedChange={(v) => settings.mutate({ shortLinks: v })} /></label>} />
            <Button variant="primary" icon={<Copy size={14} />} onClick={() => copy(link)}>Copy</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<MessageCircle size={12} />} onClick={() => window.open(whatsappUrl(message), '_blank', 'noopener')}>WhatsApp</Button>
          <Button size="sm" icon={<Mail size={12} />} aria-expanded={showEmail} onClick={() => setShowEmail((v) => !v)}>Email</Button>
          <Button size="sm" icon={<Smartphone size={12} />} onClick={() => copy(event.shortId, 'App code')}>App link · code {event.shortId.toLowerCase()}</Button>
        </div>
        {showEmail && (
          <div className="rounded-card border border-line bg-sunk p-3">
            <div className="text-[12px] text-ink-2">Subject: <b className="text-ink">{subject}</b></div>
            <Textarea readOnly value={message} className="mt-2 min-h-32 text-[12.5px]" aria-label="Email text" />
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button size="sm" icon={<Copy size={12} />} onClick={() => copy(message, 'Email text')}>Copy text</Button>
              <Button size="sm" variant="dark" icon={<Mail size={12} />} onClick={() => { window.location.href = mailtoUrl(subject, message) }}>Open in email app</Button>
            </div>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[12px] font-bold text-ink-2">Who can open it</div>
          <div className="max-w-full overflow-x-auto scrollbar-thin">
            <Segmented<AccessMode> value={s.access} onChange={(v) => settings.mutate({ access: v, requireRegistration: v === 'registered' ? true : s.requireRegistration })} options={[
              { value: 'link', label: 'Anyone with the link' },
              { value: 'link-pin', label: 'Link + PIN', icon: <Lock size={12} /> },
              { value: 'registered', label: 'Registered guests' },
            ]} />
          </div>
        </div>
        <div className="rounded-card bg-sunk p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow">PIN</div>
              <b className="font-mono text-[24px] tracking-[.22em]">{s.pin}</b>
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={<Copy size={12} />} onClick={() => copy(s.pin, 'PIN')}>Copy</Button>
              <Button size="sm" icon={<RefreshCw size={12} />} loading={resetPin.isPending} onClick={() => setConfirmPin(true)}>New PIN</Button>
            </div>
          </div>
          <div className="mt-1.5 text-[12px] text-ink-2">
            {s.access === 'link-pin' ? 'Guests type it to open the gallery. ' : 'Guests don’t need it to open the gallery. '}
            The PIN also unlocks <b className="text-ink">Download all</b> on the web (5 times per guest) and shows every photo when “only their photos” is on.
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <b className="text-[13px]">Guests see only their own photos</b>
            <div className="text-[12px] text-ink-2">A selfie unlocks their matches</div>
          </div>
          <Toggle label="Guests see only their own photos" checked={s.facePrivacy} onCheckedChange={(v) => settings.mutate({ facePrivacy: v })} />
        </div>
      </div>
      <div className="border-t border-line bg-sunk p-5 md:border-l md:border-t-0">
        <GuestPreview event={event} studio={studio} />
      </div>
      <ConfirmDialog open={confirmPin} onOpenChange={setConfirmPin} title="Make a new PIN?" confirmLabel="Make new PIN"
        body={<>The current PIN <b className="font-mono text-ink">{s.pin}</b> stops working straight away. Guests who already opened the gallery stay signed in; anyone new needs the new PIN.</>}
        onConfirm={() => resetPin.mutate(undefined)} />
    </div>
  )
}
