import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, cn, Field, Input, Modal, RadioCardGroup, Select } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useAlbums, useEvents } from '../../lib/queries'
import { MAX_CAMERAS, MODE_HELP, MODE_LABEL } from './utils'

const MODES: Camera['mode'][] = ['live-2k', 'review-first', 'originals']

/** Add a camera (name, event, album; mode folded under "More options"), or edit one when `camera` is given. */
export function AddCameraModal({ open, onOpenChange, onCreated, full, camera }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated?: (c: Camera) => void; full?: boolean; camera?: Camera | null
}) {
  const api = useApi()
  const events = useEvents().data?.filter((e) => e.status !== 'archived' || e.id === camera?.eventId) ?? []
  const [label, setLabel] = useState('')
  const [eventId, setEventId] = useState('')
  const [albumId, setAlbumId] = useState('')
  const [mode, setMode] = useState<Camera['mode']>('live-2k')
  const [more, setMore] = useState(false)
  const [touched, setTouched] = useState(false)
  const albumsQ = useAlbums(eventId || undefined)
  const albums = (albumsQ.data ?? []).filter((a) => a.kind === 'album')

  useEffect(() => {
    if (!open) return
    setTouched(false); setMore(false)
    setLabel(camera?.label ?? ''); setMode(camera?.mode ?? 'live-2k'); setEventId(camera?.eventId ?? ''); setAlbumId(camera?.albumId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camera?.id])
  useEffect(() => { if (open && !eventId && events[0]) setEventId(events[0].id) }, [open, events, eventId])
  useEffect(() => { if (albums.length && !albums.some((a) => a.id === albumId)) setAlbumId(albums[0].id) }, [albums, albumId])

  const create = useAction((v: Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>) => api.createCamera(v), {
    onSuccess: (c) => { onOpenChange(false); onCreated?.(c) },
  })
  const update = useAction((v: Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>) => api.updateCamera(camera!.id, v), {
    success: 'Camera saved',
    onSuccess: () => onOpenChange(false),
  })

  const labelError = touched && !label.trim() ? 'Give the camera a name, e.g. “Canon R6 · Aarav”.' : undefined
  const albumError = touched && eventId && albumsQ.isSuccess && !albums.length ? 'This event has no albums yet. Add one in the event first.' : undefined
  const submit = () => {
    setTouched(true)
    if (!label.trim() || !eventId || !albumId) return
    const v = { label: label.trim(), eventId, albumId, mode }
    if (camera) update.mutate(v)
    else create.mutate(v)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={camera ? `Edit ${camera.label}` : 'Add a camera'} width={520}
      description={camera ? 'The login stays the same; new photos go to the album you pick.' : 'Each camera gets its own login and sends photos to one album.'}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={create.isPending || update.isPending} disabled={!camera && full}>{camera ? 'Save changes' : 'Add camera'}</Button>
      </>}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {!camera && full && <div className="rounded-control bg-warn-soft px-3 py-2 text-[13px] font-bold text-warn">You have {MAX_CAMERAS} cameras, the most a studio can connect. Remove one to add another.</div>}
        <Field label="Camera name" htmlFor="cam-label" hint="So you can tell your cameras apart." error={labelError}>
          <Input id="cam-label" autoFocus={!camera} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Canon R6 · Aarav" maxLength={40} />
        </Field>
        <Field label="Event" htmlFor="cam-event">
          <Select id="cam-event" value={eventId} onChange={(e) => { setEventId(e.target.value); setAlbumId('') }}>
            {!events.length && <option value="">No events yet</option>}
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Album" htmlFor="cam-album" error={albumError}>
          <Select id="cam-album" value={albumId} onChange={(e) => setAlbumId(e.target.value)} disabled={!albums.length}>
            {!albums.length && <option value="">{albumsQ.isLoading ? 'Loading albums…' : 'No albums'}</option>}
            {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}
          className="flex items-center gap-1 self-start rounded-control py-1 text-[13px] font-bold text-accent-text hover:underline">
          More options: {MODE_LABEL[mode]}
          <ChevronDown size={14} className={cn('transition-transform', more && 'rotate-180')} />
        </button>
        {more && (
          <RadioCardGroup label="What happens to each photo" value={mode} onChange={setMode}
            options={MODES.map((m) => ({ value: m, title: MODE_LABEL[m], description: MODE_HELP[m] }))} />
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
