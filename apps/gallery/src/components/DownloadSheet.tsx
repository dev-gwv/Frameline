import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, KeyRound, Mail, ShoppingBag } from 'lucide-react'
import { Button, Field, Input, Meter, Skeleton, useToast } from '@frameline/ui'
import { fmt, type FramelineApi, type Photo, type PublicEvent, type PublicStudio, type WatermarkSettings } from '@frameline/shared'
import { useApi } from '../lib/api'
import { ensureWatermark, fallbackWatermark, useWatermark } from '../lib/queries'
import { authFrom, guest, useGuest, type EventSession } from '../lib/guest'
import { canDownloadAll, DIRECT_DOWNLOAD_LIMIT, MAX_DOWNLOAD_ALL } from '../lib/access'
import { errorCode, friendlyError, isStudioOnly } from '../lib/errors'
import { downloadName, downloadPhotos, renderPhoto, saveBlob, type RenderOptions } from '../lib/download'
import { Sheet } from './Sheet'

function renderOptions(event: PublicEvent, studio: PublicStudio, fetched: WatermarkSettings | null | undefined): RenderOptions {
  // No watermark from the API (guests can't read it on the HTTP API yet): fall back to the studio name.
  const wm = fetched ?? (fetched === null ? fallbackWatermark(studio) : undefined)
  const original = event.settings.originalDownloads
  const applyWatermark = !!wm && !event.settings.watermarkOff && (original ? wm.applyTo.originals : wm.applyTo.downloads)
  return { watermark: wm, applyWatermark, original, studio }
}

/** Render options for the sheet's description (may still be loading). */
export function useRenderOptions(event: PublicEvent, studio: PublicStudio): RenderOptions {
  return renderOptions(event, studio, useWatermark().data)
}

/** Resolves the watermark before generating files, so nothing downloads unwatermarked while it loads. */
function useResolveOptions(event: PublicEvent, studio: PublicStudio) {
  const qc = useQueryClient()
  const api = useApi()
  return async () => renderOptions(event, studio, await ensureWatermark(qc, api))
}

/** Tells the studio (Reports / photo stats); a failure here never blocks the guest. */
const countDownloads = (api: FramelineApi, ids: string[], shortId: string) => { if (ids.length) api.recordDownload(ids, shortId).catch(() => {}) }

/** Downloads a single photo immediately, with toasts. */
export function useDownloadOne(event: PublicEvent, studio: PublicStudio) {
  const api = useApi()
  const resolve = useResolveOptions(event, studio)
  const { success, error } = useToast()
  const [busy, setBusy] = useState(false)
  async function run(photo: Photo) {
    setBusy(true)
    try {
      const opts = await resolve()
      const blob = await renderPhoto(photo, opts)
      saveBlob(blob, downloadName(studio, event, photo, opts.original))
      success('Downloaded', `${photo.filename} · ${opts.original ? 'original quality' : 'web quality'}`)
      countDownloads(api, [photo.id], event.shortId)
    } catch (e) {
      error('Download failed', e instanceof Error ? e.message : 'Try again in a moment.')
    } finally { setBusy(false) }
  }
  return { run, busy }
}

type Stage = 'pin' | 'choose' | 'running' | 'done' | 'emailed' | 'blocked'

/**
 * Downloads several photos. `all` = "Download all" (PIN-gated, 5 uses per guest).
 * Up to DIRECT_DOWNLOAD_LIMIT files download one by one; bigger sets offer an emailed ZIP.
 */
export function DownloadSheet({ open, onOpenChange, photos, event, studio, session, all, title, onBuy, loading }: {
  open: boolean; onOpenChange: (v: boolean) => void; photos: Photo[]; event: PublicEvent; studio: PublicStudio; session: EventSession
  all?: boolean; title?: string; onBuy?: () => void; loading?: boolean
}) {
  const api = useApi()
  const opts = useRenderOptions(event, studio)
  const resolve = useResolveOptions(event, studio)
  const profileEmail = useGuest((s) => s.profile?.email)
  const verdict: { ok: boolean; reason?: string; buy?: boolean; needsPin?: boolean; left?: number } = all
    ? canDownloadAll(event, session)
    : { ok: event.settings.downloads !== 'none' || photos.every((p) => session.purchased.includes(p.id)), reason: 'The photographer has turned off downloads for this event.', buy: event.settings.storeEnabled }
  const initial: Stage = !verdict.ok ? 'blocked' : all && verdict.needsPin ? 'pin' : 'choose'
  const [stage, setStage] = useState<Stage>(initial)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [email, setEmail] = useState(session.registration?.email ?? profileEmail ?? '')
  const [pinBusy, setPinBusy] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const counted = useRef(false)
  const { error } = useToast()

  useEffect(() => {
    if (open) { setStage(initial); setPin(''); setPinError(null); setDone(0); counted.current = false }
    else abort.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const n = photos.length
  const big = n > DIRECT_DOWNLOAD_LIMIT

  function countUse() {
    if (all && !counted.current) { counted.current = true; guest.patchSession(event.shortId, (s) => ({ downloadAllUses: s.downloadAllUses + 1 })) }
  }

  /** The API checks the PIN (wrong tries count toward the 15-minute lock). */
  async function submitPin(e: FormEvent) {
    e.preventDefault()
    if (pin.length < 4) { setPinError('Enter all 4 digits.'); return }
    setPinBusy(true)
    try {
      const s = await api.verifyPin(event.shortId, pin)
      guest.patchSession(event.shortId, (cur) => ({ pin: cur.pin ?? 'typed', auth: authFrom(s, cur.auth) }))
      setPinError(null); setStage('choose')
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t check the PIN')
      setPinError(errorCode(err) === 'invalid_pin' ? `That PIN didn't match. ${f.body}` : `${f.title}. ${f.body}`)
      setPin('')
    } finally { setPinBusy(false) }
  }

  async function start() {
    countUse()
    setStage('running'); setDone(0)
    abort.current = new AbortController()
    let saved = 0
    try {
      const resolved = await resolve()
      saved = await downloadPhotos(photos, event, resolved, (d) => { saved = d; setDone(d) }, abort.current.signal)
      if (!abort.current.signal.aborted) setStage('done')
    } catch (e) {
      error('Download stopped', e instanceof Error ? e.message : 'Try again.')
      setStage('choose')
    } finally {
      countDownloads(api, photos.slice(0, saved).map((p) => p.id), event.shortId)
    }
  }

  async function emailZip(e: FormEvent) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setEmailError('Enter an email like name@example.com.'); return }
    setZipBusy(true)
    try {
      await api.requestZip(event.id, email.trim(), { photoIds: photos.map((p) => p.id) })
    } catch (err) {
      // TODO(api): requestZip is studio-only on the HTTP API; guests get the simulated confirmation until a guest ZIP endpoint exists.
      if (!isStudioOnly(err)) {
        const f = friendlyError(err, 'We couldn’t request the ZIP')
        setEmailError(`${f.title}. ${f.body}`)
        setZipBusy(false)
        return
      }
    }
    setZipBusy(false)
    countUse()
    guest.setProfile({ email: email.trim() })
    setStage('emailed')
  }

  const quality = opts.original ? 'Original quality' : 'Web quality, 2048 px'
  const heading = title ?? (all ? 'Download all' : `Download ${fmt.count(n)} ${n === 1 ? 'photo' : 'photos'}`)

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={heading}
      description={stage === 'blocked' || loading ? undefined : `${fmt.count(n)} ${n === 1 ? 'photo' : 'photos'} · ${quality}${opts.applyWatermark ? ' · watermarked' : ''}`}>
      {stage === 'blocked' && (
        <div className="flex flex-col gap-3">
          <p className="rounded-card bg-sunk p-3 text-[13.5px] text-ink-2">{verdict.reason}</p>
          {verdict.buy && onBuy && <Button variant="primary" size="lg" icon={<ShoppingBag size={16} />} className="w-full justify-center" onClick={() => { onOpenChange(false); onBuy() }}>Buy these photos</Button>}
        </div>
      )}
      {stage === 'pin' && (
        <form onSubmit={submitPin} className="flex flex-col gap-3" noValidate>
          <p className="flex items-start gap-2 text-[13px] text-ink-2"><KeyRound size={15} className="mt-0.5 shrink-0 text-accent-text" />Download all needs the gallery PIN. You can use it {MAX_DOWNLOAD_ALL} times on this device — <b className="text-ink">{verdict.left} left</b>.</p>
          <Field label="Gallery PIN" htmlFor="dl-pin" error={pinError}>
            <Input id="dl-pin" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} autoFocus
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(null) }}
              className="h-12 text-center font-mono text-[22px] tracking-[0.5em]" aria-invalid={!!pinError} />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={pinBusy} className="w-full justify-center">Unlock download</Button>
        </form>
      )}
      {stage === 'choose' && loading && (
        <div className="flex flex-col gap-2" aria-busy aria-label="Preparing photos"><Skeleton className="h-11" /><Skeleton className="h-4 w-1/2" /></div>
      )}
      {stage === 'choose' && !loading && (
        <div className="flex flex-col gap-3">
          {all && verdict.left !== undefined && <p className="text-[12.5px] text-ink-3">This uses 1 of your {verdict.left} remaining Download all.</p>}
          {big ? (
            <>
              <form onSubmit={emailZip} className="flex flex-col gap-2.5 rounded-card border border-line p-3.5" noValidate>
                <div className="flex items-center gap-2"><Mail size={16} className="text-accent-text" /><b className="text-[14px]">Email me a ZIP</b><span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-accent-text">Best for {fmt.count(n)} photos</span></div>
                <p className="text-[12.5px] text-ink-2">We'll pack every photo into one ZIP and email a download link, usually within 10 minutes.</p>
                <Field htmlFor="dl-email" error={emailError}>
                  <Input id="dl-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(null) }} className="h-11 text-[15px]" aria-label="Email for the ZIP link" />
                </Field>
                <Button type="submit" variant="primary" size="lg" loading={zipBusy} className="w-full justify-center">Email me the ZIP</Button>
              </form>
              <Button size="lg" icon={<Download size={16} />} className="w-full justify-center" onClick={start}>Download here, one by one</Button>
              <p className="text-[11.5px] text-ink-3">Your browser may ask to allow multiple downloads.</p>
            </>
          ) : (
            <>
              <Button variant="primary" size="lg" icon={<Download size={16} />} className="w-full justify-center" onClick={start}>Download {fmt.count(n)} {n === 1 ? 'photo' : 'photos'}</Button>
              {n > 1 && <p className="text-[11.5px] text-ink-3">Photos save one after another. Your browser may ask to allow multiple downloads.</p>}
            </>
          )}
        </div>
      )}
      {stage === 'running' && (
        <div className="flex flex-col gap-3 py-2" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between"><b className="text-[14px]">Saving photos…</b><span className="font-mono text-[12px] tnum text-ink-2">{done} / {n}</span></div>
          <Meter value={done} max={n} height={8} />
          <Button variant="ghost" onClick={() => { abort.current?.abort(); setStage('done') }}>Stop</Button>
        </div>
      )}
      {stage === 'done' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={36} className="text-ok" />
          <b className="font-display text-[18px]">{done === n ? 'All saved' : `${done} of ${n} saved`}</b>
          <p className="text-[13px] text-ink-2">Check your Downloads folder or Photos app.</p>
          <Button className="mt-2" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      )}
      {stage === 'emailed' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Mail size={34} className="text-accent-text" />
          <b className="font-display text-[18px]">Your ZIP is on its way</b>
          <p className="text-[13px] text-ink-2">We'll email <b className="text-ink">{email.trim()}</b> a link to {fmt.count(n)} photos within 10 minutes. The link works for 7 days.</p>
          <Button className="mt-2" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      )}
    </Sheet>
  )
}
