import { useRef, useState, type ReactNode } from 'react'
import { Download, FileImage, ImagePlus, Printer, X } from 'lucide-react'
import { hash, type PhotoEvent, type Studio } from '@frameline/shared'
import { Button, Input, Segmented, Tip, useToast, cn } from '@frameline/ui'
import { appLink, downloadBlob, galleryLink, https, slug } from '../lib'
import { StyledQR, buildPoster, downloadSvg, svgString, svgToPng, type QRCorner, type QRStyle } from './qr'

const MAX_LOGO = 80 * 1024
const HEX = /^#[0-9a-f]{6}$/i

export function QRTab({ event, studio }: { event: PhotoEvent; studio?: Studio }) {
  const toast = useToast()
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [style, setStyle] = useState<QRStyle>('rounded')
  const [corner, setCorner] = useState<QRCorner>('rounded')
  const brand = studio?.brandColor ?? '#8C2F39'
  const [color, setColor] = useState(brand)
  const [hex, setHex] = useState(brand)
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null)
  const [logoError, setLogoError] = useState('')
  const [target, setTarget] = useState<'web' | 'app'>('web')

  const url = https(target === 'web' ? galleryLink(event, event.settings.shortLinks) : appLink(event))
  const swatches = Array.from(new Set(['#1B1712', brand, '#8C2F39', '#1D3557', '#264653', '#6D597A', '#B37C22']))
  const base = `${slug(event.name)}-${target}-qr`

  const pickLogo = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setLogoError('That file isn’t an image. Use a PNG, JPG or SVG.'); return }
    if (f.size > MAX_LOGO) { setLogoError(`That logo is ${Math.round(f.size / 1024)} KB. Logos can be up to 80 KB — export a smaller PNG (about 300 × 300 px).`); return }
    setLogoError('')
    const r = new FileReader()
    r.onload = () => setLogo({ url: String(r.result), name: f.name })
    r.onerror = () => setLogoError('Couldn’t read that file. Try another one.')
    r.readAsDataURL(f)
  }

  const getSvg = () => (svgRef.current ? svgString(svgRef.current) : null)
  const dlSvg = () => { const s = getSvg(); if (s) { downloadSvg(s, `${base}.svg`); toast.success('SVG downloaded') } }
  const dlPng = async () => {
    const s = getSvg(); if (!s) return
    try { downloadBlob(await svgToPng(s, 1200), `${base}.png`); toast.success('PNG downloaded') } catch (e) { toast.error('PNG download failed', (e as Error).message) }
  }
  const dlPoster = () => {
    const s = getSvg(); if (!s) return
    const poster = buildPoster({ qrSvg: s, studio: studio?.name ?? 'Your studio', event: event.name, link: url.replace(/^https:\/\//, ''), pin: event.settings.access === 'link-pin' ? event.settings.pin : undefined, color })
    downloadSvg(poster, `${slug(event.name)}-poster-a4.svg`)
    toast.success('A4 poster downloaded', 'Open it in any browser or print shop app and print at 100%.')
  }

  return (
    <div className="grid gap-5 px-5 py-4 sm:px-6 md:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Row label="Opens">
          <Segmented value={target} onChange={setTarget} options={[{ value: 'web', label: 'Web gallery' }, { value: 'app', label: 'Frameline app' }]} />
        </Row>
        <Row label="Style">
          <div className="max-w-full overflow-x-auto scrollbar-thin">
            <Segmented<QRStyle> value={style} onChange={setStyle} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'soft', label: 'Soft' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'classic', label: 'Classic' }]} />
          </div>
        </Row>
        <Row label="Corners">
          <Segmented<QRCorner> value={corner} onChange={setCorner} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }]} />
        </Row>
        <Row label="Colour">
          <div className="flex flex-wrap items-center gap-2">
            {swatches.map((c) => (
              <Tip key={c} label={c === brand ? `${c} · brand colour` : c}>
                <button type="button" aria-label={`Colour ${c}`} aria-pressed={color.toLowerCase() === c.toLowerCase()} onClick={() => { setColor(c); setHex(c) }}
                  className={cn('size-7 rounded-full border-2', color.toLowerCase() === c.toLowerCase() ? 'border-accent ring-2 ring-accent-soft' : 'border-surface shadow-[0_0_0_1px_var(--line-2)]')}
                  style={{ background: c }} />
              </Tip>
            ))}
            <Input className="w-[110px] font-mono" value={hex} aria-label="Hex colour" maxLength={7}
              onChange={(e) => { const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; setHex(v); if (HEX.test(v)) setColor(v) }} />
            <input type="color" aria-label="Pick any colour" value={color} onChange={(e) => { setColor(e.target.value); setHex(e.target.value) }} className="size-8 cursor-pointer rounded border border-line-2 bg-surface p-0.5" />
          </div>
          {!HEX.test(hex) && <div className="mt-1 text-[11.5px] text-bad">Use a 6-digit hex colour like #8C2F39.</div>}
        </Row>
        <Row label="Logo in the centre">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = '' }} />
          {logo ? (
            <div className="flex items-center gap-2.5 rounded-control border border-line px-2.5 py-1.5">
              <img src={logo.url} alt="" className="size-7 rounded object-contain" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{logo.name}</span>
              <Tip label="Remove logo"><button type="button" aria-label="Remove logo" className="rounded p-1 text-ink-3 hover:bg-sunk" onClick={() => setLogo(null)}><X size={14} /></button></Tip>
            </div>
          ) : (
            <Button icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>Upload logo</Button>
          )}
          <div className={cn('mt-1 text-[11.5px]', logoError ? 'font-semibold text-bad' : 'text-ink-3')}>{logoError || 'PNG, JPG or SVG, up to 80 KB. Square logos work best.'}</div>
        </Row>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-card bg-sunk p-4">
        <div className="eyebrow">Preview</div>
        <div className="rounded-[10px] bg-white p-2 shadow-card">
          <StyledQR ref={svgRef} seed={hash(url) % 100000} size={210} color={HEX.test(color) ? color : '#1B1712'} style={style} corner={corner} logo={logo?.url} />
        </div>
        <div className="max-w-full truncate font-mono text-[11px] text-ink-2">{url.replace(/^https:\/\//, '')}</div>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button icon={<Download size={14} />} className="justify-center" onClick={dlSvg}>SVG</Button>
          <Button icon={<FileImage size={14} />} className="justify-center" onClick={dlPng}>PNG</Button>
        </div>
        <Button variant="primary" className="w-full justify-center" icon={<Printer size={14} />} onClick={dlPoster}>A4 poster</Button>
        <div className="text-center text-[11px] text-ink-3">Separate codes for the web gallery and the app. The poster includes the {event.settings.access === 'link-pin' ? 'PIN and ' : ''}link.</div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-bold text-ink-2">{label}</div>
      {children}
    </div>
  )
}
