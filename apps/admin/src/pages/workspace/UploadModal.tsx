import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronLeft, ImagePlus, Upload } from 'lucide-react'
import { PACKS, fmt, type Album, type ID, type Photo, type PhotoEvent, type UploadFile } from '@frameline/shared'
import { Button, Field, Meter, Modal, PhotoTile, RadioCardGroup, Select, Toggle, cn, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useUsage, useWalletBalance, useWatermark } from '../../lib/queries'
import { useUploads } from '../../layout/UploadDock'
import { liveUrl, objectUrl, photosLabel } from './lib'
import { isImage, setPendingFiles, usePendingFiles } from './pending'

const MAX_BYTES = 200 * 1024 * 1024
const POS: Record<string, string> = { tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' }
const DEFAULT_ALBUM = 'Photos'

interface Props { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; albums: Album[]; albumId?: ID }
interface Dup { file: File; index: number; existing?: Photo; twin?: File }
type View = 'options' | 'review' | 'full'

/**
 * ?modal=upload[&album=<id>] — "Add 412 photos to Sangeet": Standard or Original, watermark, More options (fast mode,
 * deep duplicate check). Duplicates are skipped (Review shows them side by side), files over 200 MB are left out.
 * When the batch won't fit the event, the "Not enough space" choice replaces the options.
 */
export function UploadModal({ open, onOpenChange, event, albums, albumId }: Props) {
  const api = useApi()
  const toast = useToast()
  const { start } = useUploads()
  const files = usePendingFiles()
  const usage = useUsage().data
  const wm = useWatermark().data
  const regular = useMemo(() => albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order), [albums])
  const preset = regular.find((a) => a.id === albumId) ?? (regular.length === 1 ? regular[0] : undefined)
  const [target, setTarget] = useState<ID>('')
  useEffect(() => { if (open) setTarget(preset?.id ?? '') }, [open, preset?.id])
  const targetAlbum = regular.find((a) => a.id === target)
  const needsAlbum = !regular.length // an empty event: we make a "Photos" album

  const [quality, setQuality] = useState<'web' | 'original'>('web')
  const [watermark, setWatermark] = useState(true)
  const [more, setMore] = useState(false)
  const [fast, setFast] = useState(false)
  const [deep, setDeep] = useState(false)
  const [deepState, setDeepState] = useState<'idle' | 'running' | 'done'>('idle')
  const [uploadDups, setUploadDups] = useState(false)
  const [view, setView] = useState<View>('options')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setView('options'); setUploadDups(false) } }, [open, files])

  // Filenames already in the event, checked in the browser before anything is sent.
  const existing = useQuery({ queryKey: ['photos', event.id, 'upload-names'], queryFn: () => api.listPhotos(event.id, {}), enabled: open && files.length > 0 })
  const byName = useMemo(() => {
    const m = new Map<string, Photo>()
    existing.data?.items.forEach((p) => m.set(p.filename.toLowerCase(), p))
    return m
  }, [existing.data])
  const { dups, tooLarge } = useMemo(() => {
    const seen = new Map<string, File>()
    const dups: Dup[] = []
    const tooLarge: File[] = []
    files.forEach((f, index) => {
      if (f.size > MAX_BYTES) { tooLarge.push(f); return }
      const key = `${f.name.toLowerCase()}|${f.size}`
      const twin = seen.get(key)
      const ex = byName.get(f.name.toLowerCase())
      if (twin || ex) dups.push({ file: f, index, existing: ex, twin })
      else seen.set(key, f)
    })
    return { dups, tooLarge }
  }, [files, byName])
  useEffect(() => {
    if (!deep || !files.length) { setDeepState('idle'); return }
    setDeepState('running')
    const t = setTimeout(() => setDeepState('done'), 1400)
    return () => clearTimeout(t)
  }, [deep, files])

  const skipped = uploadDups ? 0 : dups.length
  const willUpload = Math.max(0, files.length - skipped - tooLarge.length)
  const weight = quality === 'original' ? 2 : 1
  const eventLeft = Math.max(0, event.photoLimit - event.photoCount)
  const after = event.photoCount + willUpload * weight
  const fits = after <= event.photoLimit
  const planLeft = usage ? Math.max(0, usage.photosLimit - usage.photosUsed) : Infinity

  // Show "Not enough space" in place of the options when the batch clearly won't fit.
  useEffect(() => { if (open && files.length && !existing.isLoading && !fits && view === 'options' && quality === 'web') setView('full') }, [open, files.length, existing.isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = !files.length ? `Add photos to ${targetAlbum?.name ?? event.name}`
    : `Add ${fmt.count(files.length)} photo${files.length === 1 ? '' : 's'} to ${targetAlbum?.name ?? (needsAlbum ? event.name : 'an album')}`

  const addFiles = (list: FileList | null) => {
    const imgs = Array.from(list ?? []).filter(isImage)
    if (imgs.length) setPendingFiles([...files, ...imgs])
  }
  const close = () => { onOpenChange(false); setPendingFiles([]) }

  const send = async (limit?: number) => {
    let album = targetAlbum
    if (!album && needsAlbum) album = await api.createAlbum(event.id, DEFAULT_ALBUM)
    if (!album) return
    const dupSet = new Set(uploadDups ? [] : dups.map((d) => d.index))
    let list = files.filter((f, i) => !dupSet.has(i) && f.size <= MAX_BYTES)
    if (limit !== undefined) list = list.slice(0, limit)
    const toSend: UploadFile[] = list.map((f) => ({ filename: f.name, size: f.size, url: objectUrl(f) }))
    start({ eventId: event.id, albumId: album.id, albumName: album.name, files: toSend, quality, watermark, fast })
    onOpenChange(false)
    setPendingFiles([])
  }
  const submit = async () => {
    if (!fits) { setView('full'); return }
    setBusy(true)
    try { await send() } catch (e) { toast.error('Couldn’t start the upload', errorMessage(e)) } finally { setBusy(false) }
  }

  if (view === 'full' && files.length) {
    return <NotEnoughSpace open={open} onOpenChange={(v) => { if (!v) close() }} event={event} need={willUpload * weight} weight={weight} count={willUpload}
      eventLeft={eventLeft} planLeft={planLeft} onBack={() => setView('options')} onUpload={send} />
  }

  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) close() }} width={620}
      title={view === 'review' ? 'Duplicates' : title}
      description={view === 'review' ? <button type="button" className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline" onClick={() => setView('options')}><ChevronLeft size={13} />Back to upload options</button>
        : files.length ? (existing.isLoading ? 'Checking for photos already in this event…'
          : dups.length ? <>{dups.every((d) => d.existing) ? `${fmt.count(dups.length)} ${dups.length === 1 ? 'is' : 'are'} already in this event` : `${fmt.count(dups.length)} duplicate${dups.length === 1 ? '' : 's'}`} and will {uploadDups ? 'upload again' : 'be skipped'}. <button type="button" className="font-bold text-accent-text underline" onClick={() => setView('review')}>Review</button></>
          : 'None of these are in the event yet.') : 'JPG, PNG, HEIC or WebP, up to 200 MB each.'}
      footer={files.length ? (view === 'review'
        ? <Button variant="primary" onClick={() => setView('options')}>Done</Button>
        : <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" icon={<Upload size={15} />} loading={busy} disabled={willUpload <= 0 || (!targetAlbum && !needsAlbum) || existing.isLoading} onClick={() => void submit()}>
              Upload {photosLabel(willUpload)}
            </Button>
          </>) : undefined}>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />

      {!files.length ? (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2.5 rounded-[14px] border-2 border-dashed border-line-2 bg-paper px-6 py-12 text-center hover:border-accent">
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-text"><ImagePlus size={22} /></span>
          <b className="text-[17px] font-extrabold">Choose photos</b>
          <span className="text-[13px] text-ink-2">Or drop them anywhere on the event’s Photos tab.</span>
          <span className="mt-1 inline-flex h-[38px] items-center rounded-control bg-gold px-4 text-[13.5px] font-bold text-accent-ink">Choose photos</span>
        </button>
      ) : view === 'review' ? (
        <DupReview dups={dups} uploadDups={uploadDups} onUploadDups={setUploadDups} />
      ) : (
        <>
          {!preset && !needsAlbum && (
            <Field label="Which album?" htmlFor="upload-album">
              <Select id="upload-album" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="" disabled>Choose an album…</option>
                {regular.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmt.count(a.photoCount)})</option>)}
              </Select>
            </Field>
          )}
          {needsAlbum && <p className="text-[13px] text-ink-2">They go into an album called <b className="text-ink">{DEFAULT_ALBUM}</b>. Rename it or add more albums any time.</p>}
          <RadioCardGroup<'web' | 'original'> label="Quality" columns={2} value={quality} onChange={setQuality} options={[
            { value: 'web', title: 'Standard', description: 'Resized for the web and watermarked. Counts as 1 photo.' },
            { value: 'original', title: 'Original files', description: 'Full quality for download. Counts as 2 photos.' },
          ]} />
          <div className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <b className="text-[13.5px]">Add my watermark</b>
              <div className="text-[12.5px] text-ink-2">
                {wm ? `${wm.mode === 'logo' ? 'Your logo' : `© ${wm.text}`}, ${POS[wm.position] ?? 'bottom right'}` : 'Your studio watermark'} · <Link to="/watermark" className="font-bold text-accent-text hover:underline">Change</Link>
              </div>
            </div>
            <Toggle label="Add my watermark" checked={watermark} onCheckedChange={setWatermark} />
          </div>

          {tooLarge.length > 0 && (
            <div className="flex items-start gap-2 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <b>{photosLabel(tooLarge.length)} over 200 MB {tooLarge.length === 1 ? 'is' : 'are'} left out</b>
                <ul className="mt-0.5 text-ink-2">{tooLarge.slice(0, 4).map((f) => <li key={f.name} className="truncate">{f.name} · {fmt.bytes(f.size)}</li>)}</ul>
                {tooLarge.length > 4 && <div className="text-ink-2">and {tooLarge.length - 4} more</div>}
                <div className="mt-0.5 text-ink-2">Export them as JPG and add them again.</div>
              </div>
            </div>
          )}

          <div>
            <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="inline-flex min-h-[32px] items-center gap-1 text-[13px] font-bold text-accent-text">
              More options: fast mode, deep duplicate check <ChevronDown size={13} className={cn('transition-transform', more && 'rotate-180')} />
            </button>
            {more && (
              <div className="mt-1.5 flex flex-col divide-y divide-line rounded-[10px] border border-line">
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1"><b className="block text-[13.5px]">Fast mode</b><span className="text-[12.5px] text-ink-2">Smaller batches for weak connections. Retries on its own.</span></span>
                  <Toggle label="Fast mode" checked={fast} onCheckedChange={setFast} />
                </label>
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13.5px]">Deep duplicate check</b>
                    <span className="text-[12.5px] text-ink-2">
                      {deepState === 'running' ? 'Comparing what’s in each photo…' : deepState === 'done' ? `Done: no edited copies beyond the ${fmt.count(dups.length)} found by name.` : 'Also finds edited or renamed copies. Takes a little longer.'}
                    </span>
                  </span>
                  <Toggle label="Deep duplicate check" checked={deep} onCheckedChange={setDeep} />
                </label>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap justify-between gap-x-3 text-[12.5px]">
              <span className="text-ink-2">After this upload</span>
              <span className={cn('tnum', fits ? 'text-ink' : 'font-bold text-bad')}>{fmt.count(after)} of {fmt.count(event.photoLimit)} photos in this event</span>
            </div>
            <Meter value={Math.min(after, event.photoLimit)} max={event.photoLimit || 1} tone={fits ? 'gold' : 'bad'} label="Event photos after this upload" />
            {quality === 'original' && willUpload > 0 && <div className="mt-1.5 text-[12px] text-ink-3">Original files count twice: this uses {photosLabel(willUpload * 2)}.</div>}
          </div>
        </>
      )}
    </Modal>
  )
}

function DupReview({ dups, uploadDups, onUploadDups }: { dups: Dup[]; uploadDups: boolean; onUploadDups: (v: boolean) => void }) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const list = dups.map((d) => URL.createObjectURL(d.file))
    setUrls(list)
    return () => list.forEach((u) => URL.revokeObjectURL(u))
  }, [dups])
  return (
    <>
      <p className="text-[13px] text-ink-2">Matched by file name and size. Yours on the left, what’s in the event on the right.</p>
      <ul className="flex flex-col gap-3">
        {dups.slice(0, 40).map((d, i) => (
          <li key={i} className="grid grid-cols-2 gap-2">
            <figure className="min-w-0">
              <div className="relative overflow-hidden rounded-[8px] bg-sunk" style={{ aspectRatio: '3 / 2' }}><img src={urls[i]} alt={`New: ${d.file.name}`} className="absolute inset-0 size-full object-cover" /></div>
              <figcaption className="mt-1 truncate text-[12px] text-ink-2">{d.file.name}</figcaption>
            </figure>
            <figure className="min-w-0">
              {d.existing
                ? <PhotoTile tone={d.existing.tone} url={liveUrl(d.existing.url)} alt={`Already in the event: ${d.existing.filename}`} rounded="rounded-[8px]" />
                : <div className="relative overflow-hidden rounded-[8px] bg-sunk" style={{ aspectRatio: '3 / 2' }}><img src={urls[i]} alt="" className="absolute inset-0 size-full object-cover opacity-80" /></div>}
              <figcaption className="mt-1 truncate text-[12px] text-ink-3">{d.existing ? 'Already in the event' : 'You picked this file twice'}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {dups.length > 40 && <p className="text-[12.5px] text-ink-3">and {fmt.count(dups.length - 40)} more</p>}
      <label className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
        <span className="min-w-0 flex-1"><b className="block text-[13.5px]">Upload these anyway</b><span className="text-[12.5px] text-ink-2">They’ll appear twice in the gallery.</span></span>
        <Toggle label="Upload duplicates anyway" checked={uploadDups} onCheckedChange={onUploadDups} />
      </label>
    </>
  )
}

/** 'full': the batch doesn't fit the event. Add a photo pack from the wallet, or upload the first ones that fit. */
function NotEnoughSpace({ open, onOpenChange, event, need, weight, count, eventLeft, planLeft, onBack, onUpload }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; need: number; weight: number; count: number
  eventLeft: number; planLeft: number; onBack: () => void; onUpload: (limit?: number) => Promise<void>
}) {
  const api = useApi()
  const toast = useToast()
  const wallet = useWalletBalance()
  const short = need - eventLeft
  const pack = PACKS.find((p) => p.photos >= short) ?? PACKS[PACKS.length - 1]
  const covers = pack.photos >= short
  const firstFit = Math.floor(eventLeft / weight)
  const canPay = wallet.data ? wallet.data.balance >= pack.price : false
  const [choice, setChoice] = useState<'pack' | 'first'>(canPay || !firstFit ? 'pack' : 'first')
  const [picked, setPicked] = useState(false)
  // Until the person picks, follow the wallet: pay for a pack when it can, else upload what fits.
  useEffect(() => { if (wallet.data && !picked) setChoice(canPay || !firstFit ? 'pack' : 'first') }, [wallet.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false)

  const packNote = wallet.isError ? 'Only the studio owner can pay from the wallet.'
    : !wallet.data ? `${fmt.rupees(pack.price)} from your wallet.`
    : canPay ? `${fmt.rupees(pack.price)} from your wallet. Uploads ${covers ? `all ${fmt.count(count)}` : `${fmt.count(Math.floor((eventLeft + pack.photos) / weight))} of them`}.`
    : `${fmt.rupees(pack.price)}. Your wallet has ${fmt.rupees(wallet.data.balance)}; add money first.`

  const go = async () => {
    setBusy(true)
    try {
      if (choice === 'pack') {
        await api.buyPack(event.id, pack.photos, { payWith: 'credits' })
        toast.success(`${fmt.count(pack.photos)} photos added to ${event.name}`, `${fmt.rupees(pack.price)} paid from your wallet`)
        await onUpload(covers ? undefined : Math.floor((eventLeft + pack.photos) / weight))
      } else await onUpload(firstFit)
    } catch (e) {
      toast.error(choice === 'pack' ? 'Couldn’t add the photos' : 'Couldn’t start the upload', errorMessage(e))
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} width={560} title={`Not enough space for ${photosLabel(count)}`}
      description={`This event can hold ${fmt.count(eventLeft)} more.${Number.isFinite(planLeft) ? ` Your plan has ${fmt.count(planLeft)} left.` : ''}`}
      footer={<>
        <Button variant="ghost" onClick={onBack} icon={<ChevronLeft size={14} />} className="mr-auto">Back</Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={choice === 'pack' ? !canPay : !firstFit} onClick={() => void go()}>
          {choice === 'pack' ? `Pay ${fmt.rupees(pack.price)} and upload` : `Upload ${photosLabel(firstFit)}`}
        </Button>
      </>}>
      <RadioCardGroup<'pack' | 'first'> label="What would you like to do?" value={choice} onChange={(v) => { setPicked(true); setChoice(v) }} options={[
        { value: 'pack', title: `Add ${fmt.count(pack.photos)} photos to this event`, description: packNote, disabled: !canPay && !!wallet.data },
        { value: 'first', title: firstFit ? `Upload the first ${fmt.count(firstFit)}` : 'Upload the first ones that fit', description: firstFit ? 'The rest stay on your computer.' : 'This event is full, so nothing fits yet.', disabled: !firstFit },
      ]} />
      <p className="text-[12.5px] text-ink-3">
        {wallet.data && !canPay && <><Link to="/plan" className="font-bold text-accent-text hover:underline">Add money to your wallet</Link> · </>}
        Out of plan space altogether? <Link to="/plan" className="font-bold text-accent-text hover:underline">See plans</Link>
      </p>
    </Modal>
  )
}
