import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Download, ExternalLink, Folder, Link2, Printer, QrCode, ScanFace, Star, Upload, X } from 'lucide-react'
import type { Album, GuestLinkPayload, GuestLinkResult, PhotoEvent, Studio } from '@frameline/shared'
import { Button, Field, IconTile, Input, Select, Tip, Toggle, cn, useToast } from '@frameline/ui'
import { useApi } from '../../../lib/api'
import { useAction } from '../../../lib/queries'
import { GALLERY_URL, displayUrl, downloadBlob, galleryLink, slug } from '../lib'
import { useCopy } from './LinkTab'
import { StyledQR, buildPoster, downloadSvg, svgString, svgToPng } from './qr'
import type { ShareTab } from './ShareModal'

export function PersonalTab({ event, studio, albums, onTab }: { event: PhotoEvent; studio?: Studio; albums: Album[]; onTab: (t: ShareTab) => void }) {
  const toast = useToast()
  const qrRef = useRef<SVGSVGElement>(null)
  const brand = studio?.brandColor ?? '#8C2F39'
  const link = galleryLink(event, event.settings.shortLinks)
  const poster = () => {
    if (!qrRef.current) return
    downloadSvg(buildPoster({ qrSvg: svgString(qrRef.current), studio: studio?.name ?? 'Your studio', event: event.name, link: displayUrl(link), pin: event.settings.access === 'link-pin' ? event.settings.pin : undefined, color: brand }), `${slug(event.name)}-poster-a4.svg`)
    toast.success('A4 poster downloaded')
  }
  return (
    <>
      <div className="grid gap-3.5 px-5 py-4 sm:px-6 lg:grid-cols-3">
        <AlbumLinkCard event={event} albums={albums} brand={brand} />
        <FaceLinkCard event={event} brand={brand} />
        <VipLinkCard event={event} brand={brand} />
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line bg-sunk px-5 py-3.5 sm:px-6">
        <div className="rounded-lg bg-white p-1.5"><StyledQR ref={qrRef} value={link} size={64} color={brand} style="rounded" corner="rounded" /></div>
        <div className="min-w-[220px] flex-1">
          <b className="text-[13px]">QR code tab</b>
          <div className="text-[12px] text-ink-2">Style: Rounded · Soft · Hybrid · Classic. Corners: rounded, circle, square. Brand colour, your logo in the centre (up to 80 KB), separate codes for the web gallery and the app, PNG or SVG, and an A4 poster.</div>
        </div>
        <div className="flex gap-2">
          <Button icon={<QrCode size={14} />} onClick={() => onTab('qr')}>Customise</Button>
          <Button icon={<Printer size={14} />} onClick={poster}>Poster</Button>
        </div>
      </div>
    </>
  )
}

/**
 * Personal links are made by the API: the real one stores the payload and returns a signed short code,
 * the sample data returns an unsigned token. A changed option clears the old link so it's never stale.
 */
function useGuestLink(event: PhotoEvent, payload: Omit<GuestLinkPayload, 'e'> | null) {
  const api = useApi()
  const key = JSON.stringify(payload)
  const [made, setMade] = useState<{ key: string; link: GuestLinkResult } | null>(null)
  const create = useAction((p: Omit<GuestLinkPayload, 'e'>) => api.createGuestLink(event.id, p), {
    error: 'Couldn’t make the link',
    onSuccess: (link, p) => setMade({ key: JSON.stringify(p), link }),
  })
  const link = made && made.key === key ? made.link : null
  return { link, create: () => { if (payload) create.mutate(payload) }, creating: create.isPending, ready: !!payload }
}

function Card({ icon, title, body, highlight, children }: { icon: ReactNode; title: string; body: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2.5 rounded-card border bg-surface p-4', highlight ? 'border-accent' : 'border-line')}>
      <div className="flex items-center gap-2"><IconTile>{icon}</IconTile><b className="text-[13.5px]">{title}</b></div>
      <div className="text-[12px] text-ink-2">{body}</div>
      {children}
    </div>
  )
}

function Opt({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 text-[12.5px]">
      <span>{hint ? <><b>{label}</b><span className="block text-[11px] text-ink-3">{hint}</span></> : label}</span>
      <Toggle size="sm" label={label} checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function LinkOut({ link, ready, creating, onCreate, placeholder, brand, name }: {
  link: GuestLinkResult | null; ready: boolean; creating: boolean; onCreate: () => void; placeholder: string; brand: string; name: string
}) {
  const copy = useCopy()
  const toast = useToast()
  const qrRef = useRef<SVGSVGElement>(null)
  if (!link) {
    return (
      <Button className="mt-auto justify-center" icon={<Link2 size={14} />} disabled={!ready} loading={creating} onClick={onCreate}>
        {ready ? 'Make link' : placeholder}
      </Button>
    )
  }
  // Open the preview on this environment's gallery; share the address the API returned.
  const preview = `${GALLERY_URL}${link.path}`
  const downloadQr = async () => {
    if (!qrRef.current) return
    try { downloadBlob(await svgToPng(svgString(qrRef.current), 1000), `${slug(name)}-qr.png`); toast.success('QR code downloaded') }
    catch (e) { toast.error('QR download failed', (e as Error).message) }
  }
  return (
    <div className="mt-auto flex flex-col gap-2">
      <div className="flex h-9 items-center gap-1 rounded-control border border-line-2 bg-sunk pl-3 pr-1">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={link.url}>{displayUrl(link.url)}</span>
        <Tip label="Copy link">
          <button type="button" aria-label="Copy link" className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface" onClick={() => copy(link.url)}><Copy size={13} /></button>
        </Tip>
        <Tip label="Open as the guest">
          <a href={preview} target="_blank" rel="noopener noreferrer" aria-label="Open as the guest" className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface"><ExternalLink size={13} /></a>
        </Tip>
      </div>
      <div className="flex items-center gap-2.5">
        <SmallQR ref={qrRef} value={link.url} color={brand} />
        <span className="flex-1 text-[11.5px] text-ink-3">Print this code on a card for them.</span>
        <Button size="sm" icon={<Download size={12} />} onClick={() => void downloadQr()}>QR</Button>
      </div>
    </div>
  )
}

const SmallQR = forwardRef<SVGSVGElement, { value: string; color: string }>(function SmallQR({ value, color }, ref) {
  return <div className="shrink-0 rounded-md bg-white p-1"><StyledQR ref={ref} value={value} size={52} color={color} style="rounded" corner="rounded" /></div>
})

function AlbumLinkCard({ event, albums, brand }: { event: PhotoEvent; albums: Album[]; brand: string }) {
  const regular = albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order)
  const [albumId, setAlbumId] = useState(regular[0]?.id ?? '')
  const album = regular.find((a) => a.id === albumId)
  const g = useGuestLink(event, album ? { album: album.id } : null)
  return (
    <Card icon={<Folder size={14} />} title="Album link" body="Guests land straight on one album.">
      <Select value={albumId} onChange={(e) => setAlbumId(e.target.value)} aria-label="Album" disabled={!regular.length}>
        {regular.length ? regular.map((a) => <option key={a.id} value={a.id}>{a.name}</option>) : <option value="">No albums yet</option>}
      </Select>
      <LinkOut link={g.link} ready={g.ready} creating={g.creating} onCreate={g.create} placeholder="Create an album first" brand={brand} name={`${event.name} ${album?.name ?? ''}`} />
    </Card>
  )
}

function FaceLinkCard({ event, brand }: { event: PhotoEvent; brand: string }) {
  const api = useApi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [face, setFace] = useState<{ url: string; key: string; local: boolean } | null>(null)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [myPhotos, setMyPhotos] = useState(true)
  const [personId, setPersonId] = useState<string | null>(null)
  useEffect(() => () => { if (face?.local) URL.revokeObjectURL(face.url) }, [face])
  // Match the face to a person in this event so the link opens straight on their photos.
  useEffect(() => {
    setPersonId(null)
    if (!face) return
    let live = true
    api.searchFaces(event.shortId, { key: face.key }).then((r) => { if (live) setPersonId(r.personId) }).catch(() => { /* the link still works: they take one selfie */ })
    return () => { live = false }
  }, [api, event.shortId, face])

  const pick = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Choose a photo (JPG or PNG) with one clear face.')
    setError('')
    setPasted('')
    setFace({ url: URL.createObjectURL(f), key: `${f.name}|${f.size}|${f.lastModified}`, local: true })
  }
  const paste = (v: string) => {
    setPasted(v)
    if (!v.trim()) { if (!face?.local) setFace(null); setError(''); return }
    if (!/^https?:\/\/\S+\.\S+/.test(v.trim())) { setError('Paste a full photo address starting with https://'); return }
    setError('')
    setFace({ url: v.trim(), key: v.trim(), local: false })
  }
  const g = useGuestLink(event, face && !error ? { n: name.trim() || undefined, me: myPhotos || undefined, p: personId ?? undefined } : null)
  return (
    <Card icon={<ScanFace size={14} />} title="Face link for one guest" body="Their photos open with no selfie needed, for grandparents or the couple." highlight>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <div className="flex items-center gap-3">
        <div className="relative">
          <button type="button" aria-label={face ? 'Change face photo' : 'Upload a face photo'} onClick={() => fileRef.current?.click()}
            className="grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-accent bg-accent-soft text-accent-text">
            {face ? <img src={face.url} alt="Face to match" className="size-full object-cover" onError={() => setError('That address didn’t load as an image. Check the link.')} /> : <Upload size={16} />}
          </button>
          {face && <button type="button" aria-label="Remove face photo" onClick={() => { setFace(null); setPasted('') }} className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-line bg-surface text-ink-2"><X size={11} /></button>}
        </div>
        <Field label="Welcome name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dadi ji" maxLength={40} /></Field>
      </div>
      <Input value={pasted} onChange={(e) => paste(e.target.value)} placeholder="Or paste a photo URL with one clear face" aria-label="Face photo URL" className="text-[12px]" />
      {error && <div className="text-[11.5px] font-semibold text-bad">{error}</div>}
      <Opt label="Start on “My photos”" checked={myPhotos} onChange={setMyPhotos} />
      {face && !error && <div className="text-[11.5px] text-ink-3">{personId ? 'Matched to a person in this event.' : 'No match yet: they’ll take one selfie when they open it.'}</div>}
      <LinkOut link={g.link} ready={g.ready} creating={g.creating} onCreate={g.create} placeholder="Add a face photo to make the link" brand={brand} name={`${event.name} ${name || 'guest'}`} />
    </Card>
  )
}

function VipLinkCard({ event, brand }: { event: PhotoEvent; brand: string }) {
  const [skip, setSkip] = useState(true)
  const [pin, setPin] = useState(true)
  const [all, setAll] = useState(false)
  const g = useGuestLink(event, skip || pin || all ? { vip: { skipLogin: skip || undefined, pin: pin || undefined, all: all || undefined } } : null)
  return (
    <Card icon={<Star size={14} />} title="VIP link" body="For family and the client. More access, no friction.">
      <Opt label="Skip sign-in" hint="Browse and download without an account" checked={skip} onChange={setSkip} />
      <Opt label="Include PIN" hint="Download all works without typing it" checked={pin} onChange={setPin} />
      <Opt label="See all photos" hint="Ignores “only their photos”" checked={all} onChange={setAll} />
      <LinkOut link={g.link} ready={g.ready} creating={g.creating} onCreate={g.create} placeholder="Turn on at least one option" brand={brand} name={`${event.name} vip`} />
    </Card>
  )
}
