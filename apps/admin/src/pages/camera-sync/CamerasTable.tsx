import { Camera as CameraIcon } from 'lucide-react'
import type { Camera, PhotoEvent } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { Card, Chip, cn, IconTile } from '@frameline/ui'
import { useAlbums } from '../../lib/queries'
import { agoShort, MAX_CAMERAS, MODE_LABEL } from './utils'

function AlbumName({ eventId, albumId }: { eventId: string; albumId: string }) {
  const album = useAlbums(eventId).data?.find((a) => a.id === albumId)
  return <>{album?.name ?? '…'}</>
}

export function StatusChip({ cam, idleFor }: { cam: Camera; idleFor?: number }) {
  if (cam.status === 'receiving') {
    return (
      <Chip tone="ok">
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        Receiving
      </Chip>
    )
  }
  if (cam.status === 'idle') return <Chip tone="warn" dot>Idle{idleFor !== undefined ? ` ${agoShort(idleFor).replace(' ago', '')}` : ''}</Chip>
  return <Chip dot>Offline</Chip>
}

export function CamerasTable({ cameras, events, selectedId, onSelect, today, idleFor }: {
  cameras: Camera[]
  events: PhotoEvent[]
  selectedId?: string
  onSelect: (id: string) => void
  today: (c: Camera) => number
  idleFor: (c: Camera) => number | undefined
}) {
  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? 'Deleted event'
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h3 className="font-display text-[15px] font-semibold">Cameras</h3>
        <span className="font-mono text-[12px] text-ink-3">{cameras.length} of {MAX_CAMERAS}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11.5px] text-ink-3">
              <th className="px-4 py-2 font-bold">Camera</th>
              <th className="px-3 py-2 font-bold">Sends to</th>
              <th className="px-3 py-2 font-bold">Mode</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-4 py-2 text-right font-bold">Today</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((c) => {
              const sel = c.id === selectedId
              return (
                <tr key={c.id} onClick={() => onSelect(c.id)} aria-selected={sel}
                  className={cn('cursor-pointer border-b border-line last:border-b-0 transition-colors', sel ? 'bg-accent-soft' : 'hover:bg-sunk')}>
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(c.id) }} className="flex items-center gap-2 text-left font-bold">
                      <IconTile><CameraIcon size={14} /></IconTile>{c.label}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{eventName(c.eventId)} / <AlbumName eventId={c.eventId} albumId={c.albumId} /></td>
                  <td className="px-3 py-2.5 text-ink-2">{MODE_LABEL[c.mode]}</td>
                  <td className="px-3 py-2.5"><StatusChip cam={c} idleFor={idleFor(c)} /></td>
                  <td className="px-4 py-2.5 text-right font-mono tnum">{fmt.count(today(c))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
