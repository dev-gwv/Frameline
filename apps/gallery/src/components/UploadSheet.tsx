import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ImagePlus, X } from 'lucide-react'
import { Button, Meter, useToast } from '@frameline/ui'
import { fmt, type Album, type HttpUploadFile, type PublicEvent, type PublicStudio } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest, useGuest, type EventSession } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { Sheet } from './Sheet'

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
 * "Add your photos" — guest uploads into the event's guest album with api.uploadPhotos({ source: 'guest' }).
 * When the studio reviews guest uploads the API returns them as pending ("sent for review").
 */
export function UploadSheet({ open, onOpenChange, event, studio, guestAlbum, session }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PublicEvent; studio: PublicStudio; guestAlbum: Album | undefined; session: EventSession
}) {
  const api = useApi()
  const profileName = useGuest((s) => s.profile?.name)
  const { error } = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked[]>([])
  const [stage, setStage] = useState<'pick' | 'uploading' | 'done'>('pick')
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [sent, setSent] = useState(0)
  const [pending, setPending] = useState(false)

  const remaining = Math.max(0, event.settings.guestUploadLimit - (guestAlbum?.photoCount ?? 0))
  const cap = Math.min(MAX_BATCH, remaining)

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
    if (skipped) msgs.push(`${skipped} ${skipped === 1 ? 'file isn\'t' : 'files aren\'t'} photos and ${skipped === 1 ? 'was' : 'were'} skipped.`)
    if (imgs.length > take.length) msgs.push(`You can send up to ${cap} photos at a time.`)
    setNote(msgs.join(' ') || null)
    setPicked((p) => [...p, ...take.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  async function upload() {
    if (!guestAlbum || !picked.length) return
    setStage('uploading'); setProgress(0)
    try {
      const files: HttpUploadFile[] = []
      for (const [i, p] of picked.entries()) {
        // The preview data URL is what the mock keeps; the HTTP client uploads the original bytes (blob).
        const r = await toDataUrl(p.file)
        files.push({ filename: p.file.name, size: p.file.size, contentType: p.file.type || 'image/jpeg', blob: p.file, ...r })
        setProgress(i + 1)
      }
      const uploadedBy = session.registration?.name ?? profileName ?? session.greeting ?? 'Guest'
      const created = await api.uploadPhotos(event.id, guestAlbum.id, files, {
        quality: 'web', source: 'guest', uploadedBy, watermark: event.settings.watermarkGuestUploads,
      })
      guest.patchSession(event.shortId, (s) => ({ uploads: s.uploads + created.length }))
      setSent(created.length)
      setPending(created.some((c) => c.reviewStatus === 'pending'))
      setStage('done')
    } catch (e) {
      const f = friendlyError(e, 'Upload failed')
      error(f.title, f.body)
      setStage('pick')
    }
  }

  const footer = stage === 'pick' ? (
    <Button variant="primary" size="lg" className="w-full justify-center" disabled={!picked.length || !guestAlbum} onClick={upload}>
      {picked.length ? `Send ${picked.length} ${picked.length === 1 ? 'photo' : 'photos'}` : 'Choose photos first'}
    </Button>
  ) : undefined

  return (
    <Sheet open={open} onOpenChange={(v) => { if (stage !== 'uploading') onOpenChange(v) }}
      title={stage === 'done' ? (pending ? 'Sent for review' : 'Photos added') : 'Add your photos'}
      description={stage === 'pick' ? `Share the photos you took at ${event.name}.` : undefined} footer={footer}>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      {stage === 'pick' && (
        remaining === 0 ? (
          <p className="rounded-card bg-sunk p-3 text-[13.5px] text-ink-2">This event has reached its limit of {fmt.count(event.settings.guestUploadLimit)} guest photos. Send extras to {studio.name} directly.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => input.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-card border-2 border-dashed border-line-2 px-4 py-6 text-center hover:bg-sunk">
              <ImagePlus size={26} className="text-accent-text" />
              <b className="text-[14px]">{picked.length ? 'Add more photos' : 'Choose photos'}</b>
              <span className="text-[12px] text-ink-3">Up to {cap} at a time · {fmt.count(remaining)} spots left for guests</span>
            </button>
            {note && <p role="status" className="text-[12.5px] font-semibold text-warn">{note}</p>}
            {picked.length > 0 && (
              <ul className="grid grid-cols-4 gap-1.5" aria-label="Photos to send">
                {picked.map((p, i) => (
                  <li key={p.url} className="relative aspect-square overflow-hidden rounded-[6px] bg-sunk">
                    <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                    <button type="button" aria-label={`Remove ${p.file.name}`} onClick={() => { URL.revokeObjectURL(p.url); setPicked((l) => l.filter((_, j) => j !== i)) }}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11.5px] text-ink-3">
              {event.settings.reviewGuestUploads ? `${studio.name} reviews guest photos before other guests can see them.` : 'Your photos appear in the Guest uploads album.'}
              {event.settings.watermarkGuestUploads && ' Guest photos are watermarked.'}
            </p>
          </div>
        )
      )}
      {stage === 'uploading' && (
        <div className="flex flex-col gap-3 py-3" role="status" aria-live="polite">
          <div className="flex justify-between"><b>Sending…</b><span className="font-mono text-[12px] tnum text-ink-2">{progress} / {picked.length}</span></div>
          <Meter value={progress} max={picked.length} height={8} />
        </div>
      )}
      {stage === 'done' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={38} className="text-ok" />
          <p className="max-w-xs text-[13.5px] text-ink-2">
            {pending
              ? `${sent} ${sent === 1 ? 'photo was' : 'photos were'} sent to the photographer for review. They'll appear in Guest uploads once approved.`
              : `${sent} ${sent === 1 ? 'photo is' : 'photos are'} now in Guest uploads. Thank you!`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => { setPicked([]); setStage('pick') }}>Send more</Button>
            <Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      )}
      <span className="sr-only">{session.uploads ? `You've sent ${session.uploads} photos so far.` : ''}</span>
    </Sheet>
  )
}
