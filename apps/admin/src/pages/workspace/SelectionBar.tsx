import { useState } from 'react'
import { Download, Eye, EyeOff, FolderInput, ImageIcon, Trash2, X } from 'lucide-react'
import { fmt, type Album, type ID } from '@frameline/shared'
import { ConfirmDialog, Menu, Tip, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { rememberCover } from './lib'

interface Props {
  eventId: ID
  ids: string[]
  total: number
  allHidden: boolean
  albums: Album[]
  currentAlbumId?: ID
  onSelectAll: () => void
  selectingAll: boolean
  onClear: () => void
}

const barBtn = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] border border-side-line px-2.5 text-[12px] font-bold text-side-ink hover:bg-side-2 disabled:opacity-40'

export function SelectionBar({ eventId, ids, total, allHidden, albums, currentAlbumId, onSelectAll, selectingAll, onClear }: Props) {
  const api = useApi()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const n = ids.length
  const plural = (k: number) => `${fmt.count(k)} photo${k === 1 ? '' : 's'}`

  const move = useAction((a: Album) => api.updatePhotos(ids, { albumId: a.id }), { success: (_d, a) => `Moved ${plural(n)} to ${a.name}`, onSuccess: onClear })
  const hide = useAction((hidden: boolean) => api.updatePhotos(ids, { hidden }), { success: (_d, h) => (h ? `${plural(n)} hidden from guests` : `${plural(n)} visible to guests again`), onSuccess: onClear })
  const cover = useAction(() => api.setCover(eventId, ids[0], 'event'), { success: 'Event cover updated', onSuccess: () => { rememberCover(eventId, ids[0], 'event'); onClear() } })
  const remove = useAction(() => api.deletePhotos(ids), { success: `${plural(n)} deleted`, onSuccess: onClear })

  const targets = albums.filter((a) => a.kind === 'album' && a.id !== currentAlbumId)
  return (
    <>
      <div role="toolbar" aria-label="Selected photos"
        className="fixed bottom-4 left-1/2 z-30 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-card bg-side px-2.5 py-2 text-side-ink shadow-float scrollbar-thin md:bottom-5">
        <b className="shrink-0 px-2 text-[13px] text-side-gold">{fmt.count(n)} selected</b>
        {n < total && (
          <button type="button" className="shrink-0 pr-1.5 text-[11.5px] font-semibold text-side-ink-2 hover:text-side-ink" onClick={onSelectAll} disabled={selectingAll}>
            {selectingAll ? 'Selecting…' : `Select all ${fmt.count(total)}`}
          </button>
        )}
        <Menu align="center" trigger={<button type="button" className={barBtn}><FolderInput size={12} />Move to…</button>}
          items={targets.length ? targets.map((a) => ({ label: a.name, hint: fmt.count(a.photoCount), onSelect: () => move.mutate(a) })) : [{ label: 'Create another album first', disabled: true }]} />
        <button type="button" className={barBtn} onClick={() => hide.mutate(!allHidden)}>
          {allHidden ? <><Eye size={12} />Unhide</> : <><EyeOff size={12} />Hide</>}
        </button>
        <Tip label={n === 1 ? 'Use this photo on the gallery cover' : 'Select one photo to use as the cover'}>
          <span className="inline-flex"><button type="button" className={barBtn} disabled={n !== 1} onClick={() => cover.mutate(undefined)}><ImageIcon size={12} />Set as cover</button></span>
        </Tip>
        <button type="button" className={barBtn} onClick={() => { toast.toast({ kind: 'info', title: `Preparing a ZIP of ${plural(n)} — we’ll notify you`, body: 'You’ll get a download link here and by email when it’s ready.' }); onClear() }}>
          <Download size={12} />Download
        </button>
        <button type="button" className={`${barBtn} text-bad`} onClick={() => setConfirmDelete(true)}><Trash2 size={12} />Delete</button>
        <Tip label="Clear selection (Esc)">
          <button type="button" aria-label="Clear selection" className="grid size-7 shrink-0 place-items-center rounded-[7px] text-side-ink-2 hover:bg-side-2 hover:text-side-ink" onClick={onClear}><X size={14} /></button>
        </Tip>
      </div>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} danger title={`Delete ${plural(n)}?`}
        body={<>They disappear from the gallery and guests’ favourites straight away. Your plan’s photo count goes down accordingly. This can’t be undone.</>}
        confirmLabel={`Delete ${plural(n)}`} onConfirm={() => remove.mutate(undefined)} />
    </>
  )
}
