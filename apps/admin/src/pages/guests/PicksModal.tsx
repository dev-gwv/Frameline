import type { Guest } from '@frameline/shared'
import { EmptyState, Modal, PhotoTile, Skeleton } from '@frameline/ui'
import { usePhotosByIds } from './data'

export function PicksModal({ guest, onClose }: { guest: Guest | null; onClose: () => void }) {
  const { photos, loading } = usePhotosByIds(guest?.favourites ?? [], !!guest)
  return (
    <Modal open={!!guest} onOpenChange={(v) => !v && onClose()} width={860}
      title={guest ? `${guest.name}’s picks` : 'Picks'}
      description={guest ? `${guest.favourites.length} photos favourited` : undefined}>
      <div className="p-4 sm:p-5">
        {loading && photos.length === 0 ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div>
        ) : photos.length === 0 ? (
          <EmptyState title="No picks to show" body="These photos were deleted or moved out of the event." />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {photos.map((p) => <PhotoTile key={p.id} tone={p.tone} url={p.url} label={p.filename} hidden={p.hidden} alt={p.filename} />)}
          </div>
        )}
      </div>
    </Modal>
  )
}
