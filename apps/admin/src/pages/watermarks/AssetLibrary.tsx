import { useRef, useState } from 'react'
import { Plus, Trash2, Type, Upload } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, CardHeader, cn, EmptyState, Field, Input, Meter, Modal, Select, useToast } from '@frameline/ui'
import { FONTS, fontStack, readAsDataUrl, uid } from './lib'
import { ASSET_STORAGE, AssetMark, MAX_ASSET_FILE, MAX_ASSETS, type Asset } from './advanced'
import { PhotoFrame, SAMPLES } from './samples'

const EMOJI = ['📷', '✨', '❤️', '©', '★', '🌸', '🎉', '🌿', '💍', '🪔']
const COLOURS = ['#FFFFFF', '#1B1712', '#E2B458', '#8C2F39', '#2A8A8F']

/** `onRemove` acts at once and returns an undo function (rule 8: Undo, not “Are you sure?”). */
export function AssetLibrary({ assets, onAdd, onRemove, studioName }: { assets: Asset[]; onAdd: (a: Asset) => void; onRemove: (id: string) => () => void; studioName: string }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [textOpen, setTextOpen] = useState(false)
  const used = assets.reduce((s, a) => s + a.bytes, 0)
  const full = assets.length >= MAX_ASSETS

  async function upload(files: FileList) {
    let room = MAX_ASSETS - assets.length
    let space = ASSET_STORAGE - used
    for (const f of Array.from(files)) {
      if (room <= 0) { toast.error('Your marks library is full', `You can keep up to ${MAX_ASSETS} marks. Remove one to add more.`); break }
      if (!f.type.startsWith('image/')) { toast.error(`${f.name} isn’t an image`, 'Use PNG, SVG, JPG or WebP.'); continue }
      if (f.size > MAX_ASSET_FILE) { toast.error(`${f.name} is too large`, 'Each logo must be 25 MB or smaller.'); continue }
      if (f.size > space) { toast.error('Not enough space for marks', 'Remove an asset or use a smaller file.'); break }
      try {
        onAdd({ id: uid('as'), kind: 'image', name: f.name, dataUrl: await readAsDataUrl(f), bytes: f.size })
        room--; space -= f.size
      } catch (e) { toast.error('Couldn’t add that file', (e as Error).message) }
    }
  }

  return (
    <Card>
      <CardHeader title="Your marks" description="Logos and text marks you can use for originals and events above."
        action={<span className="text-[12.5px] text-ink-3 tnum">{assets.length} of {MAX_ASSETS}</span>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" multiple accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = '' }} />
        <Button size="sm" icon={<Upload size={13} />} disabled={full} onClick={() => fileRef.current?.click()}>Upload a logo</Button>
        <Button size="sm" icon={<Type size={13} />} disabled={full} onClick={() => setTextOpen(true)}>Create text mark</Button>
      </div>
      {assets.length === 0 ? (
        <EmptyState className="py-8" title="No marks yet" body="Upload a logo (PNG or SVG, up to 25 MB) or create a text mark with your own font and emoji."
          action={<Button size="sm" icon={<Type size={13} />} onClick={() => setTextOpen(true)}>Create text mark</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-control border border-line">
              <div className="flex h-20 items-center justify-center p-2" style={{ containerType: 'inline-size', background: SAMPLES[3].bg }}>
                <AssetMark asset={a} fallbackText={studioName} fallbackFont="Fraunces" width={80} style={{ maxHeight: '64px', objectFit: 'contain' }} />
              </div>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold">{a.name}</div>
                  <div className="text-[11.5px] text-ink-3">{a.kind === 'text' ? 'Text mark' : fmt.bytes(a.bytes)}</div>
                </div>
                <Button size="sm" variant="ghost" className="px-2" icon={<Trash2 size={13} />} aria-label={`Remove ${a.name}`}
                  onClick={() => { const undo = onRemove(a.id); toast.undo(`${a.name} removed`, undo) }}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[12px] text-ink-2"><span>Space for marks</span><span className="tnum">{fmt.bytes(used)} of {fmt.bytes(ASSET_STORAGE)}</span></div>
        <Meter value={used} max={ASSET_STORAGE} />
      </div>

      <TextMarkModal open={textOpen} onOpenChange={setTextOpen} onCreate={(a) => { onAdd(a); toast.success('Text mark added') }} />
    </Card>
  )
}

function TextMarkModal({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (a: Asset) => void }) {
  const [text, setText] = useState('© Northlight')
  const [font, setFont] = useState<string>('Fraunces')
  const [color, setColor] = useState('#FFFFFF')
  const ok = text.trim().length > 0
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create a text mark" description="Type your mark, pick a font, add an emoji if you like." width={560}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" icon={<Plus size={14} />} disabled={!ok} onClick={() => {
          onCreate({ id: uid('as'), kind: 'text', name: text.trim().slice(0, 30), text: text.trim(), font, color, bytes: 2048 })
          onOpenChange(false)
        }}>Add text mark</Button>
      </>}>
      <div className="flex flex-col gap-3.5">
        <Field label="Text" htmlFor="tm-text" error={!ok ? 'Type at least one character.' : undefined}>
          <Input id="tm-text" value={text} maxLength={32} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1" aria-label="Add an emoji">
          {EMOJI.map((e) => (
            <button key={e} type="button" aria-label={`Add ${e}`} onClick={() => setText((t) => `${t}${t.endsWith(' ') || !t ? '' : ' '}${e}`.slice(0, 32))} className="grid size-8 place-items-center rounded-control border border-line text-[15px] hover:bg-sunk">{e}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Font" htmlFor="tm-font">
            <Select id="tm-font" value={font} onChange={(e) => setFont(e.target.value)} style={{ fontFamily: fontStack(font) }}>
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Colour">
            <div className="flex gap-1.5">
              {COLOURS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                  className={cn('size-8 rounded-full border border-line-2', color === c && 'outline-2 outline-offset-2 outline-accent')} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
        <div className="flex h-[200px] items-center justify-center rounded-control bg-sunk p-2">
          <PhotoFrame sample={SAMPLES[1]} fit="height">
            <div className="absolute inset-0 grid place-items-center">
              <AssetMark asset={{ id: 'draft', kind: 'text', name: '', text: text || ' ', font, color, bytes: 0 }} fallbackText="" fallbackFont={font} width={60} />
            </div>
          </PhotoFrame>
        </div>
      </div>
    </Modal>
  )
}
