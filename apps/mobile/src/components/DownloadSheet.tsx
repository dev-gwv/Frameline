import { useEffect, useRef, useState, type RefObject } from 'react'
import { Linking, View } from 'react-native'
import { ApiError, type ID, type Photo, type PublicEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { errorCode, errorText, friendlyError } from '@/lib/errors'
import { recordDownloads } from '@/lib/guest'
import { lastRegistration, useLocal } from '@/lib/local'
import { PermissionError, savePhotos, type CaptureHandle } from '@/lib/save'
import { useTheme } from '@/theme'
import { realEmail } from './gates'
import { Button, Field, Input, Meter, RadioCards, Txt } from './primitives'
import { Sheet } from './overlays'

/** From this many photos, guests choose between a ZIP by email and saving one by one. */
const ZIP_FROM = 10
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

type Phase =
  | { k: 'checking' }
  | { k: 'choose' }
  | { k: 'pin' }
  | { k: 'saving'; done: number; remaining?: number; limit?: number }
  | { k: 'done'; n: number; remaining?: number; limit?: number }
  | { k: 'error'; msg: string; settings?: boolean; zip?: boolean }
  | { k: 'zip' }
  | { k: 'zipSent'; email: string }

/**
 * "Download N" flow. With 10 or more photos the guest first chooses: a ZIP by email (default) or save one by one.
 *
 * - Several photos use one of the guest's 5 "Download all" uses: verifyDownloadPin(shortId) first (VIP sessions
 *   with an embedded PIN pass without one), then with the typed PIN on 401 `pin_required`. The sheet shows the
 *   uses left; 429 `download_limit` offers the ZIP instead.
 * - A single photo skips the counter.
 * - "Email me a ZIP" calls requestPublicZip (own-photos galleries send the matched ids / person).
 * - Saved photos are counted with recordDownload. Placeholder photos are captured to JPEG via the CaptureHost.
 */
export function DownloadSheet({ open, onClose, photos, event, host, albumId, personId }: {
  open: boolean; onClose: () => void; photos: Photo[]; event: PublicEvent; host: RefObject<CaptureHandle | null>; albumId?: ID; personId?: ID | null
}) {
  const { c } = useTheme()
  const api = useApi()
  const reg = useLocal(lastRegistration)
  const bulk = photos.length > 1
  const [phase, setPhase] = useState<Phase>({ k: 'checking' })
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string>()
  const [email, setEmail] = useState(realEmail(reg?.email))
  const [how, setHow] = useState<'zip' | 'save'>('zip')
  const knownEmail = emailOk(realEmail(reg?.email))
  const [busy, setBusy] = useState(false)
  const cancelled = useRef(false)
  const started = useRef(false)

  const save = async (allowance?: { remaining: number; limit: number }) => {
    cancelled.current = false
    setPhase({ k: 'saving', done: 0, ...allowance })
    try {
      const n = await savePhotos(photos, host.current, (done) => {
        if (cancelled.current) throw new Error('cancelled')
        setPhase({ k: 'saving', done, ...allowance })
      })
      setPhase({ k: 'done', n, ...allowance })
      recordDownloads(api, photos.slice(0, n), event.shortId)
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') return
      if (e instanceof PermissionError) setPhase({ k: 'error', msg: e.message, settings: true })
      else setPhase({ k: 'error', msg: e instanceof Error && /real photos/.test(e.message) ? 'Downloads available for real photos. These sample photos are placeholders.' : 'Some photos couldn’t be saved. Check free space on your phone and try again.', zip: true })
    }
  }

  /** Uses one "Download all" (with or without a PIN), then saves. */
  const unlockAndSave = async (withPin?: string) => {
    setBusy(true)
    try {
      const allowance = await api.verifyDownloadPin(event.shortId, withPin)
      started.current = true
      await save(allowance)
    } catch (e) {
      const code = errorCode(e)
      if (code === 'pin_required' && !withPin) setPhase({ k: 'pin' })
      else if (code === 'invalid_pin' || code === 'pin_locked') { setPhase({ k: 'pin' }); setPinError(errorText(e)); setPin('') }
      else setPhase({ k: 'error', msg: errorText(e), zip: code === 'download_limit' })
    } finally { setBusy(false) }
  }

  // Start when opened: single photos save straight away; several try the allowance without a PIN first.
  useEffect(() => {
    if (!open || started.current) return
    started.current = true
    // Next tick, so the sheet renders before the first state change.
    const t = setTimeout(() => { if (photos.length >= ZIP_FROM) setPhase({ k: 'choose' }); else if (bulk) unlockAndSave(); else save() }, 0)
    return () => { clearTimeout(t); started.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sendZip = async () => {
    if (!emailOk(email)) { setPhase({ k: 'zip' }); return }
    setBusy(true)
    try {
      const own = event.settings.downloads === 'own'
      await api.requestPublicZip(event.shortId, email.trim(), own || !albumId
        ? { photoIds: photos.slice(0, 500).map((p) => p.id), personId: personId ?? undefined }
        : { albumId })
      setPhase({ k: 'zipSent', email: email.trim() })
    } catch (e) {
      const f = friendlyError(e)
      setPhase({ k: 'error', msg: `${f.title}. ${f.detail}`, zip: !(e instanceof ApiError && e.status === 403) })
    } finally { setBusy(false) }
  }

  const close = () => {
    cancelled.current = true
    started.current = false
    setPhase({ k: 'checking' }); setPin(''); setPinError(undefined)
    onClose()
  }

  const left = (p: { remaining?: number; limit?: number }) => (p.remaining !== undefined ? `${p.remaining} of ${p.limit ?? 5} “Download all” uses left.` : null)

  return (
    <Sheet open={open} onClose={close} title={bulk ? `Download ${photos.length} photos` : 'Download photo'}>
      <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}>
        {phase.k === 'checking' ? <Txt v="small">Getting your photos ready…</Txt> : null}
        {phase.k === 'choose' ? (
          <>
            <RadioCards value={how} onChange={setHow} options={[
              { value: 'zip', title: 'Email me a ZIP', description: 'Best for many photos. Arrives in a few minutes.' },
              { value: 'save', title: 'Save one by one', description: 'Keeps this page open while they save' },
            ]} />
            {how === 'zip' && !knownEmail ? <Field label="Email"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@gmail.com" /></Field> : null}
            <Button label={how === 'zip' ? (emailOk(email) ? `Send to ${email.trim()}` : 'Send the ZIP') : `Save ${photos.length} photos`} variant="primary" size="lg" loading={busy}
              disabled={how === 'zip' && !emailOk(email)} onPress={() => (how === 'zip' ? sendZip() : unlockAndSave())} />
          </>
        ) : null}
        {phase.k === 'pin' ? (
          <>
            <Txt v="small">Enter the gallery PIN to save all photos. Each guest can use “Download all” 5 times.</Txt>
            <Field label="PIN" error={pinError}>
              <Input mono value={pin} onChangeText={(t) => { setPin(t.replace(/\D/g, '')); setPinError(undefined) }} maxLength={10} keyboardType="number-pad" placeholder="••••" invalid={!!pinError} style={{ letterSpacing: 10, textAlign: 'center', fontSize: 22 }} />
            </Field>
            <Button label={`Save ${photos.length} photos`} variant="primary" size="lg" disabled={pin.length < 4} loading={busy} onPress={() => unlockAndSave(pin)} />
            <Button label="Email me a ZIP instead" variant="ghost" onPress={() => setPhase({ k: 'zip' })} />
          </>
        ) : null}
        {phase.k === 'saving' ? (
          <>
            <Txt>Saving <Txt v="mono">{phase.done}</Txt> of <Txt v="mono">{photos.length}</Txt> to your photos…</Txt>
            <Meter value={phase.done} max={photos.length} />
            {left(phase) ? <Txt v="small">{left(phase)}</Txt> : null}
            <Button label="Stop" onPress={close} />
          </>
        ) : null}
        {phase.k === 'done' ? (
          <>
            <Txt v="h3">Saved {phase.n} photos</Txt>
            <Txt v="small">Find them in your Photos app.{left(phase) ? ` ${left(phase)}` : ''}</Txt>
            <Button label="Done" variant="primary" onPress={close} />
          </>
        ) : null}
        {phase.k === 'zip' ? (
          <>
            <Txt v="small">We’ll email you a link to a ZIP of {photos.length === 1 ? 'this photo' : `these ${photos.length} photos`}. It usually takes a few minutes.</Txt>
            <Field label="Email"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@gmail.com" /></Field>
            <Button label="Email me the ZIP" variant="primary" size="lg" loading={busy} disabled={!email.trim()} onPress={sendZip} />
          </>
        ) : null}
        {phase.k === 'zipSent' ? (
          <>
            <Txt v="h3">ZIP on its way</Txt>
            <Txt v="small">Check {phase.email} in a few minutes.</Txt>
            <Button label="Done" variant="primary" onPress={close} />
          </>
        ) : null}
        {phase.k === 'error' ? (
          <>
            <Txt color={c.bad}>{phase.msg}</Txt>
            {phase.settings ? <Button label="Open Settings" onPress={() => Linking.openSettings()} /> : null}
            {phase.zip ? <Button label="Email me a ZIP instead" onPress={() => setPhase({ k: 'zip' })} /> : null}
            <Button label="Close" onPress={close} />
          </>
        ) : null}
      </View>
    </Sheet>
  )
}
