import { useEffect, useState } from 'react'
import { Check, Copy, Globe, Settings2 } from 'lucide-react'
import type { Studio, Website } from '@frameline/shared'
import { Button, Card, Chip, cn, Field, Input, Tip, useToast } from '@frameline/ui'
import { TEMPLATES, type TemplateInfo } from './siteContent'
import { SITE_HOST, useCopy } from './helpers'
import { CHECKS, type DomainSetup } from './DomainModal'

const BRAND_SWATCHES = ['#8C2F39', '#1F4E5F', '#2F5D3A', '#B7791F', '#5B3F8C', '#15120E']

interface Props {
  website: Website
  studio: Studio
  domain: DomainSetup | null
  onTemplate: (t: Website['template']) => void
  onBrand: (hex: string) => void
  onHeadline: (text: string) => void
  onOpenDomain: () => void
}

export function Inspector({ website, studio, domain, onTemplate, onBrand, onHeadline, onOpenDomain }: Props) {
  const toast = useToast()
  const copy = useCopy(toast)
  const [headline, setHeadline] = useState(website.headline)
  const [brand, setBrand] = useState(studio.brandColor)
  useEffect(() => setHeadline(website.headline), [website.headline])
  useEffect(() => setBrand(studio.brandColor), [studio.brandColor])

  const commitHeadline = () => {
    const v = headline.trim()
    if (!v) { setHeadline(website.headline); return }
    if (v !== website.headline) onHeadline(v)
  }
  const host = SITE_HOST(studio.handle)
  const live = domain && domain.progress >= CHECKS.length

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="eyebrow mb-2">Template</div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Template">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={website.template === t.id} onClick={() => onTemplate(t.id)} title={t.blurb}
              className={cn('rounded-[7px] border p-1.5 text-left text-[11px] font-bold transition', website.template === t.id ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:bg-sunk')}>
              <TemplateThumb t={t} brand={studio.brandColor} />
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="eyebrow mb-2">Brand colour</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {BRAND_SWATCHES.map((c) => (
            <Tip key={c} label={c}>
              <button type="button" aria-label={`Use ${c}`} onClick={() => onBrand(c)}
                className={cn('grid size-7 place-items-center rounded-full border-2', studio.brandColor.toLowerCase() === c.toLowerCase() ? 'border-ink' : 'border-transparent')}
                style={{ background: c }}>
                {studio.brandColor.toLowerCase() === c.toLowerCase() && <Check size={13} color="#fff" />}
              </button>
            </Tip>
          ))}
          <label className="relative ml-auto flex h-7 items-center gap-1.5 rounded-control border border-line-2 px-1.5 text-[11px] font-mono">
            <span className="size-4 rounded" style={{ background: brand }} />
            {brand.toUpperCase()}
            <input type="color" aria-label="Pick any colour" value={brand} onChange={(e) => setBrand(e.target.value)} onBlur={() => brand !== studio.brandColor && onBrand(brand)}
              className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-ink-3">Also used in your galleries and the studio app.</p>
      </Card>

      <Card>
        <Field label="Headline" htmlFor="site-headline" hint="Or click the headline in the preview to edit it there.">
          <Input id="site-headline" value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} onBlur={commitHeadline} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
        </Field>
      </Card>

      <Card>
        <div className="eyebrow mb-2">Domain</div>
        <div className="flex h-9 items-center gap-2 rounded-control border border-line-2 bg-sunk px-2.5 text-[12px]">
          <span className="min-w-0 flex-1 truncate font-mono select-all">{host}</span>
          <Tip label="Copy address"><button type="button" aria-label="Copy site address" onClick={() => copy(`https://${host}`, 'Address copied')} className="text-ink-3 hover:text-ink"><Copy size={13} /></button></Tip>
        </div>
        {domain ? (
          <button type="button" onClick={onOpenDomain} className="mt-2 flex w-full items-center gap-2 rounded-control border border-line-2 px-2.5 py-2 text-left text-[12px] hover:bg-sunk">
            <Globe size={14} className="text-ink-2" />
            <span className="min-w-0 flex-1 truncate font-mono">{domain.domain}</span>
            {live ? <Chip tone="ok" dot>Live</Chip> : <Chip tone="warn" dot>{domain.progress}/{CHECKS.length}</Chip>}
            <Settings2 size={13} className="text-ink-3" />
          </button>
        ) : (
          <Button className="mt-2 w-full justify-center" icon={<Globe size={14} />} onClick={onOpenDomain}>Connect your own domain</Button>
        )}
        <p className="mt-1.5 text-[11px] text-ink-3">₹799/month or yearly. We show the DNS records and check them for you.</p>
      </Card>
    </div>
  )
}

function TemplateThumb({ t, brand }: { t: TemplateInfo; brand: string }) {
  const { bg, bar, hero } = t.thumb
  return (
    <div className="mb-1 flex h-9 flex-col gap-[3px] overflow-hidden rounded-[4px] border border-line p-[3px]" style={{ background: bg }} aria-hidden>
      <div className="h-[3px] w-1/3 rounded-full" style={{ background: bar }} />
      {hero === 'full' && <div className="flex-1 rounded-[2px]" style={{ background: 'linear-gradient(135deg,#fff3c4,#e0a458 55%,#5b3a29)' }} />}
      {hero === 'text' && <div className="flex flex-1 flex-col items-center justify-center gap-[2px]"><i className="h-[3px] w-3/4 rounded-full" style={{ background: bar }} /><i className="h-[3px] w-1/2 rounded-full" style={{ background: brand }} /></div>}
      {hero === 'split' && <div className="flex flex-1 gap-[3px]"><div className="flex flex-1 flex-col justify-center gap-[2px]"><i className="h-[2px] w-full rounded-full" style={{ background: bar }} /><i className="h-[2px] w-2/3 rounded-full" style={{ background: bar }} /></div><div className="flex-1 rounded-[2px]" style={{ background: '#d8cfc0' }} /></div>}
      {hero === 'dark' && <div className="flex flex-1 flex-col justify-center gap-[2px]"><i className="h-[5px] w-full" style={{ background: '#F7F1E6' }} /><i className="h-[2px] w-1/3" style={{ background: brand }} /></div>}
      {hero === 'grid' && <div className="grid flex-1 grid-cols-4 gap-[2px]">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ background: i % 3 ? '#cfc8bd' : '#9e9385' }} />)}</div>}
      {hero === 'mosaic' && <div className="grid flex-1 grid-cols-[2fr_1fr] gap-[2px]"><i style={{ background: '#b89c7a' }} /><div className="grid gap-[2px]"><i style={{ background: '#d9c7ae' }} /><i style={{ background: '#8f7a61' }} /></div></div>}
    </div>
  )
}
