import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Folder, Printer, QrCode, ScanFace, Star, Upload, X } from 'lucide-react'
import { hash, type Album, type PhotoEvent, type Studio } from '@frameline/shared'
import { Button, Field, IconTile, Input, Select, Tip, Toggle, cn, useToast } from '@frameline/ui'
import { galleryLink, https, linkToken, slug } from '../lib'
import { useCopy } from './LinkTab'
import { StyledQR, buildPoster, downloadSvg, svgString } from './qr'
import type { ShareTab } from './ShareModal'

export function PersonalTab({ event, studio, albums, onTab }: { event: PhotoEvent; studio?: Studio; albums: Album[]; onTab: (t: ShareTab) => void }) {
  const toast = useToast()
  const qrRef = useRef<SVGSVGElement>(null)
  const brand = studio?.brandColor ?? '#8C2F39'
  const link = https(galleryLink(event, event.settings.shortLinks))
  const poster = () => {
    if (!qrRef.current) return
    downloadSvg(buildPoster({ qrSvg: svgString(qrRef.current), studio: studio?.name ?? 'Your studio', event: event.name, link: link.replace(/^https:\/\//, ''), pin: event.settings.access === 'link-pin' ? event.settings.pin : undefined, color: brand }), `${slug(event.name)}-poster-a4.svg`)
    toast.success('A4 poster downloaded')
  }
  return (
    <>
      <div className="grid gap-3.5 px-5 py-4 sm:px-6 lg:grid-cols-3">
        <AlbumLinkCard event={event} albums={albums} />
        <FaceLinkCard event={event} />
        <VipLinkCard event={event} />
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line bg-sunk px-5 py-3.5 sm:px-6">
        <div className="rounded-lg bg-white p-1.5"><StyledQR ref={qrRef} seed={hash(link) % 100000} size={64} color={brand} style="rounded" corner="rounded" /></div>
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

function LinkOut({ value, disabled, placeholder }: { value: string; disabled?: boolean; placeholder?: string }) {
  const copy = useCopy()
  return (
    <div className={cn('mt-auto flex h-9 items-center gap-2 rounded-control border border-line-2 bg-sunk pl-3 pr-1', disabled && 'opacity-60')}>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={value}>{disabled ? placeholder : value.replace(/^https:\/\//, '')}</span>
      <Tip label="Copy link">
        <button type="button" aria-label="Copy link" disabled={disabled} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface disabled:opacity-40" onClick={() => copy(value)}><Copy size={13} /></button>
      </Tip>
    </div>
  )
}

function AlbumLinkCard({ event, albums }: { event: PhotoEvent; albums: Album[] }) {
  const regular = albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order)
  const [albumId, setAlbumId] = useState(regular[0]?.id ?? '')
  const [direct, setDirect] = useState(true)
  const [shorten, setShorten] = useState(true)
  const album = regular.find((a) => a.id === albumId)
  const id = event.shortId.toLowerCase()
  const value = !album ? '' : shorten
    ? https(`frameline.in/s/${linkToken('album', event.id, album.id, direct)}`)
    : https(`frameline.in/${id}/album/${slug(album.name)}${direct ? '?open=web' : ''}`)
  return (
    <Card icon={<Folder size={14} />} title="Album link" body="Guests land straight on one album.">
      <Select value={albumId} onChange={(e) => setAlbumId(e.target.value)} aria-label="Album">
        {regular.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
      <Opt label="Open web gallery directly" checked={direct} onChange={setDirect} />
      <Opt label="Shorten link" checked={shorten} onChange={setShorten} />
      <LinkOut value={value} disabled={!album} placeholder="Create an album first" />
    </Card>
  )
}

function FaceLinkCard({ event }: { event: PhotoEvent }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [face, setFace] = useState<{ url: string; key: string; local: boolean } | null>(null)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [myPhotos, setMyPhotos] = useState(true)
  useEffect(() => () => { if (face?.local) URL.revokeObjectURL(face.url) }, [face])

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
  const value = face ? https(`frameline.in/s/${linkToken('face', event.id, face.key, name.trim(), myPhotos)}`) : ''
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
      <LinkOut value={value} disabled={!face || !!error} placeholder="Add a face photo to make the link" />
    </Card>
  )
}

function VipLinkCard({ event }: { event: PhotoEvent }) {
  const [skip, setSkip] = useState(true)
  const [pin, setPin] = useState(true)
  const [all, setAll] = useState(false)
  const value = https(`frameline.in/v/${event.shortId.toLowerCase()}${linkToken('vip', event.id, skip, pin, all, pin ? event.settings.pin : '')}`)
  return (
    <Card icon={<Star size={14} />} title="VIP link" body="For family and the client. More access, no friction.">
      <Opt label="Skip sign-in" hint="Browse and download without an account" checked={skip} onChange={setSkip} />
      <Opt label="Include PIN" hint="Download all works without typing it" checked={pin} onChange={setPin} />
      <Opt label="See all photos" hint="Ignores “only their photos”" checked={all} onChange={setAll} />
      <LinkOut value={value} />
    </Card>
  )
}
