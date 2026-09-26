import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { TONES, toneCss } from '@frameline/shared'
import { Button, Card, Chip, cn, Field, Input, Segmented, Tip } from '@frameline/ui'
import type { StoreSettingsData, TabProps } from './model'

type WM = StoreSettingsData['watermark']
const SWATCHES = ['#FFFFFF', '#1B1712', '#E2B458', '#8C2F39', '#2A8A8F']
const TEMPLATES: { id: WM['template'] | 'logo' | 'corner' | 'frame'; label: string; soon?: boolean }[] = [
  { id: 'forsale', label: 'FOR SALE pattern' },
  { id: 'centre', label: 'Large centre text' },
  { id: 'logo', label: 'Logo grid', soon: true },
  { id: 'corner', label: 'Corner stamp', soon: true },
  { id: 'frame', label: 'Frame border', soon: true },
]
const ANGLE: Record<WM['orientation'], number> = { diagonal: -30, vertical: -90, horizontal: 0 }

/** Renders the store watermark over a photo (tone swatch or uploaded image). */
function WatermarkOverlay({ wm, scale = 1 }: { wm: WM; scale?: number }) {
  const font = 9 * wm.size * scale
  const style = { color: wm.color, opacity: wm.opacity / 100 }
  if (wm.template === 'centre') {
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" style={style}>
        <span className="whitespace-nowrap font-display font-bold tracking-wider" style={{ fontSize: font * 1.8, transform: `rotate(${ANGLE[wm.orientation]}deg)`, textShadow: '0 1px 2px rgba(0,0,0,.25)' }}>{wm.text || ' '}</span>
      </div>
    )
  }
  const rows = Array.from({ length: 14 })
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={style} aria-hidden>
      <div className="absolute left-1/2 top-1/2 flex flex-col" style={{ width: '260%', transform: `translate(-50%,-50%) rotate(${ANGLE[wm.orientation]}deg)`, gap: font * 1.6 }}>
        {rows.map((_, i) => (
          <div key={i} className="whitespace-nowrap font-sans font-extrabold tracking-[.2em]" style={{ fontSize: font, marginLeft: i % 2 ? font * 3 : 0 }}>
            {Array.from({ length: 12 }, () => wm.text || ' ').join('   ·   ')}
          </div>
        ))}
      </div>
    </div>
  )
}

export function WatermarkTab({ data, set, errors }: TabProps) {
  const wm = data.watermark
  const [mode, setMode] = useState<'gallery' | 'download'>('gallery')
  const [own, setOwn] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [hex, setHex] = useState(wm.color)
  useEffect(() => setHex(wm.color), [wm.color])
  useEffect(() => () => { if (own) URL.revokeObjectURL(own) }, [own])

  const photo = (i: number, className: string, scale = 1) => (
    <div className={cn('relative overflow-hidden rounded-md', className)} style={own ? undefined : { background: toneCss(TONES[i % TONES.length]) }}>
      {own && <img src={own} alt="Your sample" className="absolute inset-0 size-full object-cover" />}
      <WatermarkOverlay wm={wm} scale={scale} />
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [&>*]:min-w-0">
      <Card className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-[12px] font-bold text-ink-2">Template</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => {
              const on = wm.template === t.id
              return (
                <button key={t.id} type="button" disabled={t.soon} aria-pressed={on}
                  onClick={() => !t.soon && set('watermark', { template: t.id as WM['template'] })}
                  className={cn('flex flex-col items-start gap-1 rounded-control border p-2.5 text-left text-[12.5px] font-bold transition', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk', t.soon && 'cursor-not-allowed opacity-60 hover:bg-transparent')}>
                  {t.label}
                  {t.soon ? <Chip>Coming soon</Chip> : on ? <Chip tone="accent">Selected</Chip> : <span className="h-[19px]" />}
                </button>
              )
            })}
          </div>
        </div>
        <Field label="Text" error={errors['watermark.text']} htmlFor="wm-text">
          <Input id="wm-text" maxLength={40} value={wm.text} onChange={(e) => set('watermark', { text: e.target.value })} />
        </Field>
        <Field label="Orientation">
          <Segmented value={wm.orientation} onChange={(v) => set('watermark', { orientation: v })}
            options={[{ value: 'diagonal', label: 'Diagonal' }, { value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }]} />
        </Field>
        <Field label="Size">
          <Segmented value={String(wm.size)} onChange={(v) => set('watermark', { size: Number(v) })}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}×` }))} />
        </Field>
        <Field label={<span className="flex justify-between">Opacity <span className="font-mono text-ink-3">{wm.opacity}%</span></span>} htmlFor="wm-op">
          <input id="wm-op" type="range" min={5} max={100} step={5} value={wm.opacity} onChange={(e) => set('watermark', { opacity: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
        </Field>
        <Field label="Colour" error={errors['watermark.color']}>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <Tip key={c} label={c}>
                <button type="button" aria-label={`Colour ${c}`} onClick={() => set('watermark', { color: c })}
                  className={cn('size-7 rounded-full border border-line-2', wm.color.toUpperCase() === c && 'outline-2 outline-offset-2 outline-marker')} style={{ background: c }} />
              </Tip>
            ))}
            <Input aria-label="Hex colour" className="w-28 font-mono uppercase" maxLength={7} value={hex}
              onChange={(e) => { const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; setHex(v); set('watermark', { color: v.toUpperCase() }) }} />
          </div>
        </Field>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold">Live preview</h3>
          <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'gallery', label: 'Gallery' }, { value: 'download', label: 'Download preview' }]} />
        </div>
        {mode === 'gallery' ? (
          <div className="grid grid-cols-3 gap-1.5">
            {photo(0, 'col-span-2 row-span-2', 1)}
            {photo(3, 'aspect-[3/2]', 0.5)}
            {photo(8, 'aspect-[3/2]', 0.5)}
            {photo(10, 'aspect-[3/2]', 0.5)}
            {photo(2, 'aspect-[3/2]', 0.5)}
            {photo(13, 'aspect-[3/2]', 0.5)}
          </div>
        ) : photo(6, 'aspect-[3/2] w-full', 1.6)}
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Button size="sm" icon={<ImagePlus size={13} />} onClick={() => fileRef.current?.click()}>Try with your own photo</Button>
          {own && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setOwn(null)}>Use samples</Button>}
          <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setOwn(URL.createObjectURL(f)); e.target.value = '' }} />
          <span>Only used for this preview; it isn’t uploaded.</span>
        </div>
        <p className="text-[12px] text-ink-3">Guests see this on photos that are for sale until they buy. Paid downloads never carry it.</p>
      </Card>
    </div>
  )
}
