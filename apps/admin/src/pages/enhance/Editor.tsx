import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ImageOff, RotateCcw } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, Chip, cn, EmptyState, Field, Meter, PageHeader, Segmented, Skeleton, Textarea, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAlbums, useEvent, usePhoto } from '../../lib/queries'
import { QueryError } from '../system'
import { Compare } from './Compare'
import { COST, filterForPrompt, PRESETS, variation } from './presets'
import { Tutorial } from './Tutorial'

type SaveAs = 'new' | 'replace'
const RUN_MS = 2600

export function Editor({ photoId, credits, spend }: { photoId: string; credits?: number; spend: (n: number) => void }) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const photo = usePhoto(photoId)
  const event = useEvent(photo.data?.eventId).data
  const album = useAlbums(photo.data?.eventId).data?.find((a) => a.id === photo.data?.albumId)

  const [preset, setPreset] = useState<string | undefined>(PRESETS[0].id)
  const [prompt, setPrompt] = useState('')
  const [saveAs, setSaveAs] = useState<SaveAs>('new')
  const [run, setRun] = useState(0)
  const [trying, setTrying] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  if (photo.isLoading) {
    return <div className="flex flex-col gap-4 px-4 py-6 sm:px-7"><Skeleton className="h-8 w-64" /><Skeleton className="h-[420px]" /></div>
  }
  if (photo.error || !photo.data) {
    return (
      <div className="px-4 py-10 sm:px-7">
        {photo.error && String((photo.error as Error).message).includes('not found')
          ? <EmptyState icon={<ImageOff size={22} />} title="This photo is gone" body="It may have been deleted. Pick another photo to enhance." action={<Link to="/enhance"><Button variant="primary">Pick a photo</Button></Link>} />
          : <QueryError error={photo.error} retry={() => photo.refetch()} />}
      </div>
    )
  }
  const p = photo.data
  const base = prompt.trim() ? filterForPrompt(prompt) : PRESETS.find((x) => x.id === preset)?.filter
  const filter = (base ?? 'none') + (base ? variation(run) : '')
  const busy = progress !== null
  const nothingChosen = !base
  const albumName = album?.name ?? 'this album'

  const tryAgain = () => {
    setTrying(true)
    const t = window.setTimeout(() => { setRun((r) => r + 1); setTrying(false) }, 900)
    timers.current.push(t)
  }

  const save = () => {
    setError(null)
    if (nothingChosen) { setError('Pick a preset or describe the edit first.'); return }
    if (credits === undefined || credits < COST) { setError('insufficient'); return }
    setProgress(0)
    const start = Date.now()
    const tick = () => {
      const v = Math.min(100, ((Date.now() - start) / RUN_MS) * 100)
      setProgress(v)
      if (v < 100) { timers.current.push(window.setTimeout(tick, 80)); return }
      finish()
    }
    tick()
  }

  const finish = async () => {
    try {
      if (saveAs === 'new') {
        const stem = p.filename.replace(/\.\w+$/, '')
        const [created] = await api.uploadPhotos(p.eventId, p.albumId, [{
          filename: `${stem}_enhanced.jpg`, size: p.exif.sizeBytes, url: p.url, width: p.exif.width, height: p.exif.height,
        }], { quality: 'web' })
        spend(COST)
        toast.toast({
          kind: 'success', title: `Saved as a new photo in ${albumName}`, body: `${COST} credits used.`,
          action: created ? { label: 'Open', onClick: () => navigate(`/events/${p.eventId}/photos/${created.id}`) } : undefined,
        })
      } else {
        spend(COST)
        toast.success('Original replaced', `${COST} credits used. Guests see the new version within a minute.`)
      }
    } catch (e) {
      toast.error('Couldn’t save the edit', e instanceof Error ? e.message : 'Try again in a moment.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        crumb={<Link to={`/events/${p.eventId}/photos/${p.id}`} className="hover:text-ink">Photo viewer /</Link>}
        title="AI enhance"
        subtitle={<span className="break-all">{p.filename} · {album?.name ?? '…'} · {event?.name ?? '…'}</span>}
        actions={credits !== undefined && <Chip tone={credits < COST ? 'bad' : 'accent'}>Balance {fmt.count(credits)} credits</Chip>}
      />
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card className="p-3">
            <Compare photo={p} filter={filter} processing={trying || busy} />
            <p className="mt-2 text-center text-[11.5px] text-ink-3">Drag the divider, or focus it and use ← →. This is a preview; the saved photo is made at full size.</p>
          </Card>
          <Tutorial />
        </div>

        <div className="flex flex-col gap-3">
          <Card>
            <div className="eyebrow mb-2">Presets</div>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Presets">
              {PRESETS.map((x) => {
                const on = !prompt.trim() && preset === x.id
                return (
                  <button key={x.id} type="button" role="radio" aria-checked={on} title={x.hint}
                    onClick={() => { setPreset(x.id); setPrompt(''); setRun(0); setError(null) }}
                    className={cn('rounded-control px-2 py-1.5 text-left text-[12px] font-bold transition', on ? 'border-[1.5px] border-accent bg-accent-soft' : 'border border-line bg-surface hover:bg-sunk')}>
                    {x.label}
                  </button>
                )
              })}
            </div>
          </Card>
          <Card>
            <Field label="Or describe the edit" htmlFor="enh-prompt" hint={prompt.trim() ? 'Your description replaces the preset.' : undefined}>
              <Textarea id="enh-prompt" value={prompt} maxLength={300} onChange={(e) => { setPrompt(e.target.value); setError(null) }}
                placeholder="Make the marigold decor glow warmer, keep skin tones natural" />
            </Field>
          </Card>
          <Card>
            <div className="flex items-center justify-between text-[13px]"><span>Cost</span><b className="font-mono">{COST} credits</b></div>
            <Field label="Save as" className="mt-2.5">
              <Segmented value={saveAs} onChange={setSaveAs} stretch size="sm" options={[
                { value: 'new', label: `New photo in ${albumName}` },
                { value: 'replace', label: 'Replace' },
              ]} />
            </Field>
            {saveAs === 'replace' && <p className="mt-1.5 text-[11.5px] text-ink-3">The original is kept for 30 days in case you change your mind.</p>}
          </Card>

          {busy && (
            <Card aria-live="polite">
              <div className="mb-1.5 flex justify-between text-[12px] font-bold"><span>Enhancing…</span><span className="font-mono">{Math.round(progress!)}%</span></div>
              <Meter value={progress!} />
            </Card>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-control bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error === 'insufficient'
                ? <span>You need {COST} credits and have {fmt.count(credits ?? 0)}. <Link to="/plan" className="font-bold underline">Add credits</Link> and try again.</span>
                : <span>{error}</span>}
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1 justify-center" icon={<RotateCcw size={14} />} onClick={tryAgain} disabled={busy || nothingChosen} loading={trying}>Try again</Button>
            <Button variant="primary" className="flex-[1.4] justify-center" icon={<Check size={14} />} onClick={save} loading={busy}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
