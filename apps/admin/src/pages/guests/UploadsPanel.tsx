import { Check, ImageIcon, Settings2, Trash2, X } from 'lucide-react'
import { fmt, type Photo, type PhotoEvent } from '@frameline/shared'
import { Button, Card, EmptyState, PhotoTile, Skeleton, Tip, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'

const plural = (n: number, one: string, many = `${one}s`) => `${fmt.count(n)} ${n === 1 ? one : many}`

/**
 * Guests → Uploads. With review on: photos waiting for approval, per-photo ✓/✕ and Approve all / Reject all,
 * each with Undo. With review off (and nothing waiting): recent guest uploads with Remove.
 * Rejecting marks the photos 'rejected' (never shown to guests); Undo sends them back to review.
 */
export function UploadsPanel({ event, photos, loading, query, onOpenSettings }: {
  event: PhotoEvent; photos: Photo[]; loading: boolean; query: string; onOpenSettings: () => void
}) {
  const api = useApi()
  const toast = useToast()
  const s = event.settings
  const q = query.trim().toLowerCase()
  const match = (p: Photo) => !q || p.uploadedBy.toLowerCase().includes(q) || p.filename.toLowerCase().includes(q)
  const pending = photos.filter((p) => p.reviewStatus === 'pending' && !p.hidden)
  const reviewing = pending.length > 0 || s.reviewGuestUploads
  const recent = photos.filter((p) => !p.hidden && p.reviewStatus !== 'pending' && p.reviewStatus !== 'rejected').sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 60)
  const list = (reviewing ? pending : recent).filter(match)

  const fail = (what: string) => (e: unknown) => toast.error(`Couldn’t ${what}`, errorMessage(e))
  const approve = (ps: Photo[]) => {
    const ids = ps.map((p) => p.id)
    api.setPhotoReview(ids, 'approved').then(() => {
      toast.undo(ps.length === 1 ? 'Photo approved. Everyone can see it now.' : `${ps.length} photos approved. Everyone can see them now.`,
        () => void api.setPhotoReview(ids, 'pending').catch(fail('undo that')))
    }).catch(fail('approve'))
  }
  const reject = (ps: Photo[]) => {
    const ids = ps.map((p) => p.id)
    api.setPhotoReview(ids, 'rejected').then(() => {
      toast.undo(ps.length === 1 ? 'Photo rejected. Guests won’t see it.' : `${ps.length} photos rejected. Guests won’t see them.`,
        () => void api.setPhotoReview(ids, 'pending').catch(fail('undo that')))
    }).catch(fail('reject'))
  }
  const remove = (p: Photo) => {
    api.updatePhotos([p.id], { hidden: true }).then(() => {
      toast.undo('Photo removed from the gallery', () => void api.updatePhotos([p.id], { hidden: false }).catch(fail('undo that')))
    }).catch(fail('remove the photo'))
  }

  if (loading) return <Card><Skeleton className="mb-3 h-5 w-64" /><div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[3/2]" />)}</div></Card>

  if (!list.length) {
    if (q) return <Card><EmptyState title={`No uploads match “${query.trim()}”`} body="Search looks at who uploaded and the file name." /></Card>
    if (!s.guestUploads && !photos.length) {
      return <Card><EmptyState icon={<ImageIcon size={22} />} title="Guest uploads are off" body="Turn them on and guests can add their own photos from the party. You check them here first." action={<Button icon={<Settings2 size={14} />} onClick={onOpenSettings}>Turn on in Settings</Button>} /></Card>
    }
    return (
      <Card>
        <EmptyState icon={<Check size={22} />} title={reviewing ? 'Nothing to review' : 'No guest photos yet'}
          body={reviewing ? 'You’ve checked every photo guests added. New ones wait here until you approve them.' : `Guests can add up to ${fmt.count(s.guestUploadLimit)} photos from the gallery. They show up here.`} />
      </Card>
    )
  }

  const uploaders = new Set(list.map((p) => p.uploadedBy)).size
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="text-[14px]">
          {reviewing
            ? <><b className="tnum">{plural(list.length, 'photo')} from {plural(uploaders, 'guest')}</b> <span className="text-ink-2">· shown to everyone once you approve</span></>
            : <><b className="tnum">{plural(list.length, 'recent photo')}</b> <span className="text-ink-2">· review is off, so these are already in the gallery</span></>}
        </div>
        {reviewing && (
          <div className="flex gap-2 max-sm:w-full">
            <Button size="sm" variant="ghost" className="max-sm:h-11 max-sm:flex-1" onClick={() => reject(list)}>Reject all</Button>
            <Button size="sm" variant="primary" className="max-sm:h-11 max-sm:flex-1" onClick={() => approve(list)}>Approve all {fmt.count(list.length)}</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((p) => (
          <div key={p.id} className="min-w-0">
            <PhotoTile tone={p.tone} url={p.url} alt={`${p.filename}, from ${p.uploadedBy}`} />
            <div className="mt-1 flex items-center justify-between gap-1 text-[12px]">
              <span className="truncate text-ink-3" title={p.filename}>{p.uploadedBy}</span>
              {reviewing ? (
                <span className="flex shrink-0 gap-1">
                  <Tip label="Reject"><button type="button" aria-label={`Reject ${p.filename}`} onClick={() => reject([p])} className="grid size-9 place-items-center rounded-control text-bad hover:bg-bad-soft sm:size-7"><X size={14} /></button></Tip>
                  <Tip label="Approve"><button type="button" aria-label={`Approve ${p.filename}`} onClick={() => approve([p])} className="grid size-9 place-items-center rounded-control text-ok hover:bg-ok-soft sm:size-7"><Check size={14} /></button></Tip>
                </span>
              ) : (
                <button type="button" onClick={() => remove(p)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-control px-1.5 font-bold text-ink-2 hover:bg-sunk hover:text-bad sm:min-h-7"><Trash2 size={12} />Remove</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
