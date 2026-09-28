import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ImageIcon, Trash2, Type, Upload } from 'lucide-react'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Card, cn, Field, Input, Segmented, Select, Toggle } from '@frameline/ui'
import { assetAccept, useAssetUpload } from './assetUpload'
import { FONTS, fontStack, POSITIONS, SIZES, type WmDraft } from './lib'

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-2.5 text-[15px] font-extrabold">{title}</h3>
      {children}
    </Card>
  )
}

const APPLY_TO: { key: keyof WatermarkSettings['applyTo']; title: string; hint: string }[] = [
  { key: 'previews', title: 'Gallery previews', hint: 'What guests see while browsing' },
  { key: 'downloads', title: 'Guest downloads', hint: 'Files guests save to their phone' },
  { key: 'guestUploads', title: 'Guest uploads', hint: 'Photos guests add to your events' },
  { key: 'originals', title: 'Your originals', hint: 'Full-size files you upload as originals' },
]

/** Left column: 1 · Where, 2 · What, 3 · How big, and the rare options folded under "More options". */
export function SimpleSettings({ wm, onChange }: { wm: WmDraft; onChange: (patch: Partial<WmDraft>) => void }) {
  const [more, setMore] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const up = useAssetUpload('watermark-logo')

  // Uploaded with api.uploadAsset('watermark-logo'); the asset URL is saved on the watermark.
  async function pickLogo(file: File) {
    const asset = await up.upload(file)
    if (asset) onChange({ logoUrl: asset.url })
  }

  return (
    <div className="flex flex-col gap-3">
      <Step title="1 · Where">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Where the watermark goes">
          {POSITIONS.map((p) => {
            const on = wm.position === p.value
            return (
              <button
                key={p.value} type="button" role="radio" aria-checked={on} onClick={() => onChange({ position: p.value })}
                className={cn('min-h-[38px] rounded-control px-1 py-2 text-center text-[12.5px] font-bold transition max-sm:min-h-[44px]',
                  on ? 'border-[1.5px] border-accent bg-accent-soft text-accent-text' : 'border border-line-2 bg-surface text-ink-2 hover:bg-sunk hover:text-ink')}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </Step>

      <Step title="2 · What">
        <Segmented
          stretch className="mb-2.5" value={wm.mode} onChange={(mode) => onChange({ mode })}
          options={[{ value: 'text', label: 'My name', icon: <Type size={13} /> }, { value: 'logo', label: 'My logo', icon: <ImageIcon size={13} /> }]}
        />
        {wm.mode === 'text' ? (
          <div className="flex flex-col gap-1.5">
            <Input aria-label="Watermark text" value={wm.text} maxLength={40} placeholder="© Your studio name" onChange={(e) => onChange({ text: e.target.value })}
              aria-invalid={!wm.text.trim() || undefined} />
            {!wm.text.trim() && <span className="text-[12px] font-semibold text-bad">Type your studio name, or switch to “My logo”.</span>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept={assetAccept('watermark-logo')} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickLogo(f); e.target.value = '' }} />
            {wm.logoUrl ? (
              <div className="flex items-center gap-3 rounded-control border border-line p-2">
                <div className="grid h-12 w-20 shrink-0 place-items-center rounded-md bg-sunk p-1.5">
                  <img src={wm.logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1 truncate text-[13px] font-bold">Your logo</div>
                <Button size="sm" loading={up.pending} onClick={() => fileRef.current?.click()}>Replace</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => onChange({ logoUrl: '' })}>Remove</Button>
              </div>
            ) : (
              <button type="button" disabled={up.pending} onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-1 rounded-control border border-dashed border-line-2 px-3 py-5 text-center hover:bg-sunk">
                <Upload size={18} className="text-ink-3" />
                <span className="text-[13px] font-bold">{up.pending ? 'Uploading your logo…' : 'Upload your logo'}</span>
                <span className="text-[12px] text-ink-3">You haven’t added a logo yet. PNG, WebP or JPG up to 10 MB; a see-through PNG looks best.</span>
              </button>
            )}
            {up.error && <span className="text-[12px] font-semibold text-bad" role="alert">{up.error}</span>}
          </div>
        )}
      </Step>

      <Step title="3 · How big">
        <Segmented stretch value={wm.size} onChange={(size) => onChange({ size })} options={SIZES} />
      </Step>

      <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}
        className="flex min-h-[36px] items-center gap-1.5 self-start rounded-control px-1 text-[13px] font-bold text-ink-2 hover:text-ink">
        More options: font, see-through, spacing
        <ChevronDown size={14} className={cn('transition-transform', more && 'rotate-180')} />
      </button>

      {more && (
        <Card className="flex flex-col gap-3.5 animate-[fl-fade-in_150ms_ease-out]">
          {wm.mode === 'text' && (
            <Field label="Second line (optional)" htmlFor="wm-sub">
              <Input id="wm-sub" value={wm.subtitle} maxLength={40} placeholder="e.g. Udaipur · since 2014" onChange={(e) => onChange({ subtitle: e.target.value })} />
            </Field>
          )}
          <Field label="Font" htmlFor="wm-font" hint={wm.mode === 'logo' ? 'Used when you switch back to your name.' : undefined}>
            <Select id="wm-font" value={wm.font} onChange={(e) => onChange({ font: e.target.value })} style={{ fontFamily: fontStack(wm.font) }}>
              {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>)}
            </Select>
          </Field>
          <Field label={<span className="flex justify-between"><span>How solid</span><span className="font-semibold text-ink-3 tnum">{wm.opacity}%</span></span>} htmlFor="wm-opacity">
            <input id="wm-opacity" type="range" min={20} max={100} step={5} value={wm.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={<span className="flex justify-between"><span>Distance from the edge</span><span className="font-semibold text-ink-3 tnum">{wm.edgeOffset}%</span></span>} htmlFor="wm-offset">
            <input id="wm-offset" type="range" min={0} max={10} step={0.5} value={wm.edgeOffset} onChange={(e) => onChange({ edgeOffset: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <div>
            <div className="mb-1 text-[12.5px] font-bold text-ink-2">Add it to</div>
            {APPLY_TO.map((a) => (
              <div key={a.key} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{a.title}</div>
                  <div className="text-[12px] text-ink-3">{a.hint}</div>
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
