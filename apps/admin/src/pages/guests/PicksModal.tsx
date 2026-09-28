import { useNavigate } from 'react-router-dom'
import { Copy, Download } from 'lucide-react'
import { DEMO_NOW, fmt, type Guest, type PhotoEvent } from '@frameline/shared'
import { Button, EmptyState, Modal, PhotoTile, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useStudio } from '../../lib/queries'
import { firstName, usePhotosByIds } from './data'

const SHOWN = 18
const roleWord = (r: Guest['role']) => (r === 'client' ? 'Client' : r === 'host' ? 'Host' : 'Guest')

/** Client proofing in one dialog: see the picks, copy file names, download a ZIP, or turn them into an album. */
export function PicksModal({ event, guest, onClose }: { event: PhotoEvent; guest: Guest | null; onClose: () => void }) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const studioEmail = useStudio().data?.email ?? ''
  const ids = guest?.favourites ?? []
  const { photos, loading } = usePhotosByIds(ids, !!guest)
  const total = ids.length

  const copyNames = async () => {
    const names = photos.map((p) => p.filename).join('\n')
    try {
      await navigator.clipboard.writeText(names)
      toast.success(`${fmt.count(photos.length)} file names copied`, 'Paste them into Lightroom’s filter to find these photos.')
    } catch {
      toast.error('Couldn’t copy', 'Your browser blocked the clipboard. Try again, or use Export CSV.')
    }
  }
  const zip = useAction(() => api.requestZip(event.id, studioEmail, { photoIds: ids }), {
    success: (z) => `Making a ZIP of ${fmt.count(z.photoCount)} photos. We’ll email the link to ${z.email}.`,
    error: 'Couldn’t start the ZIP',
  })
  const makeAlbum = useAction(async () => {
    const album = await api.createAlbum(event.id, `${firstName(guest!.name)}’s picks`)
    const copies = await api.copyPhotosToAlbum(ids, album.id)
    return { album, copied: copies.length }
  }, {
    error: 'Couldn’t make the album',
    onSuccess: ({ album, copied }) => {
      onClose()
      toast.toast({
        title: `Album “${album.name}” made with ${fmt.count(copied)} photos`,
        action: { label: 'Open album', onClick: () => navigate(`/events/${event.id}?album=${album.id}`) },
      })
    },
  })

  return (
    <Modal
      open={!!guest} onOpenChange={(v) => !v && onClose()} width={760}
      title={guest ? `${guest.name}’s picks` : 'Picks'}
      description={guest ? `${fmt.count(total)} photos · ${roleWord(guest.role)} · last picked ${fmt.ago(guest.lastActive, DEMO_NOW)}` : undefined}
      footer={total > 0 && (
        <>
          <Button variant="ghost" icon={<Copy size={14} />} className="sm:mr-auto" disabled={loading && photos.length === 0} onClick={() => void copyNames()}>Copy file names</Button>
          <Button icon={<Download size={15} />} loading={zip.isPending} onClick={() => zip.mutate(undefined)}>Download ZIP</Button>
          <Button variant="primary" loading={makeAlbum.isPending} onClick={() => makeAlbum.mutate(undefined)}>Make an album from these</Button>
        </>
      )}
    >
      {total === 0 ? (
        <EmptyState className="py-8" title="No picks yet" body="When they heart photos in the gallery, you’ll see them here." />
      ) : loading && photos.length === 0 ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {photos.slice(0, SHOWN).map((p) => <PhotoTile key={p.id} tone={p.tone} url={p.url} alt={p.filename} />)}
          </div>
          <div className="text-[12.5px] text-ink-3 tnum">
            {photos.length < total ? `Showing ${Math.min(SHOWN, photos.length)} of ${fmt.count(total)} · ${fmt.count(total - photos.length)} were deleted or moved out of the event` : total > SHOWN ? `Showing ${SHOWN} of ${fmt.count(total)}` : `All ${fmt.count(total)} photos`}
          </div>
        </>
      )}
    </Modal>
  )
}
