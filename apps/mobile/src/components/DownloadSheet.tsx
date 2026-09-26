import { useEffect, useRef, useState, type RefObject } from 'react'
import { Linking, View } from 'react-native'
import type { Photo, PublicEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { recordDownloads } from '@/lib/guest'
import { actions, useLocal } from '@/lib/local'
import { PermissionError, savePhotos, type CaptureHandle } from '@/lib/save'
import { useTheme } from '@/theme'
import { Button, Field, Input, Meter, Txt } from './primitives'
import { Sheet } from './overlays'

type Phase = { k: 'pin' } | { k: 'saving'; done: number } | { k: 'done'; n: number } | { k: 'error'; msg: string; settings?: boolean }

/**
 * "Download N" flow: PIN check (verifyPin) for PIN galleries this phone hasn't unlocked yet, then saves each photo
 * to the library with progress and counts the downloads (recordDownload). Placeholder photos are captured to JPEG
 * via the CaptureHost.
 */
export function DownloadSheet({ open, onClose, photos, event, host }: { open: boolean; onClose: () => void; photos: Photo[]; event: PublicEvent; host: RefObject<CaptureHandle | null> }) {
  const { c } = useTheme()
  const api = useApi()
  const unlocked = useLocal((s) => s.unlocked.includes(event.id))
  const needsPin = event.settings.access === 'link-pin' && !unlocked
  const [checking, setChecking] = useState(false)
  const [phase, setPhase] = useState<Phase>({ k: 'pin' })
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string>()
  const cancelled = useRef(false)
  const started = useRef(false)

  const start = async () => {
    cancelled.current = false
    setPhase({ k: 'saving', done: 0 })
    try {
      const n = await savePhotos(photos, host.current, (done) => {
        if (cancelled.current) throw new Error('cancelled')
        setPhase({ k: 'saving', done })
      })
      setPhase({ k: 'done', n })
      recordDownloads(api, photos.slice(0, n), event.shortId)
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') return
      if (e instanceof PermissionError) setPhase({ k: 'error', msg: e.message, settings: true })
      else setPhase({ k: 'error', msg: e instanceof Error && /real photos/.test(e.message) ? 'Downloads available for real photos. These sample photos are placeholders.' : 'Some photos couldn’t be saved. Check free space on your phone and try again.' })
    }
  }

  // Kick off immediately when no PIN is needed.
  useEffect(() => {
    if (open && !needsPin && !started.current) { started.current = true; start() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsPin])

  const close = () => {
    cancelled.current = true
    started.current = false
    setPhase({ k: 'pin' }); setPin(''); setPinError(undefined)
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={`Download ${photos.length} photos`}>
      <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}>
        {phase.k === 'pin' && needsPin ? (
          <>
            <Txt v="small">Enter the gallery PIN to save all photos. This keeps full downloads with the family.</Txt>
            <Field label="PIN" error={pinError}>
              <Input mono value={pin} onChangeText={(t) => { setPin(t.replace(/\D/g, '')); setPinError(undefined) }} maxLength={4} keyboardType="number-pad" placeholder="••••" invalid={!!pinError} style={{ letterSpacing: 10, textAlign: 'center', fontSize: 22 }} />
            </Field>
            <Button label={`Save ${photos.length} photos`} variant="primary" size="lg" disabled={pin.length !== 4} loading={checking}
              onPress={async () => {
                setChecking(true)
                try {
                  const session = await api.verifyPin(event.shortId, pin)
                  started.current = true
                  actions.unlock(event.id, session.seeAll)
                  start()
                } catch (e) { setPinError(errorText(e)) } finally { setChecking(false) }
              }} />
          </>
        ) : null}
        {phase.k === 'saving' ? (
          <>
            <Txt>Saving <Txt v="mono">{phase.done}</Txt> of <Txt v="mono">{photos.length}</Txt> to your photos…</Txt>
            <Meter value={phase.done} max={photos.length} />
            <Button label="Stop" onPress={close} />
          </>
        ) : null}
        {phase.k === 'done' ? (
          <>
            <Txt v="h3">Saved {phase.n} photos</Txt>
            <Txt v="small">Find them in your Photos app.</Txt>
            <Button label="Done" variant="primary" onPress={close} />
          </>
        ) : null}
        {phase.k === 'error' ? (
          <>
            <Txt color={c.bad}>{phase.msg}</Txt>
            {phase.settings ? <Button label="Open Settings" onPress={() => Linking.openSettings()} /> : null}
            <Button label="Close" onPress={close} />
          </>
        ) : null}
      </View>
    </Sheet>
  )
}
