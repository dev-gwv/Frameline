import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AtSign, ImagePlus, Loader2, Phone, Upload, X } from 'lucide-react'
import { ApiError, ASSET_RULES, fmt, tone, toneCss } from '@frameline/shared'
import { Card, Chip, cn, Field, Input, Tip } from '@frameline/ui'
import { BRAND_SWATCHES, isHex, type HandleStatus, type Patch, type SetupDraft } from './draft'
import { errorMessage, useApi } from '../../../lib/api'
import { PhonePreview } from './PhonePreview'


function HandleChip({ status }: { status: HandleStatus }) {
  switch (status) {
    case 'checking': return <Chip><Loader2 size={11} className="animate-spin" />Checking</Chip>
    case 'available': return <Chip tone="ok">Looks good</Chip>
    case 'taken': return <Chip tone="bad">Taken</Chip>
    case 'invalid': return <Chip tone="warn">Not allowed</Chip>
    default: return null
  }
}

const handleHint: Record<HandleStatus, string | undefined> = {
  empty: 'Pick a short name for your gallery links.',
  invalid: 'Use 3–40 lowercase letters, numbers or hyphens, starting and ending with a letter or number.',
  checking: undefined,
  available: undefined,
  taken: 'Someone already uses this address. Try adding your city, like northlight-pune.',
}

export function StepBrand({ draft, patch, handleStatus, onError }: {
  draft: SetupDraft; patch: Patch; handleStatus: HandleStatus; onError: (msg: string) => void
}) {
  const api = useApi()
  const logoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [hexText, setHexText] = useState(draft.brandColor)
  useEffect(() => setHexText(draft.brandColor), [draft.brandColor])

  // Files go to the asset store straight away; the returned address is saved with the studio on Continue.
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null)
  const [assetError, setAssetError] = useState<{ logo?: string; cover?: string }>({})
  const upload = async (which: 'logo' | 'cover', e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const kind = which === 'logo' ? 'studio-logo' : 'studio-cover'
    const rule = ASSET_RULES[kind]
    const fail = (msg: string) => setAssetError((x) => ({ ...x, [which]: msg }))
    if (!rule.types.includes(file.type)) return fail(`That file type can’t be used. Choose a ${rule.types.map((t) => t.split('/')[1].toUpperCase()).join(', ')} file.`)
    if (file.size > rule.maxBytes) return fail(`That file is ${fmt.bytes(file.size)}. Files can be up to ${fmt.bytes(rule.maxBytes)}: export a smaller one.`)
    setAssetError((x) => ({ ...x, [which]: undefined }))
    setUploading(which)
    try {
      const asset = await api.uploadAsset(kind, { filename: file.name, blob: file, contentType: file.type, size: file.size })
      patch(which === 'logo' ? { logoUrl: asset.url } : { coverUrl: asset.url })
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) fail(`That file is too large. Files can be up to ${fmt.bytes(rule.maxBytes)}.`)
      else if (err instanceof ApiError && err.status === 415) fail('That file type can’t be used. Choose a JPG, PNG or WebP image.')
      else onError(errorMessage(err))
    } finally {
      setUploading(null)
    }
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
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload('logo', e)} />
          </div>
          <div className="min-w-[140px] flex-1">
            <b className="text-[13px]">Logo</b>
            <div className={cn('text-[12px]', assetError.logo || assetError.cover ? 'font-semibold text-bad' : 'text-ink-2')} role={assetError.logo || assetError.cover ? 'alert' : undefined}>
              {uploading ? `Uploading ${uploading}…` : assetError.logo ? `Logo: ${assetError.logo}` : assetError.cover ? `Cover: ${assetError.cover}` : 'PNG or WebP, transparent background'}
            </div>
          </div>
          <button type="button" onClick={() => coverRef.current?.click()}
            className="relative grid h-[70px] w-[130px] place-items-center overflow-hidden rounded-[10px] bg-cover bg-center text-[11px] font-bold text-white"
            style={{ backgroundImage: draft.coverUrl ? `url(${draft.coverUrl})` : toneCss(tone(3)) }}
            aria-label={draft.coverUrl ? 'Change cover photo' : 'Upload cover photo'}>
            <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5"><ImagePlus size={12} />{draft.coverUrl ? 'Change cover' : 'Cover · 16:9'}</span>
          </button>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload('cover', e)} />
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
