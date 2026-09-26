import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, HelpCircle, ImagePlus, MessageSquareQuote, Plus, Tag, Trash2 } from 'lucide-react'
import type { Studio, StudioFaq, StudioService, StudioTestimonial } from '@frameline/shared'
import { Button, Card, cn, EmptyState, Field, Input, Segmented, Textarea, Tip } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { assetAccept, useAssetUpload } from '../wallet/assets'

/*
 * Services, testimonials and FAQ live on the Studio (api.updateStudio). The website, the studio app
 * and Settings → Studio profile all edit and show the same lists.
 */

export type ContentKind = 'services' | 'testimonials' | 'faq'
type Item = StudioService | StudioTestimonial | StudioFaq

const LIMIT: Record<ContentKind, number> = { services: 8, testimonials: 8, faq: 12 }
const LABEL: Record<ContentKind, { one: string; many: string; saved: string }> = {
  services: { one: 'service', many: 'Services', saved: 'Services saved' },
  testimonials: { one: 'testimonial', many: 'Testimonials', saved: 'Testimonials saved' },
  faq: { one: 'question', many: 'Questions', saved: 'Questions saved' },
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const blank = (kind: ContentKind): Item =>
  kind === 'services' ? { id: newId('sv'), name: '', price: '', description: '' }
    : kind === 'testimonials' ? { id: newId('ts'), quote: '', name: '', detail: '' }
      : { id: newId('fq'), q: '', a: '' }

function problems(kind: ContentKind, it: Item): Record<string, string> {
  const e: Record<string, string> = {}
  if (kind === 'services') {
    const s = it as StudioService
    if (!s.name.trim()) e.name = 'Name the service'
    if (!s.price.trim()) e.price = 'Add a price, like “From ₹35,000”'
  } else if (kind === 'testimonials') {
    const t = it as StudioTestimonial
    if (!t.quote.trim()) e.quote = 'Paste what the client said'
    if (!t.name.trim()) e.name = 'Who said it?'
  } else {
    const f = it as StudioFaq
    if (!f.q.trim()) e.q = 'Write the question'
    if (!f.a.trim()) e.a = 'Write the answer'
  }
  return e
}

/** Edits one of the Studio content lists with a draft and an explicit Save. */
export function StudioContentEditor({ studio, kind, onKindChange, className }: {
  studio: Studio; kind: ContentKind; onKindChange: (k: ContentKind) => void; className?: string
}) {
  const api = useApi()
  const saved = studio[kind] as Item[]
  const [draft, setDraft] = useState<Item[]>(saved)
  const [tried, setTried] = useState(false)
  // Reset when switching lists or when the saved list changes (another tab, live update).
  useEffect(() => { setDraft(saved); setTried(false) }, [kind, saved])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const errors = useMemo(() => draft.map((it) => problems(kind, it)), [draft, kind])
  const invalid = errors.some((e) => Object.keys(e).length)
  const label = LABEL[kind]

  const save = useAction((list: Item[]) => api.updateStudio({ [kind]: list } as Partial<Studio>), {
    success: label.saved, onSuccess: () => setTried(false),
  })
  const submit = () => {
    setTried(true)
    if (invalid) return
    const trimmed = draft.map((it) => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as unknown as Item)
    save.mutate(trimmed)
  }
  const patch = (i: number, p: Partial<Item>) => setDraft((d) => d.map((x, j) => (j === i ? ({ ...x, ...p } as Item) : x)))
  const move = (i: number, by: -1 | 1) => setDraft((d) => {
    const n = [...d]; const j = i + by
    if (j < 0 || j >= n.length) return d
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
  const err = (i: number, k: string) => (tried ? errors[i]?.[k] : undefined)

  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-[15px] font-semibold">Services, reviews & questions</h3>
          <p className="text-[12px] text-ink-3">Shown on your website and in the studio app.</p>
        </div>
        <Segmented size="sm" value={kind} onChange={onKindChange} options={[
          { value: 'services', label: `Services · ${studio.services.length}`, icon: <Tag size={12} /> },
          { value: 'testimonials', label: `Reviews · ${studio.testimonials.length}`, icon: <MessageSquareQuote size={12} /> },
          { value: 'faq', label: `FAQ · ${studio.faq.length}`, icon: <HelpCircle size={12} /> },
        ]} />
      </div>

      {draft.length === 0 ? (
        <EmptyState className="py-6" title={`No ${label.many.toLowerCase()} yet`}
          body={kind === 'services' ? 'List what you offer and a starting price so visitors can enquire.' : kind === 'testimonials' ? 'A few kind words from past clients build trust.' : 'Answer what clients always ask, like delivery time and travel.'}
          action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setDraft([blank(kind)])}>Add {label.one}</Button>} />
      ) : (
        <ol className="flex flex-col gap-2">
          {draft.map((it, i) => (
            <li key={it.id} className="flex gap-2 rounded-control border border-line p-2.5">
              <span className="mt-1 w-5 shrink-0 text-center font-mono text-[11px] text-ink-3">{i + 1}</span>
              <div className="grid min-w-0 flex-1 gap-2">
                {kind === 'services' && (() => { const s = it as StudioService; return <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Service" error={err(i, 'name')}><Input value={s.name} maxLength={60} placeholder="Wedding coverage" onChange={(e) => patch(i, { name: e.target.value })} /></Field>
                    <Field label="Price" error={err(i, 'price')}><Input value={s.price} maxLength={40} placeholder="From ₹1,50,000" onChange={(e) => patch(i, { price: e.target.value })} /></Field>
                  </div>
                  <Field label="What’s included"><Input value={s.description} maxLength={160} placeholder="2 photographers, all functions, edited gallery in 3 weeks" onChange={(e) => patch(i, { description: e.target.value })} /></Field>
                </> })()}
                {kind === 'testimonials' && (() => { const t = it as StudioTestimonial; return <>
                  <Field label="What they said" error={err(i, 'quote')}><Textarea rows={2} value={t.quote} maxLength={400} onChange={(e) => patch(i, { quote: e.target.value })} /></Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Name" error={err(i, 'name')}><Input value={t.name} maxLength={60} placeholder="Riya & Kabir" onChange={(e) => patch(i, { name: e.target.value })} /></Field>
                    <Field label="Detail (optional)"><Input value={t.detail ?? ''} maxLength={60} placeholder="Udaipur, 2026" onChange={(e) => patch(i, { detail: e.target.value })} /></Field>
                  </div>
                  <TestimonialPhoto url={t.photoUrl} name={t.name} onChange={(photoUrl) => patch(i, { photoUrl } as Partial<Item>)} />
                </> })()}
                {kind === 'faq' && (() => { const f = it as StudioFaq; return <>
                  <Field label="Question" error={err(i, 'q')}><Input value={f.q} maxLength={120} placeholder="How long until we get our photos?" onChange={(e) => patch(i, { q: e.target.value })} /></Field>
                  <Field label="Answer" error={err(i, 'a')}><Textarea rows={2} value={f.a} maxLength={600} onChange={(e) => patch(i, { a: e.target.value })} /></Field>
                </> })()}
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <Tip label="Move up"><Button size="icon" variant="ghost" aria-label={`Move ${label.one} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button></Tip>
                <Tip label="Move down"><Button size="icon" variant="ghost" aria-label={`Move ${label.one} ${i + 1} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button></Tip>
                <Tip label="Remove"><Button size="icon" variant="ghost" aria-label={`Remove ${label.one} ${i + 1}`} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}><Trash2 size={14} /></Button></Tip>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {draft.length > 0 && (
          <Button size="sm" icon={<Plus size={13} />} disabled={draft.length >= LIMIT[kind]} onClick={() => setDraft((d) => [...d, blank(kind)])}>Add {label.one}</Button>
        )}
        {tried && invalid && <span className="text-[11.5px] font-semibold text-bad">Fill the fields marked in red.</span>}
        <span className="ml-auto" />
        {dirty && <Button size="sm" variant="ghost" onClick={() => { setDraft(saved); setTried(false) }}>Discard</Button>}
        <Button size="sm" variant="dark" disabled={!dirty} loading={save.isPending} onClick={submit}>Save {label.many.toLowerCase()}</Button>
      </div>
    </Card>
  )
}

/** Client photo for a testimonial, uploaded with api.uploadAsset('testimonial-photo'). Saved with the list. */
function TestimonialPhoto({ url, name, onChange }: { url?: string; name: string; onChange: (url: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const up = useAssetUpload('testimonial-photo')
  return (
    <Field label="Photo (optional)" error={up.error}>
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-sunk text-[13px] font-bold text-ink-3">
          {url ? <img src={url} alt={name ? `${name}` : 'Client'} className="size-full object-cover" /> : (name.trim()[0] ?? '?')}
        </span>
        <Button size="sm" icon={<ImagePlus size={13} />} loading={up.pending} onClick={() => ref.current?.click()}>{url ? 'Replace' : 'Add photo'}</Button>
        {url && <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>Remove</Button>}
        <input ref={ref} type="file" hidden accept={assetAccept('testimonial-photo')}
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const a = await up.upload(f); if (a) onChange(a.url) }} />
      </div>
    </Field>
  )
}
