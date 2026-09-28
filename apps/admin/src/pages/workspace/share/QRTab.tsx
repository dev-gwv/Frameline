import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Download, ImagePlus, Printer, X } from 'lucide-react'
import type { PhotoEvent, Studio } from '@frameline/shared'
import { Button, Segmented, Toggle, cn, useToast } from '@frameline/ui'
import { appLink, displayUrl, downloadBlob, galleryLink, slug } from '../lib'
import { StyledQR, buildPoster, downloadSvg, svgString, svgToPng, type QRCorner, type QRStyle } from './qr'

const MAX_LOGO = 80 * 1024

/** QR tab: preview, style, colour, logo (≤ 80 KB), More styles (corners, what it opens); SVG, A4 poster, PNG (gold). */
export function useQRTab(event: PhotoEvent, studio?: Studio): { body: ReactNode; footer: ReactNode } {
  const toast = useToast()
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const brand = studio?.brandColor ?? '#8C2F39'
  const swatches = Array.from(new Set(['#1C1814', '#B8862B', brand, '#8E3B46', '#2F6B5E']))
  const [style, setStyle] = useState<QRStyle>('rounded')
  const [color, setColor] = useState(swatches[0])
  const [logoOn, setLogoOn] = useState(false)
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null)
  const [logoError, setLogoError] = useState('')
  const [more, setMore] = useState(false)
  const [corner, setCorner] = useState<QRCorner>('rounded')
  const [target, setTarget] = useState<'web' | 'app'>('web')

  const url = target === 'web' ? galleryLink(event, event.settings.shortLinks) : appLink(event)
  const base = `${slug(event.name)}-qr`

  const pickLogo = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setLogoError('That file isn’t an image. Use a PNG, JPG or SVG.'); return }
    if (f.size > MAX_LOGO) { setLogoError(`That logo is ${Math.round(f.size / 1024)} KB. Use one up to 80 KB (about 300 × 300 px).`); return }
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
    downloadSvg(buildPoster({ qrSvg: s, studio: studio?.name ?? 'Your studio', event: event.name, link: displayUrl(url), pin: event.settings.access === 'link-pin' ? event.settings.pin : undefined, color }), `${slug(event.name)}-table-poster-a4.svg`)
    toast.success('A4 table poster downloaded', 'Print it at 100% for the welcome table.')
  }

  const body = (
    <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
      <div className="grid place-items-center self-start rounded-card border border-line bg-white p-3.5">
        <StyledQR ref={svgRef} value={url} size={170} color={color} style={style} corner={corner} logo={logoOn ? logo?.url : undefined} />
        <span className="mt-1.5 max-w-full truncate text-[11.5px] text-[#5F574B]">{displayUrl(url)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">
        <div>
          <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">Style</div>
          <Segmented<QRStyle> value={style === 'hybrid' ? 'rounded' : style} onChange={setStyle} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'soft', label: 'Soft' }, { value: 'classic', label: 'Classic' }]} />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">Colour</div>
          <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Colour">
            {swatches.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c === brand ? `Brand colour ${c}` : `Colour ${c}`} onClick={() => setColor(c)}
                className={cn('size-[30px] rounded-full', color === c ? 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--line-2)]')} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <b className="block text-[13.5px]">Put my logo in the middle</b>
            <span className={cn('text-[12.5px]', logoError ? 'font-semibold text-bad' : 'text-ink-2')}>{logoError || (logo ? logo.name : 'Up to 80 KB')}</span>
          </span>
          <Toggle label="Put my logo in the middle" checked={logoOn} onCheckedChange={(v) => { setLogoOn(v); if (v && !logo) fileRef.current?.click() }} />
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = '' }} />
        {logoOn && (
          <div className="-mt-1.5 flex gap-2">
            <Button size="sm" icon={<ImagePlus size={13} />} onClick={() => fileRef.current?.click()}>{logo ? 'Change logo' : 'Choose logo'}</Button>
            {logo && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setLogo(null); setLogoOn(false) }}>Remove</Button>}
          </div>
        )}
        <div>
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="inline-flex min-h-[32px] items-center gap-1 text-[13px] font-bold text-accent-text">
            More styles <ChevronDown size={13} className={cn('transition-transform', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="mt-1.5 flex flex-col gap-3">
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">Corners</div>
                <Segmented<QRCorner> value={corner} onChange={setCorner} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }]} />
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">Opens</div>
                <Segmented value={target} onChange={setTarget} options={[{ value: 'web', label: 'Web gallery' }, { value: 'app', label: 'Frameline app' }]} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
  const footer = (
    <>
      <Button variant="ghost" onClick={dlSvg} className="mr-auto max-sm:mr-0">Download SVG</Button>
      <Button icon={<Printer size={15} />} onClick={dlPoster}>A4 table poster</Button>
      <Button variant="primary" icon={<Download size={15} />} onClick={() => void dlPng()}>Download PNG</Button>
    </>
  )
  return { body, footer }
}
