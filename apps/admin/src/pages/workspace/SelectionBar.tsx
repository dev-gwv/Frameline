import { useState } from 'react'
import { Download, Eye, EyeOff, FolderInput, ImageIcon, Mail, Plus, Trash2 } from 'lucide-react'
import { fmt, type Album, type FramelineApi, type ID, type Photo, type PhotoEvent } from '@frameline/shared'
import { Button, Field, Input, Menu, Modal, SelectionBar, Tip, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useStudio, useWatermark } from '../../lib/queries'
import { downloadPhoto } from '../viewer/download'
import { downloadBlob, liveUrl, photosLabel } from './lib'
import { trashWithUndo } from './pending'

const ZIP_OVER = 50

interface Props {
  event: PhotoEvent
  ids: ID[]
  total: number
  /** Photos loaded in the grid (for undo and downloads). */
  known: Map<ID, Photo>
  albums: Album[]
  currentAlbumId?: ID
  onSelectAll: () => void
  selectingAll: boolean
  onClear: () => void
}

/** Where each photo is now, so Move can be undone. Photos that aren't loaded are looked up once. */
async function albumOf(api: FramelineApi, eventId: ID, ids: ID[], known: Map<ID, Photo>, currentAlbumId?: ID) {
  const map = new Map<ID, ID>()
  const missing: ID[] = []
  ids.forEach((id) => { const p = known.get(id); if (p) map.set(id, p.albumId); else if (currentAlbumId) map.set(id, currentAlbumId); else missing.push(id) })
  if (missing.length) {
    const all = await api.listPhotos(eventId, {})
    const want = new Set(missing)
    all.items.forEach((p) => { if (want.has(p.id)) map.set(p.id, p.albumId) })
  }
  return map
}

/** Move a set of photos with an Undo toast. Shared by the selection bar and the viewer. */
export function useMovePhotos(eventId: ID) {
  const api = useApi()
  const toast = useToast()
  return async (ids: ID[], to: Album, known: Map<ID, Photo>, currentAlbumId?: ID) => {
    try {
      const from = await albumOf(api, eventId, ids, known, currentAlbumId)
      await api.updatePhotos(ids, { albumId: to.id })
      toast.undo(`${photosLabel(ids.length)} moved to ${to.name}`, () => {
        const groups = new Map<ID, ID[]>()
        from.forEach((albumId, id) => { if (albumId !== to.id) groups.set(albumId, [...(groups.get(albumId) ?? []), id]) })
        Promise.all([...groups].map(([albumId, list]) => api.updatePhotos(list, { albumId })))
          .catch((e) => toast.error('Couldn’t undo the move', errorMessage(e)))
      })
      return true
    } catch (e) {
      toast.error('Couldn’t move the photos', errorMessage(e))
      return false
    }
  }
}

/** The white bar shown while photos are selected: N selected · Select all · Move · Hide · Download · Trash · ×. */
export function PhotoSelectionBar({ event, ids, total, known, albums, currentAlbumId, onSelectAll, selectingAll, onClear }: Props) {
  const api = useApi()
  const toast = useToast()
  const studio = useStudio().data
  const wm = useWatermark().data
  const move = useMovePhotos(event.id)
  const [newAlbum, setNewAlbum] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const n = ids.length
  const targets = albums.filter((a) => a.id !== currentAlbumId)
  const allHidden = ids.every((id) => known.get(id)?.hidden)
  const zip = n > ZIP_OVER

  const doMove = async (a: Album) => { if (await move(ids, a, known, currentAlbumId)) onClear() }

  const hide = async () => {
    const hidden = !allHidden
    const changed = ids.filter((id) => (known.get(id)?.hidden ?? !hidden) !== hidden)
    try {
      await api.updatePhotos(ids, { hidden })
      onClear()
      toast.undo(hidden ? `${photosLabel(n)} hidden from guests` : `${photosLabel(n)} visible to guests again`, () => {
        api.updatePhotos(changed.length ? changed : ids, { hidden: !hidden }).catch((e) => toast.error('Couldn’t undo', errorMessage(e)))
      })
    } catch (e) { toast.error('Couldn’t change who sees these photos', errorMessage(e)) }
  }

  const trash = () => {
    if (event.coverPhotoId && ids.includes(event.coverPhotoId)) {
      toast.error('One of these is the event cover', 'Set another photo as the cover first (open it, then ⋯ → Set as event cover), then trash these.')
      return
    }
    const list = [...ids]
    const undo = trashWithUndo('photos', list, () => api.deletePhotos(list), () => api.restorePhotos(list),
      (e, what) => toast.error(what === 'trash' ? 'Couldn’t trash the photos' : 'Couldn’t bring the photos back', errorMessage(e)))
    onClear()
    toast.undo(`${photosLabel(list.length)} moved to trash`, undo, 'They’re deleted for good after 30 days.')
  }

  const cover = async () => {
    const before = event.coverPhotoId
    try {
      await api.setCover(event.id, ids[0], 'event')
      onClear()
      if (before) toast.undo('Event cover changed', () => { api.setCover(event.id, before, 'event').catch((e) => toast.error('Couldn’t undo', errorMessage(e))) })
      else toast.success('Event cover set')
    } catch (e) { toast.error('Couldn’t set the cover', errorMessage(e)) }
  }

  const download = async () => {
    if (zip) {
      if (!studio?.email) { toast.error('We need your email for the ZIP', 'Add it in Settings → Studio profile.'); return }
      setDownloading(true)
      try {
        const z = await api.requestZip(event.id, studio.email, { photoIds: ids })
        onClear()
        toast.success(`We’ll email you a ZIP of ${photosLabel(z.photoCount)}`, `The link goes to ${z.email} in a few minutes.`)
      } catch (e) { toast.error('Couldn’t prepare the ZIP', errorMessage(e)) } finally { setDownloading(false) }
      return
    }
    setDownloading(true)
    try {
      let saved = 0
      for (const id of ids) {
        const p = known.get(id) ?? (await api.getPhoto(id))
        await downloadPhoto(api, p, 'web', { url: liveUrl(p.url), watermark: event.settings.watermarkOff ? undefined : `© ${wm?.text || studio?.name || 'Studio'}`, save: downloadBlob })
        saved++
      }
      toast.success(`Downloaded ${photosLabel(saved)}`, 'Web size, 2048 px')
    } catch (e) { toast.error('Download stopped', errorMessage(e)) } finally { setDownloading(false) }
  }

  return (
    <>
      <SelectionBar label={`${fmt.count(n)} selected`} onClear={onClear}>
        {n < total && (
          <Button size="sm" variant="ghost" onClick={onSelectAll} loading={selectingAll}>Select all {fmt.count(total)}</Button>
        )}
        <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
        {n === 1 && <Button size="sm" icon={<ImageIcon size={13} />} onClick={() => void cover()}>Set as cover</Button>}
        <Menu align="center" width={230}
          trigger={<Button size="sm" icon={<FolderInput size={13} />}>Move</Button>}
          items={[
            ...(targets.length
              ? targets.map((a) => ({ label: a.name, hint: fmt.count(a.photoCount), onSelect: () => void doMove(a) }))
              : [{ label: 'No other album yet', description: 'Make one to move photos into', disabled: true }]),
            'separator',
            { label: 'New album…', icon: <Plus size={14} />, onSelect: () => setNewAlbum(true) },
          ]} />
        <Button size="sm" icon={allHidden ? <Eye size={13} /> : <EyeOff size={13} />} onClick={() => void hide()}>{allHidden ? 'Unhide' : 'Hide'}</Button>
        <Tip label={zip ? `Over ${ZIP_OVER} photos: we’ll email you a ZIP` : 'Web size, 2048 px'}>
          <Button size="sm" icon={zip ? <Mail size={13} /> : <Download size={13} />} loading={downloading} onClick={() => void download()}>
            {zip ? 'Email me a ZIP' : 'Download'}
          </Button>
        </Tip>
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={trash}>Trash</Button>
      </SelectionBar>
      <NewAlbumModal open={newAlbum} onOpenChange={setNewAlbum} eventId={event.id} count={n}
        onCreated={(a) => void doMove(a)} />
    </>
  )
}

/** "New album…" from a Move menu: name it, then the photos move into it. */
export function NewAlbumModal({ open, onOpenChange, eventId, count, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; eventId: ID; count: number; onCreated: (a: Album) => void }) {
  const api = useApi()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    try { const a = await api.createAlbum(eventId, name.trim()); onOpenChange(false); setName(''); onCreated(a) }
    catch (e) { toast.error('Couldn’t create the album', errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New album" width={420}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>Move {photosLabel(count)}</Button></>}>
      <Field label="Album name" htmlFor="new-album-name">
        <Input id="new-album-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Reception" onKeyDown={(e) => e.key === 'Enter' && void submit()} />
      </Field>
    </Modal>
  )
}
