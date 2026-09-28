import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ImageOff, Plus } from 'lucide-react'
import { ApiError, fmt, type Photo } from '@frameline/shared'
import { Button, Card, cn, EmptyState, Meter, Page, Skeleton, Textarea, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvent, usePhoto } from '../../lib/queries'
import { QueryError } from '../system'
import { Compare } from './Compare'
import { COST, filterForPrompt, PRESETS } from './presets'
import { Tutorial } from './Tutorial'

type SaveAs = 'new' | 'replace'
/** Rough time an enhance takes; the bar eases toward 95% until the API answers. */
const RUN_MS = 2600

const isGone = (err: unknown) => (err instanceof ApiError && err.status === 404) || /not found/i.test(String((err as Error | undefined)?.message ?? ''))
const isBroke = (err: unknown) => err instanceof ApiError && (err.status === 402 || err.code === 'insufficient_credits')

/** /enhance/:photoId ('enhance'): before/after, what should change, the price, and save. */
export function Editor({ photoId, wallet }: { photoId: string; wallet?: number }) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const photo = usePhoto(photoId)
  const event = useEvent(photo.data?.eventId).data

  const [preset, setPreset] = useState<string>(PRESETS[0].id)
  const [prompt, setPrompt] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [broke, setBroke] = useState(false)

  const enhance = useAction((v: { photo: Photo; saveAs: SaveAs }) =>
    api.enhancePhoto(v.photo.id, prompt.trim() ? { prompt: prompt.trim(), saveAs: v.saveAs } : { preset, saveAs: v.saveAs }), {
    errorToast: false,
    onSuccess: (result, v) => {
      toast.toast({
        kind: 'success',
        title: v.saveAs === 'new' ? 'Saved as a new photo' : 'Original replaced',
        body: `${fmt.rupees(COST)} taken from your wallet.${v.saveAs === 'replace' ? ' Guests see the new version within a minute.' : ''}`,
        action: { label: 'Open', onClick: () => navigate(`/events/${result.eventId}/photos/${result.id}`) },
      })
    },
    onError: (err) => {
      if (isBroke(err)) setBroke(true)
      else if (isGone(err)) setError('This photo was deleted while you were editing it.')
      else setError('Couldn’t save the edit. Check your connection and try again. Nothing was taken from your wallet.')
    },
  })
  // Progress while the API works (it doesn't report progress, so this is time-based and stops short of 100%).
  useEffect(() => {
    if (!enhance.isPending) { setProgress(null); return }
    const start = Date.now()
    setProgress(0)
    const i = window.setInterval(() => setProgress(Math.min(95, ((Date.now() - start) / RUN_MS) * 95)), 80)
    return () => clearInterval(i)
  }, [enhance.isPending])

  if (photo.isLoading) {
    return <Page title="Improve a photo"><div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_330px]"><Skeleton className="h-[420px]" /><Skeleton className="h-[360px]" /></div></Page>
  }
  if (photo.error || !photo.data) {
    return (
      <Page title="Improve a photo" crumb={<Link to="/enhance" className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeft size={14} />Pick a photo</Link>}>
        <Card>
          {isGone(photo.error) || !photo.error
            ? <EmptyState icon={<ImageOff size={22} />} title="This photo is gone" body="It may have been deleted or moved to Recently deleted. Pick another photo to improve."
                action={<Link to="/enhance"><Button variant="primary">Pick another photo</Button></Link>} />
            : <QueryError error={photo.error} retry={() => photo.refetch()} />}
        </Card>
      </Page>
    )
  }

  const p = photo.data
  const filter = (prompt.trim() ? filterForPrompt(prompt) : PRESETS.find((x) => x.id === preset)?.filter) ?? 'none'
  const busy = progress !== null
  const short = broke || (wallet !== undefined && wallet < COST)
  const save = (saveAs: SaveAs) => { setError(null); enhance.mutate({ photo: p, saveAs }) }

  return (
    <Page title="Improve a photo"
      crumb={<Link to={`/events/${p.eventId}/photos/${p.id}`} className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeft size={14} />Back to the photo</Link>}
      subtitle={<span className="break-all">{p.filename.replace(/\.[^.]+$/, '')} · {event?.name ?? '…'}</span>}
      actions={wallet !== undefined && <span className="text-[13px] text-ink-3 tnum">Wallet {fmt.rupees(Math.round(wallet))}</span>}>
      <div className="grid items-start gap-x-[22px] gap-y-3 lg:grid-cols-[minmax(0,1fr)_330px] lg:grid-rows-[auto_1fr]">
        <Card padded={false} className="min-w-0 overflow-hidden p-2.5 lg:col-start-1 lg:row-start-1">
          <Compare photo={p} filter={filter} processing={busy} />
          <p className="mt-2 text-center text-[12px] text-ink-3">Drag the divider to compare. This is a preview; the saved photo is made at full size.</p>
        </Card>
        <Tutorial className="max-lg:order-last lg:col-start-1 lg:row-start-2" />

        <Card className="flex flex-col gap-3.5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h3 className="text-[15px] font-extrabold">What should change?</h3>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="What should change?">
            {PRESETS.map((x) => {
              const on = !prompt.trim() && preset === x.id
              return (
                <button key={x.id} type="button" role="radio" aria-checked={on} disabled={busy}
                  onClick={() => { setPreset(x.id); setPrompt(''); setError(null) }}
                  className={cn('flex min-h-[40px] flex-col items-start rounded-full px-3.5 py-1.5 text-left text-[13px] font-bold transition max-sm:min-h-[44px]',
                    on ? 'border-[1.5px] border-accent bg-accent-soft text-accent-text' : 'border border-line-2 bg-surface text-ink-2 hover:text-ink')}>
                  {x.label}
                </button>
              )
            })}
          </div>
          <label htmlFor="enh-prompt" className="sr-only">Or describe it</label>
          <Textarea id="enh-prompt" value={prompt} maxLength={300} disabled={busy} className="min-h-[76px]"
            onChange={(e) => { setPrompt(e.target.value); setError(null) }} placeholder="Or describe it… e.g. make the marigolds glow warmer" />
          {prompt.trim() && <span className="-mt-2 text-[12px] text-ink-3">Your description is used instead of the choices above.</span>}
          <div className="flex items-center justify-between border-t border-line pt-3 text-[13.5px]"><span className="text-ink-2">Cost</span><b className="tnum">{fmt.rupees(COST)}</b></div>

          {busy ? (
            <div aria-live="polite">
              <div className="mb-1.5 flex justify-between text-[13px] font-bold"><span>Improving your photo…</span><span className="tnum">{Math.round(progress!)}%</span></div>
              <Meter value={progress!} label="Progress" />
              <p className="mt-1.5 text-[12px] text-ink-3">Usually under a minute. You can keep this page open.</p>
            </div>
          ) : short ? (
            <>
              <div role="alert" className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[13px] text-warn">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>Not enough in your wallet. This costs {fmt.rupees(COST)}{wallet !== undefined && <> and you have {fmt.rupees(wallet)}</>}.</span>
              </div>
              <Link to="/plan" className="contents"><Button variant="primary" size="lg" icon={<Plus size={16} />} className="w-full">Add money</Button></Link>
            </>
          ) : (
            <>
              {error && <div role="alert" className="flex items-start gap-2 rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
              <Button variant="primary" size="lg" className="w-full" onClick={() => save('new')}>Save as a new photo</Button>
              <Button variant="ghost" className="w-full" onClick={() => save('replace')}>Replace the original</Button>
              <p className="-mt-1 text-center text-[12px] text-ink-3">A new photo goes in the same album. Replacing keeps the original for 30 days.</p>
            </>
          )}
        </Card>
      </div>
    </Page>
  )
}
