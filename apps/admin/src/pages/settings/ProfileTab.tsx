import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import type { Studio } from '@frameline/shared'
import { Button, Card, cn, Field, Input, Skeleton, Textarea, Tip, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { EMAIL_RE, readLocal, writeLocal } from '../wallet/lib'

const COLOURS = ['#8C2F39', '#1B1712', '#C08A2C', '#2A8A8F', '#386641', '#6B4F7A']
interface Extras { cover: string; facebook: string; youtube: string; portfolio: string[] }
const EXTRAS_KEY = 'frameline.profileExtras'
const DEFAULT_EXTRAS: Extras = { cover: '', facebook: '', youtube: '', portfolio: ['https://northlight.in/weddings'] }
const URL_RE = /^https:\/\/[^\s.]+\.\S+$/

type Form = Pick<Studio, 'name' | 'handle' | 'about' | 'phone' | 'email' | 'website' | 'instagram' | 'city' | 'brandColor' | 'logoUrl'>
const pick = (s: Studio): Form => ({ name: s.name, handle: s.handle, about: s.about ?? '', phone: s.phone, email: s.email, website: s.website ?? '', instagram: s.instagram ?? '', city: s.city, brandColor: s.brandColor, logoUrl: s.logoUrl ?? '' })

function readImage(f: File, maxMb: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!f.type.startsWith('image/')) return reject(new Error(`${f.name} isn’t an image.`))
    if (f.size > maxMb * 1048576) return reject(new Error(`${f.name} is over ${maxMb} MB. Use a smaller image.`))
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Couldn’t read that file.'))
    r.readAsDataURL(f)
  })
}

export function ProfileTab() {
  const q = useStudio()
  if (q.isError) return <QueryError error={q.error} retry={() => q.refetch()} />
  if (!q.data) return <Skeleton className="h-[480px]" />
  return <ProfileForm studio={q.data} />
}

function ProfileForm({ studio }: { studio: Studio }) {
  const api = useApi()
  const toast = useToast()
  const [form, setForm] = useState<Form>(() => pick(studio))
  const [extras, setExtras] = useState<Extras>(() => readLocal(EXTRAS_KEY, DEFAULT_EXTRAS))
  const [savedExtras, setSavedExtras] = useState(extras)
  const [tried, setTried] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  useEffect(() => setForm(pick(studio)), [studio])

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(studio)) || JSON.stringify(extras) !== JSON.stringify(savedExtras)
  const errors = useMemo(() => {
    const e: Partial<Record<string, string>> = {}
    if (!form.name.trim()) e.name = 'Enter your studio name'
    if (!/^[a-z0-9-]{3,30}$/.test(form.handle)) e.handle = '3–30 lowercase letters, numbers or dashes'
    if ((form.about ?? '').length > 1000) e.about = 'Keep it under 1,000 characters'
    if (!/^\+?[\d\s-]{10,15}$/.test(form.phone)) e.phone = 'Enter a mobile number like +91 98200 41177'
    if (!EMAIL_RE.test(form.email)) e.email = 'Enter a valid email'
    if (form.website && !URL_RE.test(form.website)) e.website = 'Website must start with https://'
    if (form.instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(form.instagram)) e.instagram = 'Use your handle, like @northlight.studio'
    if (!form.city.trim()) e.city = 'Enter your city'
    if (!/^#[0-9a-fA-F]{6}$/.test(form.brandColor)) e.brandColor = 'Use a hex colour like #8C2F39'
    for (const k of ['facebook', 'youtube'] as const) if (extras[k] && !URL_RE.test(extras[k])) e[k] = 'Link must start with https://'
    extras.portfolio.forEach((p, i) => { if (p && !URL_RE.test(p)) e[`portfolio${i}`] = 'Link must start with https://' })
    return e
  }, [form, extras])
  const show = (k: string) => (tried || k === 'website' ? errors[k] : undefined)

  const save = useAction(async () => {
    const studioSaved = await api.updateStudio({ ...form, logoUrl: form.logoUrl || undefined, website: form.website || undefined })
    writeLocal(EXTRAS_KEY, extras); setSavedExtras(extras)
    return studioSaved
  }, { success: 'Profile saved', onSuccess: () => setTried(false) })

  const submit = () => {
    setTried(true)
    if (Object.keys(errors).length) { toast.error('Some details need fixing', 'Fields with a problem are marked in red.'); return }
    save.mutate(undefined)
  }
  const onImage = async (f: File | undefined, kind: 'logo' | 'cover') => {
    if (!f) return
    try {
      const url = await readImage(f, kind === 'logo' ? 1 : 2)
      if (kind === 'logo') set({ logoUrl: url }); else setExtras((x) => ({ ...x, cover: url }))
    } catch (e) { toast.error('Image not added', (e as Error).message) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card className="flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold">Studio</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Studio name" error={show('name')} htmlFor="p-name"><Input id="p-name" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Handle" error={show('handle')} hint={`${form.handle || 'yourname'}.frameline.in`} htmlFor="p-handle">
              <Input id="p-handle" className="font-mono" value={form.handle} onChange={(e) => set({ handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            </Field>
          </div>
          <Field label={<span className="flex justify-between">About <span className={cn('font-mono font-medium', (form.about ?? '').length > 1000 ? 'text-bad' : 'text-ink-3')}>{(form.about ?? '').length.toLocaleString('en-IN')} / 1,000</span></span>} error={show('about')} htmlFor="p-about">
            <Textarea id="p-about" rows={4} value={form.about} onChange={(e) => set({ about: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" error={show('phone')} htmlFor="p-phone"><Input id="p-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Email" error={show('email')} htmlFor="p-email"><Input id="p-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Website" error={show('website')} htmlFor="p-web"><Input id="p-web" placeholder="https://" value={form.website} onChange={(e) => set({ website: e.target.value.trim() })} /></Field>
            <Field label="City" error={show('city')} htmlFor="p-city"><Input id="p-city" value={form.city} onChange={(e) => set({ city: e.target.value })} /></Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold">Brand</h3>
          <Field label="Brand colour" error={show('brandColor')}>
            <div className="flex flex-wrap items-center gap-2">
              {COLOURS.map((c) => (
                <Tip key={c} label={c}>
                  <button type="button" aria-label={`Brand colour ${c}`} onClick={() => set({ brandColor: c })} className={cn('size-7 rounded-full border border-line-2', form.brandColor.toUpperCase() === c && 'outline-2 outline-offset-2 outline-marker')} style={{ background: c }} />
                </Tip>
              ))}
              <Input aria-label="Brand colour hex" className="w-28 font-mono uppercase" maxLength={7} value={form.brandColor} onChange={(e) => set({ brandColor: e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}` })} />
            </div>
          </Field>
          <Field label="Logo" hint="Square PNG or JPG, up to 1 MB">
            <div className="flex items-center gap-3">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-sunk font-display text-[22px] font-semibold" style={form.logoUrl ? undefined : { background: form.brandColor, color: '#fff' }}>
                {form.logoUrl ? <img src={form.logoUrl} alt="Studio logo" className="size-full object-cover" /> : form.name.slice(0, 1)}
              </div>
              <Button size="sm" icon={<ImagePlus size={13} />} onClick={() => logoRef.current?.click()}>{form.logoUrl ? 'Replace' : 'Upload logo'}</Button>
              {form.logoUrl && <Button size="sm" variant="ghost" onClick={() => set({ logoUrl: '' })}>Remove</Button>}
              <input ref={logoRef} type="file" hidden accept="image/*" onChange={(e) => { onImage(e.target.files?.[0], 'logo'); e.target.value = '' }} />
            </div>
          </Field>
          <Field label="Cover photo" hint="16:9, up to 2 MB. Shown on your website and studio app page.">
            <div className="relative aspect-video overflow-hidden rounded-card border border-line bg-sunk">
              {extras.cover ? <img src={extras.cover} alt="Cover" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[12px] text-ink-3">No cover yet</div>}
              <div className="absolute bottom-2 right-2 flex gap-1.5">
                <Button size="sm" icon={<ImagePlus size={13} />} onClick={() => coverRef.current?.click()}>{extras.cover ? 'Replace' : 'Upload cover'}</Button>
                {extras.cover && <Button size="sm" aria-label="Remove cover" onClick={() => setExtras((x) => ({ ...x, cover: '' }))}><Trash2 size={13} /></Button>}
              </div>
              <input ref={coverRef} type="file" hidden accept="image/*" onChange={(e) => { onImage(e.target.files?.[0], 'cover'); e.target.value = '' }} />
            </div>
          </Field>
        </Card>
      </div>

      <Card className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold">Social links</h3>
          <Field label="Instagram" error={show('instagram')} htmlFor="p-ig"><Input id="p-ig" placeholder="@yourstudio" value={form.instagram} onChange={(e) => set({ instagram: e.target.value.trim() })} /></Field>
          <Field label="Facebook" error={show('facebook')} htmlFor="p-fb"><Input id="p-fb" placeholder="https://facebook.com/…" value={extras.facebook} onChange={(e) => setExtras((x) => ({ ...x, facebook: e.target.value.trim() }))} /></Field>
          <Field label="YouTube" error={show('youtube')} htmlFor="p-yt"><Input id="p-yt" placeholder="https://youtube.com/@…" value={extras.youtube} onChange={(e) => setExtras((x) => ({ ...x, youtube: e.target.value.trim() }))} /></Field>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold">Portfolio links</h3>
          {extras.portfolio.map((p, i) => (
            <Field key={i} error={show(`portfolio${i}`)}>
              <div className="flex gap-2">
                <Input aria-label={`Portfolio link ${i + 1}`} placeholder="https://" value={p} onChange={(e) => setExtras((x) => ({ ...x, portfolio: x.portfolio.map((v, j) => (j === i ? e.target.value.trim() : v)) }))} />
                <Tip label="Remove link"><Button size="icon" variant="ghost" aria-label={`Remove portfolio link ${i + 1}`} onClick={() => setExtras((x) => ({ ...x, portfolio: x.portfolio.filter((_, j) => j !== i) }))}><X size={14} /></Button></Tip>
              </div>
            </Field>
          ))}
          <Button size="sm" className="self-start" icon={<Plus size={13} />} disabled={extras.portfolio.length >= 6} onClick={() => setExtras((x) => ({ ...x, portfolio: [...x.portfolio, ''] }))}>Add link</Button>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7">
        <span className="mr-auto flex items-center gap-2 text-[12.5px] text-ink-2"><span className={cn('size-2 rounded-full', dirty ? 'bg-warn' : 'bg-ok')} />{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        {dirty && <Button variant="ghost" onClick={() => { setForm(pick(studio)); setExtras(savedExtras); setTried(false) }}>Discard</Button>}
        <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={submit}>Save changes</Button>
      </div>
    </div>
  )
}
