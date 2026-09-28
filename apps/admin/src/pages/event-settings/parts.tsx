import { useState, type HTMLAttributes, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { EventSettings, PhotoEvent } from '@frameline/shared'
import { cn, SettingRow, Toggle } from '@frameline/ui'
import type { SaveEvent, SaveSettings } from './useEventSaver'

export interface CardProps { event: PhotoEvent; set: SaveSettings; update: SaveEvent }

/** Kamero-style settings card: 15px title, then toggle rows. */
export function SettingsCard({ id, title, children, className, action }: { id?: string; title: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cn('scroll-mt-20 rounded-card border border-line bg-surface px-[18px] pb-2 pt-4 shadow-card', className)}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id={id ? `${id}-h` : undefined} className="font-sans text-[15px] font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A row with a switch that saves one boolean setting straight away. */
export function ToggleRow({ icon, title, description, checked, onChange, disabled }: {
  icon: ReactNode; title: string; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return <SettingRow icon={icon} title={title} description={description} control={<Toggle label={title} checked={checked} disabled={disabled} onCheckedChange={onChange} />} />
}

/** Folds rare options (rule 9). */
export function MoreOptions({ children, label = 'More options' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[40px] items-center gap-1 text-[12.5px] font-bold text-ink-2 hover:text-ink">
        {label}<ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="-mt-1 [&>*:first-child]:border-t-0">{children}</div>}
    </div>
  )
}

export function TextLink({ className, ...rest }: HTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn('font-bold text-accent-text hover:underline', className)} {...rest} />
}

export function SaveIndicator({ saving }: { saving: boolean }) {
  return saving
    ? <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-3" role="status"><span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />Saving…</span>
    : <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-ink-3" role="status"><Check size={13} className="text-ok" aria-hidden />Saved</span>
}

/** "open the link with PIN 5211 · see only photos they’re in · …" in plain words, from the current settings. */
export function guestSentence(s: EventSettings): string {
  if (s.disabled) return 'nothing right now. The gallery is turned off, so guests see a “paused” message.'
  const parts: string[] = []
  const open = s.access === 'link' ? 'open the link' : s.access === 'link-pin' ? `open the link with PIN ${s.pin}` : 'open the link once you approve them'
  parts.push(s.requireRegistration ? `${open} after giving their name and phone` : open)
  parts.push(!s.faceSearch ? 'see every photo' : s.facePrivacy ? 'see only photos they’re in' : 'see every photo or find theirs with a selfie')
  const size = s.originalDownloads ? 'full size' : 'web size'
  parts.push(s.downloads === 'all' ? `download any photo at ${size}` : s.downloads === 'own' ? `download their own photos at ${size}` : 'not download photos')
  if (s.guestUploads) parts.push(`add up to ${s.guestUploadLimit.toLocaleString('en-IN')} photos${s.reviewGuestUploads ? ' for your review' : ''}`)
  if (s.storeEnabled) parts.push('buy photos and prints')
  return parts.join(' · ')
}
