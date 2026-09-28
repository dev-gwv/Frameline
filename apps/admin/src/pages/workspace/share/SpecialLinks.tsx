import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ChevronDown, Copy, Folder, KeyRound, QrCode, ScanFace, Upload } from 'lucide-react'
import type { Album, GuestLinkPayload, GuestLinkResult, PhotoEvent, Studio } from '@frameline/shared'
import { Button, Chip, Input, Select, cn, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../../lib/api'
import { usePeople } from '../../../lib/queries'
import { GALLERY_URL } from '../../../lib/url'
import { displayUrl, downloadBlob, slug } from '../lib'
import { useCopy } from './LinkTab'
import { StyledQR, svgString, svgToPng } from './qr'

type CardId = 'album' | 'person' | 'vip'

/** Share → Special links: one album, one person (from a face photo), family (VIP: no PIN, no sign-up, every photo). */
export function SpecialLinks({ event, albums, studio }: { event: PhotoEvent; albums: Album[]; studio?: Studio }) {
  const [open, setOpen] = useState<CardId | null>('person')
  const brand = studio?.brandColor ?? '#1C1814'
  const toggle = (id: CardId) => setOpen((o) => (o === id ? null : id))
  return (
    <div className="flex flex-col gap-2.5">
      <LinkCard id="album" icon={<Folder size={15} />} title="One album" body="Only one album, for example the Haldi photos for the bride’s family" open={open === 'album'} onToggle={toggle}>
        <AlbumLink event={event} albums={albums} brand={brand} />
      </LinkCard>
      <LinkCard id="person" icon={<ScanFace size={15} />} title="One person" body="Opens straight to one person’s photos, no selfie needed" open={open === 'person'} onToggle={toggle}>
        <PersonLink event={event} brand={brand} />
      </LinkCard>
      <LinkCard id="vip" icon={<KeyRound size={15} />} title="Family (VIP)" body="Skips the PIN and sign-up, and sees every photo" open={open === 'vip'} onToggle={toggle}>
        <VipLink event={event} brand={brand} />
      </LinkCard>
    </div>
  )
}

function LinkCard({ id, icon, title, body, open, onToggle, children }: { id: CardId; icon: ReactNode; title: string; body: string; open: boolean; onToggle: (id: CardId) => void; children: ReactNode }) {
  return (
    <div className={cn('rounded-card border bg-surface', open ? 'border-accent' : 'border-line')}>
      <button type="button" aria-expanded={open} onClick={() => onToggle(id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-sunk text-ink-2">{icon}</span>
        <span className="min-w-0 flex-1"><b className="block text-[14px]">{title}</b><span className="text-[12.5px] text-ink-2">{body}</span></span>
        {open ? <ChevronDown size={16} className="shrink-0 rotate-180 text-ink-3" /> : <span className="inline-flex h-[30px] shrink-0 items-center rounded-control border border-line-2 px-[11px] text-[12.5px] font-bold">Make link</span>}
      </button>
      {open && <div className="border-t border-line px-3.5 py-3">{children}</div>}
    </div>
  )
}

/** Makes the link through the API; any change to the options clears it so it's never stale. */
function useGuestLink(event: PhotoEvent) {
  const api = useApi()
  const toast = useToast()
  const [link, setLink] = useState<GuestLinkResult | null>(null)
  const [busy, setBusy] = useState(false)
  const make = async (payload: Omit<GuestLinkPayload, 'e'>) => {
    setBusy(true)
    try {
      const r = await api.createGuestLink(event.id, payload)
      // Point at this deployment's gallery (sample data answers with the production origin).
      setLink(r.path ? { ...r, url: `${GALLERY_URL}${r.path}` } : r)
    } catch (e) { toast.error('Couldn’t make the link', errorMessage(e)) } finally { setBusy(false) }
  }
  return { link, busy, make, clear: () => setLink(null) }
}

function LinkOut({ link, brand, name }: { link: GuestLinkResult; brand: string; name: string }) {
  const copy = useCopy()
  const toast = useToast()
  const qrRef = useRef<SVGSVGElement>(null)
  const [qr, setQr] = useState(false)
  const downloadQr = async () => {
    if (!qrRef.current) return
    try { downloadBlob(await svgToPng(svgString(qrRef.current), 1000), `${slug(name)}-qr.png`); toast.success('QR code downloaded') }
    catch (e) { toast.error('QR download failed', (e as Error).message) }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex h-[34px] min-w-0 flex-1 items-center rounded-control border border-line-2 bg-surface px-3 text-[13px]"><span className="truncate" title={link.url}>{displayUrl(link.url)}</span></div>
        <Button size="sm" variant="primary" icon={<Copy size={13} />} className="h-[34px]" onClick={() => void copy(link.url)}>Copy</Button>
        <Button size="sm" icon={<QrCode size={13} />} className="h-[34px]" aria-expanded={qr} onClick={() => setQr((v) => !v)}>QR</Button>
      </div>
      {qr && (
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-white p-1.5"><StyledQR ref={qrRef} value={link.url} size={88} color={brand} style="rounded" corner="rounded" /></div>
          <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-2">Print it on a card for them.<Button size="sm" onClick={() => void downloadQr()}>Download PNG</Button></div>
        </div>
      )}
    </div>
  )
}

function AlbumLink({ event, albums, brand }: { event: PhotoEvent; albums: Album[]; brand: string }) {
  const regular = albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order)
  const [albumId, setAlbumId] = useState(regular[0]?.id ?? '')
  const album = regular.find((a) => a.id === albumId)
  const g = useGuestLink(event)
  if (!regular.length) return <p className="text-[13px] text-ink-2">Make an album first (Photos tab → New album), then come back for its link.</p>
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <Select value={albumId} onChange={(e) => { setAlbumId(e.target.value); g.clear() }} aria-label="Album" className="min-w-0 flex-1">
          {regular.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        {!g.link && <Button loading={g.busy} onClick={() => album && void g.make({ album: album.id })}>Make link</Button>}
      </div>
      {g.link && <LinkOut link={g.link} brand={brand} name={`${event.name} ${album?.name ?? ''}`} />}
    </div>
  )
}

type FaceState = { kind: 'idle' } | { kind: 'checking'; url: string } | { kind: 'noface'; url: string } | { kind: 'nobody'; url: string } | { kind: 'broken' } | { kind: 'found'; url: string; personId: string; count: number } | { kind: 'error'; message: string }

/** Loads the image to check it opens and to tell the API its size (the API decides whether it holds a usable face). */
function probe(url: string) {
  return new Promise<{ w: number; h: number } | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function PersonLink({ event, brand }: { event: PhotoEvent; brand: string }) {
  const api = useApi()
  const people = usePeople(event.id).data
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<FaceState>({ kind: 'idle' })
  const [pasted, setPasted] = useState('')
  const g = useGuestLink(event)
  const { make, clear } = g

  const check = async (url: string, key: string) => {
    clear()
    setState({ kind: 'checking', url })
    const size = await probe(url)
    if (!size) { setState({ kind: 'broken' }); return }
    try {
      const r = await api.matchFaceForLink(event.id, { key, image: { width: size.w, height: size.h } })
      if (!r.faceFound) { setState({ kind: 'noface', url }); return }
      if (!r.personId || !r.photoIds.length) { setState({ kind: 'nobody', url }); return }
      setState({ kind: 'found', url, personId: r.personId, count: r.photoIds.length })
    } catch (e) { setState({ kind: 'error', message: errorMessage(e) }) }
  }
  useEffect(() => {
    if (state.kind === 'found') void make({ me: true, p: state.personId })
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setState({ kind: 'error', message: 'Choose a photo (JPG or PNG) with one clear face.' }); return }
    setPasted('')
    void check(URL.createObjectURL(f), `${f.name}|${f.size}|${f.lastModified}`)
  }
  const paste = () => {
    const v = pasted.trim()
    if (!/^https?:\/\/\S+\.\S+/.test(v)) { setState({ kind: 'error', message: 'Paste a full photo address starting with https://' }); return }
    void check(v, v)
  }
  const retry = () => { setState({ kind: 'idle' }); clear(); fileRef.current?.click() }
  const person = state.kind === 'found' ? people?.find((p) => p.id === state.personId) : undefined
  const face = 'url' in state ? state.url : undefined

  return (
    <div className="flex gap-3.5">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <button type="button" onClick={() => fileRef.current?.click()} aria-label={face ? 'Choose another face photo' : 'Upload a face photo'}
        className="grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-dashed border-line-2 bg-sunk text-ink-3 hover:border-accent">
        {face ? <img src={face} alt="Face to match" className="size-full object-cover" /> : <Upload size={20} />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {state.kind === 'idle' || state.kind === 'error' || state.kind === 'broken' ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>Upload their photo</Button>
            </div>
            <div className="flex gap-2">
              <Input value={pasted} onChange={(e) => setPasted(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && paste()} placeholder="Or paste a photo link" aria-label="Face photo link" className="h-[34px] text-[13px]" />
              <Button size="sm" className="h-[34px]" disabled={!pasted.trim()} onClick={paste}>Check</Button>
            </div>
            {state.kind === 'error' && <p className="text-[12.5px] font-semibold text-bad">{state.message}</p>}
            {state.kind === 'broken' && <p className="text-[12.5px] font-semibold text-bad">That didn’t open as a photo. Check the link or upload the file.</p>}
            {state.kind === 'idle' && <p className="text-[12.5px] text-ink-3">A photo with one clear face works best.</p>}
          </>
        ) : state.kind === 'checking' ? (
          <p className="py-2 text-[13px] text-ink-2">Looking for this face in the event…</p>
        ) : state.kind === 'found' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="ok" icon={<Check size={12} />}>Found in {state.count} photos</Chip>
              {person?.name && <span className="text-[12.5px] text-ink-3">{person.name}</span>}
            </div>
            {g.link ? <LinkOut link={g.link} brand={brand} name={`${event.name} ${person?.name ?? 'guest'}`} /> : <p className="text-[12.5px] text-ink-2">{g.busy ? 'Making the link…' : ''}</p>}
          </>
        ) : (
          <>
            <Chip tone="warn" icon={<AlertTriangle size={12} />}>{state.kind === 'noface' ? 'No face found' : 'Matched nobody'}</Chip>
            <p className="text-[12.5px] text-ink-2">{state.kind === 'noface' ? 'We couldn’t see a clear face in that photo. Try a closer, sharper one.' : 'This face isn’t in any photo of this event yet. Try another photo of them.'}</p>
            <Button size="sm" className="self-start" onClick={retry}>Try another photo</Button>
          </>
        )}
      </div>
    </div>
  )
}

function VipLink({ event, brand }: { event: PhotoEvent; brand: string }) {
  const g = useGuestLink(event)
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12.5px] text-ink-2">Anyone with this link skips the PIN and sign-up, sees every photo and can download all. Send it only to family or the client.</p>
      {g.link ? <LinkOut link={g.link} brand={brand} name={`${event.name} family`} />
        : <Button className="self-start" loading={g.busy} onClick={() => void g.make({ vip: { skipLogin: true, pin: true, all: true } })}>Make family link</Button>}
    </div>
  )
}
