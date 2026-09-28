import { useRef, useState, type ChangeEvent } from 'react'
import { Check, Loader2, Phone, Upload } from 'lucide-react'
import { ApiError, ASSET_RULES, fmt } from '@frameline/shared'
import { Chip, cn, Field, Input } from '@frameline/ui'
import { errorMessage, useApi } from '../../../lib/api'
import { BRAND_SWATCHES, isHex, type HandleStatus, type Patch, type SetupDraft } from './draft'

function HandleChip({ status }: { status: HandleStatus }) {
  switch (status) {
    case 'checking': return <Chip icon={<Loader2 size={11} className="animate-spin" aria-hidden />}>Checking</Chip>
    case 'available': return <Chip tone="ok" icon={<Check size={11} aria-hidden />}>Available</Chip>
    case 'taken': return <Chip tone="bad">Taken</Chip>
    case 'invalid': return <Chip tone="warn">Not allowed</Chip>
    default: return null
  }
}

const handleHint: Record<HandleStatus, string> = {
  empty: 'Guests see this in every gallery link.',
  invalid: 'Use 3–40 lowercase letters, numbers or hyphens.',
  checking: 'Guests see this in every gallery link.',
  available: 'Guests see this in every gallery link.',
  taken: 'Someone already has this address. Try adding your city, like northlight-pune.',
}

export function StepBrand({ draft, patch, handleStatus, onError }: {
  draft: SetupDraft; patch: Patch; handleStatus: HandleStatus; onError: (msg: string) => void
}) {
  const api = useApi()
  const logoRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [logoError, setLogoError] = useState<string>()
  const [custom, setCustom] = useState(!BRAND_SWATCHES.includes(draft.brandColor.toUpperCase()))
  const [hexText, setHexText] = useState(draft.brandColor)

  // The logo goes to the asset store straight away; its address is saved with the studio on Continue.
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rule = ASSET_RULES['studio-logo']
    if (!rule.types.includes(file.type)) { setLogoError(`Choose a ${rule.types.map((t) => t.split('/')[1].toUpperCase()).join(', ')} file.`); return }
    if (file.size > rule.maxBytes) { setLogoError(`That file is ${fmt.bytes(file.size)}. Logos can be up to ${fmt.bytes(rule.maxBytes)}.`); return }
    setLogoError(undefined)
    setUploading(true)
    try {
      const asset = await api.uploadAsset('studio-logo', { filename: file.name, blob: file, contentType: file.type, size: file.size })
      patch({ logoUrl: asset.url })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 413 || err.status === 415)) setLogoError('That file can’t be used. Choose a PNG, JPG or WebP under the size limit.')
      else onError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => logoRef.current?.click()}
          className={cn('grid size-[92px] shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-semibold text-ink-3 transition hover:text-ink',
            draft.logoUrl ? 'border border-line bg-surface' : 'border-[1.5px] border-dashed border-line-2 bg-sunk hover:border-accent')}>
          {uploading ? <Loader2 size={18} className="animate-spin" aria-label="Uploading logo" />
            : draft.logoUrl ? <img src={draft.logoUrl} alt="Your logo (click to change)" className="size-full object-contain p-2" />
            : <span className="flex flex-col items-center gap-1"><Upload size={18} aria-hidden />Logo</span>}
        </button>
        <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e)} />
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <span className="text-[12.5px] font-bold text-ink-2" id="colour-label">Brand colour</span>
          <div role="radiogroup" aria-labelledby="colour-label" className="flex flex-wrap items-center gap-2.5">
            {BRAND_SWATCHES.map((c) => {
              const on = !custom && draft.brandColor.toUpperCase() === c
              return (
                <button key={c} type="button" role="radio" aria-checked={on} aria-label={`Colour ${c}`} onClick={() => { setCustom(false); patch({ brandColor: c }) }}
                  className={cn('size-7 rounded-full border border-line-2 transition max-sm:size-9', on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')} style={{ background: c }} />
              )
            })}
            <button type="button" className={cn('text-[12.5px] font-bold hover:underline', custom ? 'text-ink' : 'text-accent-text')} onClick={() => setCustom(true)}>Other</button>
          </div>
          {custom && (
            <Input aria-label="Brand colour (hex)" className="w-[130px] uppercase tnum" value={hexText} maxLength={7} spellCheck={false}
              icon={<span className="size-3.5 rounded-full border border-line" style={{ background: isHex(hexText) ? hexText : 'transparent' }} />}
              onChange={(e) => {
                let v = e.target.value.trim()
                if (v && !v.startsWith('#')) v = `#${v}`
                setHexText(v)
                if (isHex(v)) patch({ brandColor: v.toUpperCase() })
              }} />
          )}
          {logoError && <span role="alert" className="text-[12px] font-semibold text-bad">Logo: {logoError}</span>}
        </div>
      </div>

      <Field label="Gallery address" htmlFor="st-handle" error={handleStatus === 'taken' || handleStatus === 'invalid' ? handleHint[handleStatus] : undefined} hint={handleHint[handleStatus]}>
        <Input id="st-handle" value={draft.handle} spellCheck={false} autoCapitalize="none" className="h-[42px]" aria-invalid={handleStatus === 'taken' || handleStatus === 'invalid' || undefined}
          onChange={(e) => patch({ handle: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
          suffix={<span className="flex shrink-0 items-center gap-2"><span className="text-[13px] text-ink-3 max-[400px]:hidden">.frameline.in</span><HandleChip status={handleStatus} /></span>} />
      </Field>

      <Field label="Phone for guests to call" htmlFor="st-phone" hint="Optional. Guests see a call button in your galleries.">
        <Input id="st-phone" type="tel" className="h-[42px] tnum" icon={<Phone size={14} />} value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="+91 98450 12345" autoComplete="tel" />
      </Field>
    </>
  )
}
