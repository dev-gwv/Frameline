import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock, ImagePlus, MessageCircle, X } from 'lucide-react'
import { Meter, useToast } from '@frameline/ui'
import { fmt, type Album, type HttpUploadFile, type PublicEvent, type PublicStudio } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest, useGuest, type EventSession } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { waLink } from '../lib/brand'
import { Sheet } from './Sheet'
import { linkBtn, PrimaryButton, StateBlock, WideButton } from './common'

const MAX_BATCH = 20

interface Picked { file: File; url: string }

/** Downscale to a small JPEG data URL so the mock can keep it (localStorage) and the admin can show it. */
async function toDataUrl(file: File, max = 900): Promise<{ url?: string; width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return { url: c.toDataURL('image/jpeg', 0.72), width: bmp.width, height: bmp.height }
  } catch { return {} }
}

/**
 * "Add your photos": api.uploadGuestPhotos puts them in the event's "Guest uploads" album (403
 * guest_uploads_disabled / 409 guest_upload_limit are shown inline). When the studio reviews guest uploads the
 * API returns them as pending ("Sent for review"); otherwise they're "Added to the gallery".
 */
export function UploadSheet({ open, onOpenChange, event, studio, guestAlbum, session }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PublicEvent; studio: PublicStudio; guestAlbum: Album | undefined; session: EventSession
}) {
  const api = useApi()
  const profileName = useGuest((s) => s.profile?.name)
  const { error } = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked[]>([])
  const [stage, setStage] = useState<'pick' | 'sending' | 'done'>('pick')
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [sent, setSent] = useState(0)
  const [pending, setPending] = useState(false)
  const [full, setFull] = useState(false)

  const remaining = full ? 0 : Math.max(0, event.settings.guestUploadLimit - (guestAlbum?.photoCount ?? 0))
  const cap = Math.min(MAX_BATCH, remaining)
  const review = event.settings.reviewGuestUploads

  useEffect(() => {
    if (!open) { picked.forEach((p) => URL.revokeObjectURL(p.url)); setPicked([]); setStage('pick'); setNote(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function add(files: FileList | null) {
    if (!files) return
    const imgs = [...files].filter((f) => f.type.startsWith('image/'))
    const skipped = files.length - imgs.length
    const room = cap - picked.length
    const take = imgs.slice(0, Math.max(0, room))
    const msgs: string[] = []
    if (skipped) msgs.push(`${skipped} ${skipped === 1 ? 'file isn’t a photo and was' : 'files aren’t photos and were'} left out.`)
    if (imgs.length > take.length) msgs.push(`You can send up to ${cap} photos at a time.`)
    setNote(msgs.join(' ') || null)
    setPicked((p) => [...p, ...take.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  async function send() {
    if (!picked.length) return
    setStage('sending'); setProgress(0)
    try {
      const files: HttpUploadFile[] = []
      for (const [i, p] of picked.entries()) {
        // The preview data URL is what the mock keeps; the HTTP client uploads the original bytes (blob).
        const r = await toDataUrl(p.file)
        files.push({ filename: p.file.name, size: p.file.size, contentType: p.file.type || 'image/jpeg', blob: p.file, ...r })
        setProgress(i + 1)
      }
      const uploadedBy = session.registration?.name ?? profileName ?? session.greeting ?? 'Guest'
      const created = await api.uploadGuestPhotos(event.shortId, files, { uploadedBy })
      guest.patchSession(event.shortId, (s) => ({ uploads: s.uploads + created.length }))
      setSent(created.length)
      setPending(created.some((c) => c.reviewStatus === 'pending'))
      picked.forEach((p) => URL.revokeObjectURL(p.url))
      setPicked([])
      setStage('done')
    } catch (e) {
      const f = friendlyError(e, 'Your photos weren’t sent')
      if (f.code === 'guest_upload_limit' && /reached its limit/.test(f.body)) setFull(true)
      if (f.code === 'guest_upload_limit' || f.code === 'guest_uploads_disabled' || f.code === 'no_guest_album') setNote(`${f.title}. ${f.body}`)
      else error(f.title, f.body)
      setStage('pick')
    }
  }

  const n = picked.length
  const footer = stage === 'pick' && remaining > 0 ? (
    n ? <PrimaryButton onClick={() => void send()}>Send {n} {n === 1 ? 'photo' : 'photos'}</PrimaryButton>
      : <PrimaryButton icon={<ImagePlus size={17} />} onClick={() => input.current?.click()}>Choose photos</PrimaryButton>
  ) : stage === 'done' ? (
    <>
      <WideButton icon={<ImagePlus size={16} />} onClick={() => setStage('pick')}>Send more</WideButton>
      <button type="button" className="min-h-11 text-[13.5px] font-extrabold text-accent-text hover:underline" onClick={() => onOpenChange(false)}>Done</button>
    </>
  ) : undefined

  return (
    <Sheet open={open} onOpenChange={(v) => { if (stage !== 'sending') onOpenChange(v) }} hideClose={stage === 'sending'} footer={footer}
      title={stage === 'done' ? (pending ? 'Sent for review' : 'Added to the gallery') : stage === 'sending' ? 'Sending your photos…' : 'Add your photos'}
      description={stage === 'pick' && remaining > 0 ? `${review ? 'The host checks them before everyone can see them.' : 'They go straight into the Guest uploads album.'} Up to ${cap} at a time.` : undefined}>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      {stage === 'pick' && (
        remaining === 0 ? (
          <StateBlock className="py-4" icon={<ImagePlus size={24} />} tone="neutral" title="This gallery is full"
            body={`It has reached its limit of ${fmt.count(event.settings.guestUploadLimit)} guest photos. Send extras to ${studio.name} directly.`}>
            <a href={waLink(studio, `Hi ${studio.name}, I have photos from ${event.name} to share.`)}
              target="_blank" rel="noreferrer noopener" className={linkBtn()}><MessageCircle size={16} />Message on WhatsApp</a>
          </StateBlock>
        ) : (
          <div className="flex flex-col gap-3">
            {note && <p role="alert" className="rounded-card bg-warn-soft p-3 text-[13px] font-semibold text-warn">{note}</p>}
            {n > 0 ? (
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-label="Photos to send">
                {picked.map((p, i) => (
                  <li key={p.url} className="relative aspect-square overflow-hidden rounded-[6px] bg-sunk">
                    <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                    <button type="button" aria-label={`Remove ${p.file.name}`} onClick={() => { URL.revokeObjectURL(p.url); setPicked((l) => l.filter((_, j) => j !== i)) }}
                      className="absolute right-0.5 top-0.5 grid size-9 place-items-center rounded-full text-white"><span className="grid size-6 place-items-center rounded-full bg-black/60"><X size={13} /></span></button>
                  </li>
                ))}
                {n < cap && (
                  <li>
                    <button type="button" onClick={() => input.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-line-2 text-[12px] font-bold text-ink-2 hover:bg-sunk">
                      <ImagePlus size={20} />Add more
                    </button>
                  </li>
                )}
              </ul>
            ) : (
              <button type="button" onClick={() => input.current?.click()}
                className="flex flex-col items-center gap-1.5 rounded-card border-2 border-dashed border-line-2 px-4 py-8 text-center hover:bg-sunk">
                <ImagePlus size={26} className="text-accent-text" />
                <b className="text-[14px]">Pick photos from your phone</b>
                <span className="text-[12.5px] text-ink-3">{fmt.count(remaining)} spots left for guests</span>
              </button>
            )}
            {event.settings.watermarkGuestUploads && <p className="text-[12.5px] text-ink-3">Guest photos get the studio’s watermark.</p>}
          </div>
        )
      )}
      {stage === 'sending' && (
        <div className="flex flex-col gap-3 py-3" role="status" aria-live="polite">
          <div className="flex justify-between text-[14px]"><b>Sending…</b><span className="tnum text-ink-2">{progress} of {n}</span></div>
          <Meter value={progress} max={n} height={8} />
          <p className="text-[12.5px] text-ink-3">Keep this page open until they’re sent.</p>
        </div>
      )}
      {stage === 'done' && (
        <StateBlock className="py-4" icon={pending ? <Clock size={24} /> : <CheckCircle2 size={26} />} tone={pending ? 'gold' : 'ok'}
          title={`${sent} ${sent === 1 ? 'photo' : 'photos'} sent`}
          body={pending ? `${studio.name} checks guest photos first. They’ll appear in Guest uploads once approved.` : 'They’re in the Guest uploads album now. Thank you!'} />
      )}
    </Sheet>
  )
}
