import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Droplets, ImagePlus, Monitor, Plus, ScanSearch, Upload, Zap } from 'lucide-react'
import { fmt, type Album, type ID, type Photo, type PhotoEvent, type UploadFile } from '@frameline/shared'
import { Button, Card, Field, Meter, Modal, PhotoTile, Segmented, Select, Toggle, cn } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useUsage, useWatermark } from '../../lib/queries'
import { useUploads } from '../../layout/UploadDock'
import { liveUrl, objectUrl } from './lib'

const MAX_BYTES = 200 * 1024 * 1024
const POS: Record<string, string> = { tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' }

export const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|tiff?|gif|avif)$/i.test(f.name)

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  event: PhotoEvent
  albums: Album[]
  albumId?: ID
  files: File[]
  onFiles: (files: File[]) => void
}

interface Dup { file: File; existing?: Photo; twin?: File }

export function UploadModal({ open, onOpenChange, event, albums, albumId, files, onFiles }: Props) {
  const api = useApi()
  const { start } = useUploads()
  const usage = useUsage().data
  const wm = useWatermark().data
  const regular = albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order)
  const presetAlbum = regular.find((a) => a.id === albumId)
  const [target, setTarget] = useState<ID>(presetAlbum?.id ?? '')
  useEffect(() => { if (open) setTarget(presetAlbum?.id ?? '') }, [open, presetAlbum?.id])
  const targetAlbum = regular.find((a) => a.id === target)

  const [quality, setQuality] = useState<'web' | 'original'>('web')
  const [watermark, setWatermark] = useState(true)
  const [speed, setSpeed] = useState<'standard' | 'fast'>('standard')
  const [dupChoice, setDupChoice] = useState<'skip' | 'upload'>('skip')
  const [deep, setDeep] = useState<'idle' | 'running' | 'done'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  // Every filename already in the event (checked in the browser before anything is sent).
  const existing = useQuery({
    queryKey: ['photos', event.id, 'upload-names'],
    queryFn: () => api.listPhotos(event.id, {}),
    enabled: open && files.length > 0,
  })
  const byName = useMemo(() => {
    const m = new Map<string, Photo>()
    existing.data?.items.forEach((p) => m.set(p.filename.toLowerCase(), p))
    return m
  }, [existing.data])

  const { dups, tooLarge } = useMemo(() => {
    const seen = new Map<string, File>()
    const dups: Dup[] = []
    const tooLarge: File[] = []
    for (const f of files) {
      if (f.size > MAX_BYTES) { tooLarge.push(f); continue }
      const key = `${f.name.toLowerCase()}|${f.size}`
      const twin = seen.get(key)
      const ex = byName.get(f.name.toLowerCase())
      if (twin || ex) dups.push({ file: f, existing: ex, twin })
      else seen.set(key, f)
    }
    return { dups, tooLarge }
  }, [files, byName])

  useEffect(() => setDeep('idle'), [files])
  const skipped = dupChoice === 'skip' ? dups.length : 0
  const willUpload = files.length - skipped - tooLarge.length
  const weight = quality === 'original' ? 2 : 1
  const eventAfter = event.photoCount + willUpload * weight
  const overEvent = eventAfter > event.photoLimit
  const planLeft = usage ? usage.photosLimit - usage.photosUsed : Infinity
  const overPlan = willUpload * weight > planLeft

  const addFiles = (list: FileList | null) => {
    if (!list) return
    onFiles([...files, ...Array.from(list).filter(isImage)])
  }

  const runDeep = () => {
    setDeep('running')
    setTimeout(() => setDeep('done'), 1600)
  }

  const submit = () => {
    if (!targetAlbum || willUpload <= 0 || overEvent) return
    const dupSet = new Set(dupChoice === 'skip' ? dups.map((d) => d.file) : [])
    const large = new Set(tooLarge)
    const toSend: UploadFile[] = files
      .filter((f) => !dupSet.has(f) && !large.has(f))
      .map((f) => ({ filename: f.name, size: f.size, url: objectUrl(f) }))
    start({ eventId: event.id, albumId: targetAlbum.id, albumName: targetAlbum.name, files: toSend, quality, watermark, fast: speed === 'fast' })
    onFiles([])
    onOpenChange(false)
  }

  const title = files.length
    ? `Add ${fmt.count(files.length)} photo${files.length === 1 ? '' : 's'} to ${targetAlbum?.name ?? 'an album'}`
    : `Add photos to ${targetAlbum?.name ?? 'this event'}`

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description="Checked in your browser before anything is sent." width={920}>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      {!files.length ? (
        <div className="p-5 sm:p-6">
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed border-line-2 bg-sunk px-6 py-12 text-center hover:border-accent">
            <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-text"><ImagePlus size={24} /></span>
            <b className="font-display text-[18px]">Choose photos to upload</b>
            <span className="text-[13px] text-ink-2">JPG, PNG, HEIC or WebP. You can also drop files anywhere on the event page.</span>
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-[1fr_330px]">
          <div className="flex min-w-0 flex-col gap-4 px-5 py-4 sm:px-6">
            {!presetAlbum && (
              <Field label="Which album should these go into?" htmlFor="upload-album" error={!target ? 'Pick an album to continue.' : undefined}>
                <Select id="upload-album" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="" disabled>Choose an album…</option>
                  {regular.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmt.count(a.photoCount)})</option>)}
                </Select>
              </Field>
            )}
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-ink-2">Quality</div>
              <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Quality">
                {([
                  ['web', 'Web-ready', 'Resized to 2K, watermark applied. Counts as 1 photo.'],
                  ['original', 'Originals', 'Full files kept for download. Counts as 2 photos.'],
                ] as const).map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={quality === v} onClick={() => setQuality(v)}
                    className={cn('rounded-[10px] border px-3 py-2.5 text-left', quality === v ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface hover:bg-sunk')}>
                    <b className="text-[13px]">{t}</b>
                    <div className="text-[12px] text-ink-2">{d}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text"><Droplets size={14} /></span>
              <div className="min-w-0 flex-1">
                <b className="text-[13px]">Add watermark</b>
                <div className="text-[12px] text-ink-2">
                  {wm ? `© ${wm.mode === 'logo' ? 'Studio logo' : wm.text} · ${POS[wm.position]}` : 'Your studio watermark'} · <Link to="/watermarks" className="font-bold text-accent-text underline">edit</Link>
                </div>
              </div>
              <Toggle label="Add watermark" checked={watermark} onCheckedChange={setWatermark} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text"><Zap size={14} /></span>
              <div className="min-w-0 flex-1">
                <b className="text-[13px]">Upload speed</b>
                <div className="text-[12px] text-ink-2">Fast mode sends smaller batches on weak connections</div>
              </div>
              <Segmented size="sm" value={speed} onChange={setSpeed} options={[{ value: 'standard', label: 'Standard' }, { value: 'fast', label: 'Fast' }]} />
            </div>

            {existing.isLoading ? (
              <div className="rounded-card bg-sunk p-3.5 text-[12.5px] text-ink-2">Checking for duplicates…</div>
            ) : dups.length > 0 ? (
              <div className="rounded-card bg-warn-soft p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-[13px] text-warn">{fmt.count(dups.length)} photo{dups.length === 1 ? ' is' : 's are'} already in this event</b>
                  <Segmented size="sm" value={dupChoice} onChange={setDupChoice} options={[{ value: 'skip', label: 'Skip them' }, { value: 'upload', label: 'Upload anyway' }]} />
                </div>
                <DupThumbs dups={dups.slice(0, 4)} />
                {dups.length > 4 && <div className="mt-1.5 text-[11.5px] text-ink-2">and {dups.length - 4} more</div>}
                <div className="mt-2 text-[11.5px] text-ink-2">
                  Matched by filename and size. {deep === 'idle' && <button type="button" className="font-bold underline" onClick={runDeep}>Run deep check</button>}
                  {deep === 'running' && <span className="inline-flex items-center gap-1.5 font-bold"><ScanSearch size={12} className="animate-pulse" />Comparing photo content…</span>}
                  {deep === 'done' && <span className="font-bold text-ok">Deep check done: no edited copies beyond these {dups.length}.</span>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-card bg-ok-soft p-3 text-[12.5px] font-semibold text-ok">
                <CheckCircle2 size={15} />No duplicates found.
                {deep === 'idle' && <button type="button" className="ml-auto text-[11.5px] underline" onClick={runDeep}>Run deep check</button>}
                {deep === 'running' && <span className="ml-auto text-[11.5px]">Comparing content…</span>}
                {deep === 'done' && <span className="ml-auto text-[11.5px]">Deep check: no edited copies</span>}
              </div>
            )}
            {tooLarge.length > 0 && (
              <div className="flex items-start gap-2 rounded-card bg-bad-soft p-3 text-[12.5px] text-bad">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span><b>{tooLarge.length} file{tooLarge.length === 1 ? ' is' : 's are'} over 200 MB</b> and will be left out: {tooLarge.slice(0, 3).map((f) => f.name).join(', ')}{tooLarge.length > 3 ? '…' : ''}. Export them as JPG and add them again.</span>
              </div>
            )}
            <Button variant="ghost" size="sm" className="self-start" icon={<Plus size={13} />} onClick={() => inputRef.current?.click()}>Add more photos</Button>
          </div>

          <aside className="flex flex-col gap-3 border-t border-line bg-sunk p-5 md:border-l md:border-t-0">
            <div className="eyebrow">Summary</div>
            <SumRow label="Selected" value={fmt.count(files.length)} />
            <SumRow label="Duplicates skipped" value={`− ${fmt.count(skipped)}`} />
            <SumRow label="Too large (over 200 MB)" value={`− ${fmt.count(tooLarge.length)}`} />
            <SumRow label="Will upload" value={fmt.count(Math.max(0, willUpload))} strong />
            {quality === 'original' && <div className="text-[11.5px] text-ink-2">Originals count twice: uses <b className="font-mono">{fmt.count(willUpload * 2)}</b> photos of capacity.</div>}
            <div>
              <div className="flex justify-between text-[12px]"><span>Event capacity after upload</span><span className="font-mono tnum">{fmt.count(eventAfter)} / {fmt.count(event.photoLimit)}</span></div>
              <Meter value={eventAfter} max={event.photoLimit} className="mt-1.5" />
              {usage && <div className="mt-1.5 flex justify-between text-[11.5px] text-ink-3"><span>Plan this year</span><span className="font-mono">{fmt.count(planLeft)} left</span></div>}
            </div>
            {(overEvent || overPlan) && (
              <div className="rounded-card bg-bad-soft p-3 text-[12px] text-bad">
                {overEvent ? `This goes ${fmt.count(eventAfter - event.photoLimit)} photos over the event limit.` : 'Your plan doesn’t have enough photos left.'}{' '}
                <Link to="/plan" className="font-bold underline">Increase photo limit</Link>
              </div>
            )}
            <Card className={cn('flex gap-2 text-[12px] text-ink-2', files.length > 2000 && 'border-accent')}>
              <Monitor size={15} className="mt-0.5 shrink-0 text-ink-3" />
              <span>Uploading more than 2,000 photos? The <b className="text-ink">desktop uploader</b> resumes after sleep or network drops.</span>
            </Card>
            <Button variant="primary" size="lg" className="mt-auto justify-center" icon={<Upload size={15} />} disabled={!targetAlbum || willUpload <= 0 || overEvent} onClick={submit}>
              Upload {fmt.count(Math.max(0, willUpload))} photo{willUpload === 1 ? '' : 's'}
            </Button>
            {speed === 'fast' && <div className="text-center text-[11px] text-ink-3">Fast mode: smaller batches, retried automatically.</div>}
          </aside>
        </div>
      )}
    </Modal>
  )
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between text-[13px]', strong && 'border-t border-line-2 pt-2 font-extrabold')}>
      <span>{label}</span><span className="font-mono tnum">{value}</span>
    </div>
  )
}

function DupThumbs({ dups }: { dups: Dup[] }) {
  const urls = useMemo(() => dups.map((d) => URL.createObjectURL(d.file)), [dups])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const [twinUrls] = useState(() => new Map<File, string>())
  useEffect(() => () => { twinUrls.forEach((u) => URL.revokeObjectURL(u)); twinUrls.clear() }, [twinUrls])
  const twinUrl = (f: File) => { let u = twinUrls.get(f); if (!u) { u = URL.createObjectURL(f); twinUrls.set(f, u) } return u }
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {dups.map((d, i) => (
        <div key={i} className="min-w-0">
          <div className="flex gap-[3px]">
            <div className="relative flex-1 overflow-hidden rounded-md bg-sunk" style={{ aspectRatio: '3 / 2' }}>
              <img src={urls[i]} alt={`New: ${d.file.name}`} className="absolute inset-0 size-full object-cover" />
            </div>
            <div className="flex-1 opacity-70">
              {d.existing
                ? <PhotoTile tone={d.existing.tone} url={liveUrl(d.existing.url)} alt={`Existing: ${d.existing.filename}`} />
                : d.twin && <div className="relative overflow-hidden rounded-md bg-sunk" style={{ aspectRatio: '3 / 2' }}><img src={twinUrl(d.twin)} alt="Same file selected twice" className="absolute inset-0 size-full object-cover" /></div>}
            </div>
          </div>
          <div className="mt-0.5 truncate font-mono text-[9.5px] text-ink-3" title={d.file.name}>{d.file.name}</div>
          <div className="text-[9.5px] text-ink-3">{d.existing ? 'Already in event' : 'Picked twice'}</div>
        </div>
      ))}
    </div>
  )
}
