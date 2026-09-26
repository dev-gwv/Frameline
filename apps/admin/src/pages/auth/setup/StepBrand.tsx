import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AtSign, ImagePlus, Loader2, Phone, Upload, X } from 'lucide-react'
import { tone, toneCss } from '@frameline/shared'
import { Card, Chip, cn, Field, Input, Tip } from '@frameline/ui'
import { BRAND_SWATCHES, isHex, type HandleStatus, type Patch, type SetupDraft } from './draft'
import { PhonePreview } from './PhonePreview'

const MAX_LOGO_BYTES = 1_500_000

function HandleChip({ status }: { status: HandleStatus }) {
  switch (status) {
    case 'checking': return <Chip><Loader2 size={11} className="animate-spin" />Checking</Chip>
    case 'available': return <Chip tone="ok">Available</Chip>
    case 'taken': return <Chip tone="bad">Taken</Chip>
    case 'invalid': return <Chip tone="warn">Not allowed</Chip>
    default: return null
  }
}

const handleHint: Record<HandleStatus, string | undefined> = {
  empty: 'Pick a short name for your gallery links.',
  invalid: 'Use 3–30 lowercase letters, numbers or hyphens, starting and ending with a letter or number.',
  checking: undefined,
  available: undefined,
  taken: 'Someone already uses this address. Try adding your city, like northlight-pune.',
}

export function StepBrand({ draft, patch, handleStatus, onError }: {
  draft: SetupDraft; patch: Patch; handleStatus: HandleStatus; onError: (msg: string) => void
}) {
  const logoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [hexText, setHexText] = useState(draft.brandColor)
  useEffect(() => setHexText(draft.brandColor), [draft.brandColor])

  const pickLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { onError('That file isn’t an image. Choose a PNG, SVG or JPG.'); return }
    if (file.size > MAX_LOGO_BYTES) { onError('That logo is over 1.5 MB. Export a smaller PNG or SVG and try again.'); return }
    const reader = new FileReader()
    reader.onload = () => patch({ logoUrl: String(reader.result) })
    reader.onerror = () => onError('Couldn’t read that file. Try another one.')
    reader.readAsDataURL(file)
  }
  const pickCover = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { onError('That file isn’t an image. Choose a JPG or PNG.'); return }
    if (draft.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(draft.coverUrl)
    patch({ coverUrl: URL.createObjectURL(file) })
  }
  const hexInvalid = hexText.length > 0 && !isHex(hexText)

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <button type="button" onClick={() => logoRef.current?.click()} aria-label={draft.logoUrl ? 'Change logo' : 'Upload logo'}
              className={cn('grid size-[70px] place-items-center overflow-hidden rounded-card text-ink-3 transition hover:text-ink',
                draft.logoUrl ? 'border border-line bg-sunk' : 'border-[1.5px] border-dashed border-line-2 hover:border-accent')}>
              {draft.logoUrl ? <img src={draft.logoUrl} alt="Studio logo" className="size-full object-contain p-1.5" /> : <Upload size={20} />}
            </button>
            {draft.logoUrl && (
              <Tip label="Remove logo">
                <button type="button" aria-label="Remove logo" onClick={() => patch({ logoUrl: undefined })}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-bad"><X size={11} /></button>
              </Tip>
            )}
            <input ref={logoRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={pickLogo} />
          </div>
          <div className="min-w-[140px] flex-1">
            <b className="text-[13px]">Logo</b>
            <div className="text-[12px] text-ink-2">PNG or SVG, transparent background</div>
          </div>
          <button type="button" onClick={() => coverRef.current?.click()}
            className="relative grid h-[70px] w-[130px] place-items-center overflow-hidden rounded-[10px] bg-cover bg-center text-[11px] font-bold text-white"
            style={{ backgroundImage: draft.coverUrl ? `url(${draft.coverUrl})` : toneCss(tone(3)) }}
            aria-label={draft.coverUrl ? 'Change cover photo' : 'Upload cover photo'}>
            <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5"><ImagePlus size={12} />{draft.coverUrl ? 'Change cover' : 'Cover · 16:9'}</span>
          </button>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />
        </div>

        <Field label="Brand colour" htmlFor="st-hex" error={hexInvalid ? 'Use a 6-digit hex colour, like #8C2F39.' : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_SWATCHES.map((c) => {
              const on = draft.brandColor.toLowerCase() === c.toLowerCase()
              return (
                <Tip key={c} label={c}>
                  <button type="button" aria-label={`Brand colour ${c}`} aria-pressed={on} onClick={() => patch({ brandColor: c })}
                    className={cn('size-[30px] rounded-control transition', on && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }} />
                </Tip>
              )
            })}
            <Input id="st-hex" className="w-[110px] font-mono" value={hexText} maxLength={7} spellCheck={false}
              icon={<span className="size-3.5 rounded-[4px] border border-line" style={{ background: isHex(hexText) ? hexText : 'transparent' }} />}
              onChange={(e) => {
                let v = e.target.value.trim()
                if (v && !v.startsWith('#')) v = `#${v}`
                setHexText(v)
                if (isHex(v)) patch({ brandColor: v.toUpperCase() })
              }} />
          </div>
        </Field>

        <Field label="Gallery address" htmlFor="st-handle" error={handleStatus === 'taken' || handleStatus === 'invalid' ? handleHint[handleStatus] : undefined} hint={handleHint[handleStatus]}>
          <Input id="st-handle" className="font-mono" value={draft.handle} spellCheck={false} autoCapitalize="none"
            onChange={(e) => patch({ handle: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
            suffix={<span className="flex shrink-0 items-center gap-2"><span className="hidden font-mono text-[12.5px] text-ink-3 sm:inline">.frameline.in/&lt;event&gt;</span><HandleChip status={handleStatus} /></span>} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Studio phone" htmlFor="st-phone" hint="Shown to guests with a call button">
            <Input id="st-phone" type="tel" className="font-mono" icon={<Phone size={14} />} value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="+91 98200 41177" autoComplete="tel" />
          </Field>
          <Field label="Instagram" htmlFor="st-ig" hint="Optional">
            <Input id="st-ig" icon={<AtSign size={14} />} value={draft.instagram.replace(/^@/, '')} onChange={(e) => patch({ instagram: e.target.value ? `@${e.target.value.replace(/^@/, '')}` : '' })} placeholder="northlight.studio" />
          </Field>
        </div>
      </Card>

      <details className="rounded-card border border-line bg-sunk lg:hidden">
        <summary className="cursor-pointer px-4 py-3 text-[13px] font-bold">See the live guest preview</summary>
        <div className="grid place-items-center pb-5"><PhonePreview draft={draft} /></div>
      </details>
    </div>
  )
}
