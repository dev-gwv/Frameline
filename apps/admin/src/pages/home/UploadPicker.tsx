import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Button, CoverMosaic, EmptyState, Modal } from '@frameline/ui'

/** Small chooser: which event are these photos for? Then opens that event's upload dialog. */
export function UploadPicker({ open, onOpenChange, events }: { open: boolean; onOpenChange: (v: boolean) => void; events: PhotoEvent[] }) {
  const navigate = useNavigate()
  const list = events.filter((e) => e.status !== 'archived')
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Upload photos" description="Choose the event these photos belong to." width={460}>
      {list.length === 0 ? (
        <EmptyState title="Create an event first" body="Photos always go into an event, so guests get one link."
          action={<Button variant="primary" onClick={() => { onOpenChange(false); navigate('/events?new=1') }}>New event</Button>} />
      ) : (
        <ul className="flex flex-col p-2">
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { onOpenChange(false); navigate(`/events/${e.id}?modal=upload`) }}
                className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-sunk">
                <CoverMosaic tones={e.coverTones} className="h-8 w-12 shrink-0 overflow-hidden rounded" empty={e.photoCount === 0 ? ' ' : undefined} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">{e.name}</b>
                  <span className="text-[11.5px] text-ink-3">{fmt.date(e.date)} · {fmt.count(e.photoCount)} / {fmt.count(e.photoLimit)} photos</span>
                </span>
                <ChevronRight size={16} className="text-ink-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
