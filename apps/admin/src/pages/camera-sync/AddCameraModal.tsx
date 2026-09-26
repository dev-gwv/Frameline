import { useEffect, useState } from 'react'
import { CheckCircle2, Copy } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, Field, Input, Modal, Select, cn, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useAlbums, useEvents } from '../../lib/queries'
import { CredentialFields } from './Credentials'
import { copyText, credentialsText, MODE_HELP, MODE_LABEL } from './utils'

const MODES: Camera['mode'][] = ['live-2k', 'review-first', 'originals']

/** Adds a camera, or edits one when `camera` is given (name, destination and mode). */
export function AddCameraModal({ open, onOpenChange, onCreated, full, camera }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated?: (c: Camera) => void; full?: boolean; camera?: Camera | null
}) {
  const api = useApi()
  const toast = useToast()
  const events = useEvents().data?.filter((e) => e.status !== 'archived' || e.id === camera?.eventId) ?? []
  const [label, setLabel] = useState('')
  const [eventId, setEventId] = useState('')
  const [albumId, setAlbumId] = useState('')
  const [mode, setMode] = useState<Camera['mode']>('live-2k')
  const [touched, setTouched] = useState(false)
  const [created, setCreated] = useState<Camera | null>(null)
  const albums = (useAlbums(eventId || undefined).data ?? []).filter((a) => a.kind === 'album')

  useEffect(() => {
    if (!open) return
    setTouched(false); setCreated(null)
    setLabel(camera?.label ?? ''); setMode(camera?.mode ?? 'live-2k'); setEventId(camera?.eventId ?? ''); setAlbumId(camera?.albumId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camera?.id])
  useEffect(() => { if (!eventId && events[0]) setEventId(events[0].id) }, [events, eventId])
  useEffect(() => { if (albums.length && !albums.some((a) => a.id === albumId)) setAlbumId(albums[0].id) }, [albums, albumId])

  const create = useAction((v: Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>) => api.createCamera(v), {
    success: 'Camera added',
    onSuccess: (c) => { setCreated(c); onCreated?.(c) },
  })
  const update = useAction((v: Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>) => api.updateCamera(camera!.id, v), {
    success: 'Camera updated',
    onSuccess: () => onOpenChange(false),
  })

  const labelError = touched && !label.trim() ? 'Give the camera a name, e.g. “Canon R6 · Aarav”.' : undefined
  const albumError = touched && eventId && !albums.length ? 'This event has no albums yet. Add one in the event first.' : undefined
  const submit = () => {
    setTouched(true)
    if (!label.trim() || !eventId || !albumId) return
    const v = { label: label.trim(), eventId, albumId, mode }
    if (camera) update.mutate(v)
    else create.mutate(v)
  }

  if (created) {
    return (
      <Modal open={open} onOpenChange={onOpenChange} title="Camera added" width={520}
        description="Enter these on the camera now. The password is shown only once — copy it before you close this."
        footer={<>
          <Button icon={<Copy size={14} />} onClick={async () => { if (await copyText(credentialsText(created, created.password))) toast.success('All details copied'); else toast.error('Couldn’t copy', 'Copy each field with its copy button instead.') }}>Copy all</Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>
        </>}>
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 rounded-control bg-ok-soft px-3 py-2 text-[12.5px] font-bold text-ok">
            <CheckCircle2 size={15} /> {created.label} is ready. It shows “Receiving” once the camera connects.
          </div>
          <CredentialFields cam={created} password={created.password} />
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={camera ? `Edit ${camera.label}` : 'Add a camera'} width={520}
      description={camera ? 'The FTP login stays the same; new photos go to the album you pick.' : 'Each camera gets its own login and sends to one album.'}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={create.isPending || update.isPending} disabled={!camera && full}>{camera ? 'Save changes' : 'Add camera'}</Button>
      </>}>
      <form className="flex flex-col gap-3.5 px-5 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {!camera && full && <div className="rounded-control bg-warn-soft px-3 py-2 text-[12.5px] font-bold text-warn">You have 10 cameras, the most a studio can connect. Remove one to add another.</div>}
        <Field label="Camera name" htmlFor="cam-label" hint="Shown in upload history and on photos’ info." error={labelError}>
          <Input id="cam-label" autoFocus={!camera} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Canon R6 · Aarav" maxLength={40} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sends to event" htmlFor="cam-event">
            <Select id="cam-event" value={eventId} onChange={(e) => { setEventId(e.target.value); setAlbumId('') }}>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Album" htmlFor="cam-album" error={albumError}>
            <Select id="cam-album" value={albumId} onChange={(e) => setAlbumId(e.target.value)} disabled={!albums.length}>
              {!albums.length && <option value="">No albums</option>}
              {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-ink-2">What happens to each photo?</span>
          <div role="radiogroup" className="grid gap-2">
            {MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={cn('rounded-control border px-3 py-2 text-left transition', mode === m ? 'border-accent bg-accent-soft' : 'border-line-2 hover:bg-sunk')}>
                <div className="text-[13px] font-bold">{MODE_LABEL[m]}</div>
                <div className="text-[12px] text-ink-2">{MODE_HELP[m]}</div>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
