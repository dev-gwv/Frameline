import { Check, Download, Eye, EyeOff, Heart, ImageIcon, UserCheck, UserPlus, X } from 'lucide-react'
import { DEMO_NOW, fmt, type AccessRequest, type Guest, type Photo } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, PhotoTile, Skeleton, useToast } from '@frameline/ui'
import { usePhotosByIds, roleLabel } from './data'

const th = 'px-3 py-2 text-left text-[11.5px] font-semibold text-ink-3 first:pl-4 last:pr-4'
const td = 'px-3 py-2.5 first:pl-4 last:pr-4'

function PicksPreview({ ids }: { ids: string[] }) {
  const { photos } = usePhotosByIds(ids.slice(-4))
  return (
    <div className="flex gap-[3px]">
      {photos.map((p) => <PhotoTile key={p.id} tone={p.tone} url={p.url} className="w-[34px]" aspect="34 / 24" rounded="rounded-[3px]" />)}
    </div>
  )
}

export function FavouritesTab({ guests, onView }: { guests: Guest[]; onView: (g: Guest) => void }) {
  const toast = useToast()
  const rows = guests.filter((g) => g.favourites.length > 0).sort((a, b) => b.favourites.length - a.favourites.length)
  if (!rows.length) return <Card><EmptyState icon={<Heart size={22} />} title="No favourites yet" body="When guests star photos in the gallery, you’ll see who picked what here." /></Card>
  return (
    <Card padded={false} className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead><tr><th className={th}>Guest</th><th className={th}>Picked</th><th className={`${th} text-right`}>Photos</th><th className={th}>Last active</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-t border-line">
              <td className={td}><b className="font-bold">{g.name}</b><div className="text-[11px] text-ink-3">{roleLabel(g.role)}</div></td>
              <td className={td}><PicksPreview ids={g.favourites} /></td>
              <td className={`${td} text-right font-mono tnum`}>{g.favourites.length}</td>
              <td className={`${td} text-ink-3`}>{fmt.ago(g.lastActive, DEMO_NOW)}</td>
              <td className={`${td} text-right`}>
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" onClick={() => onView(g)}>View picks</Button>
                  <Button size="sm" icon={<Download size={12} />}
                    onClick={() => toast.toast({ kind: 'info', title: `Preparing a ZIP of ${g.favourites.length} photos`, body: `We’ll email you the download link for ${g.name}’s picks in a few minutes.` })}>ZIP</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function RegisteredTab({ guests }: { guests: Guest[] }) {
  if (!guests.length) return <Card><EmptyState icon={<UserPlus size={22} />} title="Nobody has registered yet" body="Turn on “Ask for name, email and mobile first” in Event settings → Access to collect guest details." /></Card>
  return (
    <Card padded={false} className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Mobile</th><th className={th}>Registered</th><th className={th}>Last active</th></tr></thead>
        <tbody>
          {guests.map((g) => (
            <tr key={g.id} className="border-t border-line">
              <td className={td}><b className="font-bold">{g.name}</b><div className="text-[11px] text-ink-3">{roleLabel(g.role)}</div></td>
              <td className={`${td} font-mono text-[12px]`}><a href={`mailto:${g.email}`} className="hover:underline">{g.email}</a></td>
              <td className={`${td} font-mono text-[12px]`}>{g.phone}</td>
              <td className={`${td} text-ink-2`}>{fmt.date(g.registeredAt)}</td>
              <td className={`${td} text-ink-3`}>{fmt.ago(g.lastActive, DEMO_NOW)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function RequestsTab({ requests, onResolve, busyId }: { requests: AccessRequest[]; onResolve: (r: AccessRequest, approve: boolean) => void; busyId?: string }) {
  if (!requests.length) return <Card><EmptyState icon={<UserCheck size={22} />} title="No access requests" body="When someone asks to co-manage this gallery (a second shooter, a family member), you approve or decline it here." /></Card>
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {requests.map((r) => (
        <Card key={r.id} className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <b className="text-[14px]">{r.name}</b>
            <span className="text-[11.5px] text-ink-3">{fmt.ago(r.createdAt, DEMO_NOW)}</span>
          </div>
          <div className="font-mono text-[11.5px] text-ink-3">{r.email}</div>
          <p className="my-1 text-[13px] text-ink-2">{r.note}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Check size={12} />} loading={busyId === r.id} onClick={() => onResolve(r, true)}>Approve</Button>
            <Button size="sm" icon={<X size={12} />} disabled={busyId === r.id} onClick={() => onResolve(r, false)}>Decline</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

export type ReviewState = 'pending' | 'published' | 'hidden'
export function UploadsTab({ photos, loading, stateOf, onDecide, onApproveAll }: {
  photos: Photo[]; loading: boolean; stateOf: (p: Photo) => ReviewState
  onDecide: (p: Photo, publish: boolean) => void; onApproveAll: () => void
}) {
  if (loading) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-44 rounded-card" />)}</div>
  if (!photos.length) return <Card><EmptyState icon={<ImageIcon size={22} />} title="No guest uploads" body="Guests can add their own photos when Guest uploads is on in Event settings. They show up here for review." /></Card>
  const pending = photos.filter((p) => stateOf(p) === 'pending').length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
        <span>{pending ? `${pending} waiting for your review. Approved photos appear in the gallery.` : 'All caught up. Every guest upload has been reviewed.'}</span>
        {pending > 0 && <Button size="sm" icon={<Check size={12} />} onClick={onApproveAll}>Approve all {pending}</Button>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => {
          const s = stateOf(p)
          return (
            <Card key={p.id} padded={false} className="overflow-hidden">
              <PhotoTile tone={p.tone} url={p.url} hidden={s === 'hidden'} rounded="rounded-none" alt={p.filename} />
              <div className="flex flex-col gap-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-ink-3">{p.filename}</span>
                  {s === 'pending' ? <Chip tone="warn">To review</Chip> : s === 'published' ? <Chip tone="ok">Published</Chip> : <Chip>Hidden</Chip>}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1 justify-center" icon={<Eye size={12} />} disabled={s === 'published'} onClick={() => onDecide(p, true)}>Approve</Button>
                  <Button size="sm" className="flex-1 justify-center" icon={<EyeOff size={12} />} disabled={s === 'hidden'} onClick={() => onDecide(p, false)}>Hide</Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
