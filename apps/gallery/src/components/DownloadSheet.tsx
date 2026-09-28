import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, Lock, Mail, ShoppingBag } from 'lucide-react'
import { Field, Input, Meter, Skeleton, useToast } from '@frameline/ui'
import { fmt, type DownloadAllowance, type FramelineApi, type Photo, type PublicEvent, type PublicStudio, type PublicWatermark } from '@frameline/shared'
import { useApi } from '../lib/api'
import { ensureWatermark, fallbackWatermark, useWatermark } from '../lib/queries'
import { guest, useGuest, type EventSession } from '../lib/guest'
import { canDownloadAll, DIRECT_DOWNLOAD_LIMIT, MAX_DOWNLOAD_ALL } from '../lib/access'
import { errorCode, friendlyError } from '../lib/errors'
import { downloadPhotos, savePhoto, type RenderOptions } from '../lib/download'
import { PinBoxes } from './Gates'
import { PrimaryButton, StateBlock, WideButton } from './common'
import { RadioCard, Sheet } from './Sheet'

/** Tells the studio about locally rendered downloads; a failure here never blocks the guest. */
const countDownloads = (api: FramelineApi, ids: string[], shortId: string) => { if (ids.length) api.recordDownload(ids, shortId).catch(() => {}) }

function renderOptions(api: FramelineApi, event: PublicEvent, studio: PublicStudio, fetched: PublicWatermark | null | undefined): RenderOptions {
  // `enabled: false` = no watermark on this gallery; the watermark didn't load (null) = studio-name fallback.
  const wm = fetched ? (fetched.enabled ? fetched.settings : undefined) : fetched === null ? fallbackWatermark(studio) : undefined
  const original = event.settings.originalDownloads
  const applyWatermark = !!wm && !event.settings.watermarkOff && (original ? wm.applyTo.originals : wm.applyTo.downloads)
  return {
    watermark: wm, applyWatermark, original, studio,
    getUrl: (p) => api.getPhotoDownloadUrl(p.id, { size: original ? 3072 : 2048, shortId: event.shortId }),
    onLocal: (p) => countDownloads(api, [p.id], event.shortId),
  }
}

/** Render options for the sheet's description (may still be loading). */
export function useRenderOptions(event: PublicEvent, studio: PublicStudio): RenderOptions {
  const api = useApi()
  return renderOptions(api, event, studio, useWatermark(event.shortId).data)
}

/** Resolves the watermark before generating files, so nothing downloads unwatermarked while it loads. */
function useResolveOptions(event: PublicEvent, studio: PublicStudio) {
  const qc = useQueryClient()
  const api = useApi()
  return async () => renderOptions(api, event, studio, await ensureWatermark(qc, api, event.shortId))
}

/** Downloads a single photo immediately, with toasts. */
export function useDownloadOne(event: PublicEvent, studio: PublicStudio) {
  const resolve = useResolveOptions(event, studio)
  const { success, error } = useToast()
  const [busy, setBusy] = useState(false)
  async function run(photo: Photo) {
    setBusy(true)
    try {
      const opts = await resolve()
      await savePhoto(photo, event, opts)
      success('Photo saved', `${opts.original ? 'Full size' : 'Web size'} · check your Downloads or Photos`)
    } catch (e) {
      error('Download didn’t finish', e instanceof Error ? e.message : 'Try again in a moment.')
    } finally { setBusy(false) }
  }
  return { run, busy }
}

type Stage = 'pin' | 'choose' | 'running' | 'done' | 'emailed' | 'blocked'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Downloads several photos. `all` = "Download all": api.verifyDownloadPin checks the PIN (or the VIP link's
 * embedded PIN) and uses one of the guest's 5 uses, counted by the API.
 * Fewer than 10 photos save straight away; more offer "Email me a ZIP" (default) or "Save one by one".
 */
export function DownloadSheet({ open, onOpenChange, photos, event, studio, session, all, title, onBuy, loading, zip }: {
  open: boolean; onOpenChange: (v: boolean) => void; photos: Photo[]; event: PublicEvent; studio: PublicStudio; session: EventSession
  all?: boolean; title?: string; onBuy?: () => void; loading?: boolean; zip?: { albumId?: string; personId?: string }
}) {
  const api = useApi()
  const opts = useRenderOptions(event, studio)
  const resolve = useResolveOptions(event, studio)
  const profileEmail = useGuest((s) => s.profile?.email)
  const verdict: { ok: boolean; reason?: string; buy?: boolean; needsPin?: boolean; left?: number } = all
    ? canDownloadAll(event, session)
    : { ok: event.settings.downloads !== 'none' || photos.every((p) => session.purchased.includes(p.id)), reason: 'The photographer has turned off downloads for this event.', buy: event.settings.storeEnabled }
  const initial: Stage = !verdict.ok ? 'blocked' : all && verdict.needsPin ? 'pin' : 'choose'
  const knownEmail = [session.registration?.email, profileEmail].find((e) => !!e) ?? ''
  const [stage, setStage] = useState<Stage>(initial)
  const [how, setHow] = useState<'zip' | 'one'>('zip')
  const [pinShake, setPinShake] = useState(0)
  const [pinError, setPinError] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [email, setEmail] = useState(knownEmail)
  const [pinBusy, setPinBusy] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [allowance, setAllowance] = useState<DownloadAllowance | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const { error } = useToast()

  useEffect(() => {
    if (open) { setStage(initial); setHow('zip'); setPinError(null); setDone(0); setAllowance(null); setUnlockError(null); setEmailError(null); setBlockReason(null) }
    else abort.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const n = photos.length
  const big = n > DIRECT_DOWNLOAD_LIMIT
  const word = n === 1 ? 'photo' : 'photos'

  /** Uses one "Download all" (once per opening of the sheet). Returns false and explains when it can't. */
  async function unlock(withPin?: string): Promise<boolean> {
    if (!all || allowance) return true
    try {
      const a = await api.verifyDownloadPin(event.shortId, withPin)
      setAllowance(a)
      guest.patchSession(event.shortId, { downloadsLeft: a.remaining })
      return true
    } catch (err) {
      const code = errorCode(err)
      const f = friendlyError(err, 'We couldn’t unlock the download')
      if (code === 'download_limit') { guest.patchSession(event.shortId, { downloadsLeft: 0 }); setBlockReason(f.body); setStage('blocked') }
      else if (code === 'pin_required') { setStage('pin'); setPinError(null) }
      else if (code === 'invalid_pin') { setPinError('That PIN didn’t match. Check the message from the host.'); setPinShake((x) => x + 1) }
      else if (withPin !== undefined) setPinError(`${f.title}. ${f.body}`)
      else setUnlockError(`${f.title}. ${f.body}`)
      return false
    }
  }

  async function submitPin(pin: string) {
    setPinBusy(true)
    const ok = await unlock(pin)
    setPinBusy(false)
    if (ok) { setPinError(null); setStage('choose') }
  }

  async function saveHere() {
    setUnlockError(null)
    if (!(await unlock())) return
    setStage('running'); setDone(0)
    abort.current = new AbortController()
    try {
      const resolved = await resolve()
      await downloadPhotos(photos, event, resolved, setDone, abort.current.signal)
      if (!abort.current.signal.aborted) setStage('done')
    } catch (e) {
      error('Download stopped', e instanceof Error ? e.message : 'Try again.')
      setStage('choose')
    }
  }

  async function emailZip(e?: FormEvent) {
    e?.preventDefault()
    if (!EMAIL.test(email.trim())) { setEmailError('Enter an email like name@example.com.'); document.getElementById('dl-email')?.focus(); return }
    setZipBusy(true); setEmailError(null)
    try {
      if (!(await unlock())) return
      // Whole album / person only when every photo may be downloaded; otherwise the exact photo ids ("own" policy).
      const target = event.settings.downloads === 'all' && (zip?.albumId || zip?.personId) ? zip : { photoIds: photos.map((p) => p.id) }
      await api.requestPublicZip(event.shortId, email.trim(), target)
      guest.setProfile({ email: email.trim() })
      setStage('emailed')
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t send the ZIP')
      setEmailError(`${f.title}. ${f.body}`)
    } finally { setZipBusy(false) }
  }

  const quality = opts.original ? 'Full size' : 'Web size (2048 px)'
  const heading = title ?? `Download ${fmt.count(n)} ${word}`
  const canClose = stage !== 'running'

  const footer = stage === 'choose' && !loading ? (
    big && how === 'zip'
      ? <PrimaryButton icon={<Mail size={16} />} loading={zipBusy} onClick={() => void emailZip()}>{EMAIL.test(email.trim()) ? `Send to ${email.trim()}` : 'Email me the ZIP'}</PrimaryButton>
      : <PrimaryButton icon={<Download size={16} />} onClick={() => void saveHere()}>Save {fmt.count(n)} {word}</PrimaryButton>
  ) : stage === 'running' ? (
    <WideButton onClick={() => { abort.current?.abort(); setStage('done') }}>Stop</WideButton>
  ) : stage === 'done' || stage === 'emailed' ? (
    <WideButton onClick={() => onOpenChange(false)}>Done</WideButton>
  ) : undefined

  return (
    <Sheet open={open} onOpenChange={(v) => { if (canClose) onOpenChange(v) }} hideClose={!canClose} footer={footer}
      title={stage === 'blocked' ? 'Can’t download these photos' : stage === 'emailed' ? 'Your ZIP is on its way' : stage === 'done' ? (done === n ? 'All saved' : `${done} of ${n} saved`) : heading}
      description={stage === 'choose' || stage === 'pin' ? `${quality}${opts.applyWatermark ? ' · with the studio’s watermark' : ''}` : undefined}>
      {stage === 'blocked' && (
        <div className="flex flex-col gap-3">
          <p className="rounded-card bg-sunk p-3.5 text-[14px] text-ink-2">{blockReason ?? verdict.reason}</p>
          {verdict.buy && onBuy && <PrimaryButton icon={<ShoppingBag size={16} />} onClick={() => { onOpenChange(false); onBuy() }}>Buy these photos</PrimaryButton>}
          {!(verdict.buy && onBuy) && <WideButton onClick={() => onOpenChange(false)}>Close</WideButton>}
        </div>
      )}
      {stage === 'pin' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="flex items-start gap-2 text-left text-[13.5px] text-ink-2"><Lock size={15} className="mt-0.5 shrink-0 text-accent-text" />
            <span>Download all needs the gallery PIN. You can use it {MAX_DOWNLOAD_ALL} times{verdict.left !== undefined ? <> · <b className="text-ink">{verdict.left} left</b></> : ''}.</span>
          </p>
          <PinBoxes label="Gallery PIN" shakeKey={pinShake} disabled={pinBusy} invalid={!!pinError} onComplete={(p) => void submitPin(p)} />
          <div aria-live="polite" className="min-h-5 text-[13px] font-bold text-bad">{pinError}</div>
        </div>
      )}
      {stage === 'choose' && loading && (
        <div className="flex flex-col gap-2" aria-busy aria-label="Getting your photos ready"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      )}
      {stage === 'choose' && !loading && (
        <div className="flex flex-col gap-2.5">
          {all && <p className="text-[12.5px] text-ink-3">{allowance ? `Unlocked. ${allowance.remaining} of ${allowance.limit} Download all left after this one.` : `This uses 1 of your ${verdict.left ?? MAX_DOWNLOAD_ALL} Download all.`}</p>}
          {unlockError && <p role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">{unlockError}</p>}
          {big ? (
            <>
              <div role="radiogroup" aria-label="How to download" className="flex flex-col gap-2">
                <RadioCard checked={how === 'zip'} onSelect={() => setHow('zip')} title="Email me a ZIP" detail="Best for many photos. Arrives in a few minutes." />
                <RadioCard checked={how === 'one'} onSelect={() => setHow('one')} title="Save one by one" detail="Keeps this page open while they save." />
              </div>
              {how === 'zip' && (
                <form onSubmit={(e) => void emailZip(e)} noValidate>
                  <Field label="Send the link to" htmlFor="dl-email" error={emailError}>
                    <Input id="dl-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError(null) }} className="h-11 text-[15px]" aria-invalid={!!emailError} />
                  </Field>
                </form>
              )}
              {how === 'one' && <p className="text-[12.5px] text-ink-3">Your browser may ask to allow several downloads.</p>}
            </>
          ) : (
            <p className="text-[14px] text-ink-2">{n > 1 ? `Your ${fmt.count(n)} photos save one after another. Your browser may ask to allow several downloads.` : 'The photo saves to your Downloads or Photos.'}</p>
          )}
        </div>
      )}
      {stage === 'running' && (
        <div className="flex flex-col gap-3 py-2" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between"><b className="text-[14px]">Saving photos…</b><span className="text-[13px] tnum text-ink-2">{done} of {n}</span></div>
          <Meter value={done} max={n} height={8} />
          <p className="text-[12.5px] text-ink-3">Keep this page open until they’re all saved.</p>
        </div>
      )}
      {stage === 'done' && (
        <StateBlock className="py-4" icon={<CheckCircle2 size={26} />} tone="ok" title={done === n ? `${fmt.count(n)} ${word} saved` : `Stopped after ${done}`}
          body="Check your Downloads folder or Photos app." />
      )}
      {stage === 'emailed' && (
        <StateBlock className="py-4" icon={<Mail size={24} />} tone="gold" title={`Sent to ${email.trim()}`}
          body={`We’ll email a link to ${fmt.count(n)} ${word} in a few minutes. The link works for 7 days.`} />
      )}
    </Sheet>
  )
}
