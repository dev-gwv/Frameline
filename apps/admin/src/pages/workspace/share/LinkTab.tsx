import { useState, type ReactNode } from 'react'
import { ChevronRight, Copy, Eye, Link2, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import type { AccessMode, PhotoEvent, Studio } from '@frameline/shared'
import { Button, ConfirmDialog, Field, Select, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../../lib/api'
import { copyText, displayUrl, galleryLink } from '../lib'
import { fillTemplate, loadTemplate, mailtoUrl, variableValues, whatsappUrl } from './message'

export const ACCESS_LABEL: Record<AccessMode, string> = {
  link: 'Anyone with the link',
  'link-pin': 'Anyone with the link and PIN',
  registered: 'Only guests you approve',
}

export function useCopy() {
  const toast = useToast()
  return async (text: string, what = 'Link') => {
    const ok = await copyText(text)
    if (ok) toast.success(`${what} copied`)
    else toast.error(`Couldn’t copy the ${what.toLowerCase()}`, 'Select the text and press Ctrl+C instead.')
  }
}

/** Link tab: link + Copy link (gold), who can open it (same setting as event Settings), PIN, WhatsApp / Email / Open as a guest. */
export function useLinkTab(event: PhotoEvent, studio: Studio | undefined, onSpecial: () => void): { body: ReactNode; footer?: ReactNode } {
  const api = useApi()
  const toast = useToast()
  const copy = useCopy()
  const [confirmPin, setConfirmPin] = useState(false)
  const s = event.settings
  const link = galleryLink(event, s.shortLinks)
  const message = fillTemplate(loadTemplate(), variableValues(event, studio))

  const setAccess = async (access: AccessMode) => {
    const before = s.access
    try {
      await api.updateEventSettings(event.id, { access })
      toast.undo(`${ACCESS_LABEL[access]} can open it now`, () => { api.updateEventSettings(event.id, { access: before }).catch((e) => toast.error('Couldn’t undo', errorMessage(e))) })
    } catch (e) { toast.error('Couldn’t change who can open it', errorMessage(e)) }
  }
  const newPin = async () => {
    try { const pin = await api.resetPin(event.id); toast.success(`New PIN is ${pin}`, 'The old PIN no longer works.') }
    catch (e) { toast.error('Couldn’t make a new PIN', errorMessage(e)); throw e }
  }

  const body = (
    <>
      <Field label="Gallery link">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-control border border-line-2 bg-surface px-3 text-[13.5px] max-sm:h-11">
            <Link2 size={15} className="shrink-0 text-ink-3" /><span className="truncate" title={link}>{displayUrl(link)}</span>
          </div>
          <Button variant="primary" icon={<Copy size={15} />} onClick={() => void copy(link)} className="max-sm:h-11">Copy link</Button>
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <Field label="Who can open it" htmlFor="share-access" hint="Same setting as in the event’s Settings tab.">
          <Select id="share-access" value={s.access} onChange={(e) => void setAccess(e.target.value as AccessMode)}>
            {(Object.keys(ACCESS_LABEL) as AccessMode[]).map((k) => <option key={k} value={k}>{ACCESS_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="PIN">
          <div className="flex h-[38px] items-center gap-1 rounded-control border border-line-2 bg-surface pl-3 pr-1">
            <b className="flex-1 text-[15px] tracking-[.2em] tnum">{s.pin}</b>
            <button type="button" aria-label="Copy PIN" onClick={() => void copy(s.pin, 'PIN')} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunk hover:text-ink"><Copy size={14} /></button>
          </div>
          <button type="button" onClick={() => setConfirmPin(true)} className="mt-1 inline-flex min-h-[28px] items-center gap-1 text-[12.5px] font-bold text-accent-text hover:underline"><RefreshCw size={12} />New PIN</button>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<MessageCircle size={15} />} onClick={() => window.open(whatsappUrl(message), '_blank', 'noopener')}>Send on WhatsApp</Button>
        <Button icon={<Mail size={15} />} onClick={() => { window.location.href = mailtoUrl(`Your photos from ${event.name}`, message) }}>Email</Button>
        <Button variant="ghost" icon={<Eye size={15} />} onClick={() => window.open(link, '_blank', 'noopener')}>Open as a guest</Button>
      </div>
      <button type="button" onClick={onSpecial} className="-mx-1 flex items-center gap-3 border-t border-line px-1 pt-3 text-left">
        <span className="min-w-0 flex-1">
          <b className="block text-[14px]">Special links</b>
          <span className="text-[12.5px] text-ink-2">For one person, one album, or family who should skip the PIN</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-ink-3" />
      </button>
      <ConfirmDialog open={confirmPin} onOpenChange={setConfirmPin} title="Make a new PIN?" confirmLabel="Make new PIN"
        body={<>PIN <b className="text-ink tnum">{s.pin}</b> stops working straight away, so links and messages you already sent with it won’t open. Guests already inside stay signed in.</>}
        onConfirm={newPin} />
    </>
  )
  return { body }
}
