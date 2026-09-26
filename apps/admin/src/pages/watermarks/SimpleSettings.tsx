import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ImageIcon, Trash2, Type, Upload } from 'lucide-react'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Card, cn, Field, Input, Segmented, Select, StepBadge, Tip, Toggle } from '@frameline/ui'
import { assetAccept, useAssetUpload } from '../wallet/assets'
import { FONTS, fontStack, POSITIONS } from './lib'


function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-2.5 flex items-center gap-2"><StepBadge n={n} /><b className="text-[14px]">{title}</b></div>
      {children}
    </Card>
  )
}

const APPLY_TO: { key: keyof WatermarkSettings['applyTo']; title: string; hint: string }[] = [
  { key: 'previews', title: 'Gallery previews', hint: 'What guests see while browsing' },
  { key: 'downloads', title: 'Guest downloads', hint: 'Files guests save to their phone' },
  { key: 'guestUploads', title: 'Guest uploads', hint: 'Photos guests add to your events' },
  { key: 'originals', title: 'Photographer originals', hint: 'Full-size files you upload as originals' },
]

/** Left column of the simple mode: three numbered questions and "More options". */
export function SimpleSettings({ wm, onChange }: {
  wm: WatermarkSettings
  onChange: (patch: Partial<WatermarkSettings>) => void
}) {
  const [more, setMore] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const up = useAssetUpload('watermark-logo')
  const logoError = up.error
  const reading = up.pending

  // Uploaded with api.uploadAsset('watermark-logo'); the asset URL is saved on the watermark.
  async function pickLogo(file: File) {
    const asset = await up.upload(file)
    if (asset) onChange({ logoUrl: asset.url })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Step n={1} title="Where should it go?">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Watermark position">
          {POSITIONS.map((p) => {
            const on = wm.position === p.value
            return (
              <button
                key={p.value} type="button" role="radio" aria-checked={on} onClick={() => onChange({ position: p.value })}
                className={cn('rounded-[9px] px-1.5 py-2.5 text-center text-[12px] font-bold transition',
                  on ? 'border border-accent bg-side text-side-gold' : 'border border-line-2 text-ink hover:bg-sunk')}
              >
                <div className="text-[14px]" aria-hidden>{p.arrow}</div>{p.label}
              </button>
            )
          })}
        </div>
      </Step>

      <Step n={2} title="What should it say?">
        <Segmented
          stretch className="mb-2.5" value={wm.mode} onChange={(mode) => onChange({ mode })}
          options={[{ value: 'text', label: 'Your name', icon: <Type size={12} /> }, { value: 'logo', label: 'Your logo', icon: <ImageIcon size={12} /> }]}
        />
        {wm.mode === 'text' ? (
          <div className="flex flex-col gap-2">
            <Input aria-label="Watermark text" value={wm.text} maxLength={40} placeholder="Your studio name" onChange={(e) => onChange({ text: e.target.value })} />
            <Input aria-label="Subtitle" value={wm.subtitle} maxLength={40} placeholder="Subtitle, e.g. your website (optional)" onChange={(e) => onChange({ subtitle: e.target.value })} />
            {!wm.text.trim() && <span className="text-[11.5px] font-semibold text-bad">Type your studio name, or switch to “Your logo”.</span>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept={assetAccept('watermark-logo')} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickLogo(f); e.target.value = '' }} />
            {wm.logoUrl ? (
              <div className="flex items-center gap-3 rounded-control border border-line p-2">
                <div className="grid h-12 w-20 shrink-0 place-items-center rounded-md bg-side p-1.5">
                  <img src={wm.logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1 truncate text-[12px] font-semibold">Your logo</div>
                <Button size="sm" loading={reading} onClick={() => fileRef.current?.click()}>Replace</Button>
                <Tip label="Remove logo"><Button size="sm" variant="ghost" aria-label="Remove logo" onClick={() => onChange({ logoUrl: '' })}><Trash2 size={13} /></Button></Tip>
              </div>
            ) : (
              <button type="button" disabled={reading} onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-1 rounded-control border border-dashed border-line-2 px-3 py-5 text-center hover:bg-sunk">
                <Upload size={18} className="text-ink-3" />
                <span className="text-[12.5px] font-bold">{reading ? 'Uploading your logo…' : 'Upload your logo'}</span>
                <span className="text-[11.5px] text-ink-3">PNG, WebP or JPG, up to 10 MB. A transparent PNG works best.</span>
              </button>
            )}
            {logoError && <span className="text-[11.5px] font-semibold text-bad" role="alert">{logoError}</span>}
          </div>
        )}
      </Step>

      <Step n={3} title="How big?">
        <Segmented stretch value={wm.size} onChange={(size) => onChange({ size })}
          options={[{ value: 'subtle', label: 'Subtle' }, { value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Bold' }]} />
      </Step>

      <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}
        className="flex items-center justify-between rounded-control px-1 py-1 text-[12.5px] font-bold text-accent-text hover:bg-sunk">
        More options: font, opacity, exact spacing
        <ChevronDown size={14} className={cn('transition-transform', more && 'rotate-180')} />
      </button>

      {more && (
        <Card className="flex flex-col gap-3.5 animate-[fl-fade-in_150ms_ease-out]">
          <Field label="Font" htmlFor="wm-font" hint={wm.mode === 'logo' ? 'Used when you switch back to your name.' : undefined}>
            <Select id="wm-font" value={wm.font} onChange={(e) => onChange({ font: e.target.value })} style={{ fontFamily: fontStack(wm.font) }}>
              {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>)}
            </Select>
          </Field>
          <Field label={<span className="flex justify-between"><span>Opacity</span><span className="font-mono text-ink-3">{wm.opacity}%</span></span>} htmlFor="wm-opacity">
            <input id="wm-opacity" type="range" min={20} max={100} step={5} value={wm.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={<span className="flex justify-between"><span>Distance from the edge</span><span className="font-mono text-ink-3">{wm.edgeOffset}% of short side</span></span>} htmlFor="wm-offset">
            <input id="wm-offset" type="range" min={0} max={10} step={0.5} value={wm.edgeOffset} onChange={(e) => onChange({ edgeOffset: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <div>
            <div className="mb-1 text-[12px] font-bold text-ink-2">Apply to</div>
            {APPLY_TO.map((a) => (
              <div key={a.key} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold">{a.title}</div>
                  <div className="text-[11.5px] text-ink-3">{a.hint}</div>
                </div>
                <Toggle label={a.title} checked={wm.applyTo[a.key]} onCheckedChange={(v) => onChange({ applyTo: { ...wm.applyTo, [a.key]: v } })} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
