import { Camera as CameraIcon, History, KeyRound, LogIn, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { fmt, type Camera, type PhotoEvent } from '@frameline/shared'
import { Card, Chip, IconTile, Menu } from '@frameline/ui'
import { useAlbums, useCameraUploads } from '../../lib/queries'
import { agoShort, MAX_CAMERAS } from './utils'

/** While a camera is receiving, its upload list refreshes this often. */
export const LIVE_MS = 5_000

export function useAlbumName(eventId?: string, albumId?: string) {
  return useAlbums(eventId).data?.find((a) => a.id === albumId)?.name
}

/**
 * Live dot + "last photo 12 s ago" for a camera that is sending, "Last photo 2 days ago" otherwise.
 * Uses the camera's `lastUploadAt` (and its newest upload while receiving, polled every few seconds).
 */
const QUIET_MS = 15 * 60_000

function CameraStatus({ cam, now }: { cam: Camera; now: number }) {
  const uploads = useCameraUploads(cam.id, cam.status === 'receiving' ? LIVE_MS : false)
  const latest = uploads.data?.[0]
  const lastAt = Math.max(cam.lastUploadAt ? Date.parse(cam.lastUploadAt) : 0, latest ? Date.parse(latest.at) : 0)
  // Live only while photos keep arriving; a connected camera that has been quiet for a while shows its last photo instead.
  if (cam.status === 'receiving' && lastAt && now - lastAt < QUIET_MS) {
    const last = Math.min(now, lastAt)
    return (
      <Chip tone="ok" dot={false} icon={
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      }>Live · last photo {agoShort(now - last)}</Chip>
    )
  }
  if (cam.status === 'receiving' && !lastAt) return <span className="text-[12.5px] text-ink-3">Connected · waiting for the first photo</span>
  if (lastAt) return <span className="text-[12.5px] text-ink-3">Last photo {fmt.ago(new Date(lastAt).toISOString())}</span>
  if (cam.lastFile) return <span className="text-[12.5px] text-ink-3">Not sending now</span>
  return <span className="text-[12.5px] text-ink-3">{cam.status === 'offline' ? 'Not connected yet' : 'Waiting for the first photo'}</span>
}

function CameraRow({ cam, eventName, now, actions }: {
  cam: Camera; eventName: string; now: number
  actions: { edit: () => void; login: () => void; reset: () => void; history: () => void; remove: () => void }
}) {
  const album = useAlbumName(cam.eventId, cam.albumId)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-3 first:border-t-0 sm:flex-nowrap sm:px-[18px]">
      <IconTile tone="neutral"><CameraIcon size={15} /></IconTile>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
        <b className="block truncate text-[14px] sm:w-[220px] sm:shrink-0">{cam.label}</b>
        <span className="block truncate text-[13px] text-ink-2 sm:flex-1">{eventName} → {album ?? '…'}</span>
      </div>
      <div className="order-last w-full pl-11 sm:order-none sm:w-auto sm:pl-0"><CameraStatus cam={cam} now={now} /></div>
      <Menu
        trigger={<button type="button" aria-label={`More for ${cam.label}`} className="grid size-9 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink max-sm:size-11"><MoreHorizontal size={16} /></button>}
        width={260}
        items={[
          { label: 'Edit', description: 'Name, event and album', icon: <Pencil size={15} />, onSelect: actions.edit },
          { label: 'Login details', description: 'Server, port and user', icon: <LogIn size={15} />, onSelect: actions.login },
          { label: 'New password', description: 'The camera disconnects until you enter it', icon: <KeyRound size={15} />, onSelect: actions.reset },
          { label: 'Upload history', description: 'Every file this camera sent', icon: <History size={15} />, onSelect: actions.history },
          'separator',
          { label: 'Remove camera', icon: <Trash2 size={15} />, danger: true, onSelect: actions.remove },
        ]}
      />
    </div>
  )
}

export function CamerasTable({ cameras, events, now, onEdit, onLogin, onReset, onHistory, onRemove }: {
  cameras: Camera[]
  events: PhotoEvent[]
  now: number
  onEdit: (c: Camera) => void
  onLogin: (c: Camera) => void
  onReset: (c: Camera) => void
  onHistory: (c: Camera) => void
  onRemove: (c: Camera) => void
}) {
  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? 'Deleted event'
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-[18px]">
        <h3 className="font-sans text-[15px] font-extrabold">Your cameras</h3>
        <span className="text-[12.5px] text-ink-3 tnum">{cameras.length} of {MAX_CAMERAS}</span>
      </div>
      {cameras.map((c) => (
        <CameraRow key={c.id} cam={c} eventName={eventName(c.eventId)} now={now}
          actions={{ edit: () => onEdit(c), login: () => onLogin(c), reset: () => onReset(c), history: () => onHistory(c), remove: () => onRemove(c) }} />
      ))}
    </Card>
  )
}
