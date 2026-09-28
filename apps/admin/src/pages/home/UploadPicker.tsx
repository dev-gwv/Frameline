import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, ChevronRight, Plus, Search } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Button, CoverMosaic, EmptyState, EventStatusChip, Input, Modal, Skeleton } from '@frameline/ui'
import { useParamState } from '../../lib/url'
import { daysLeft, matchesQuery, photoLine, recentFirst } from '../events/lib'

/**
 * "Upload photos to…": which event? Opens with `?upload=1` (Home's Upload photos, search). Live and
 * uploading events first; picking one opens that event's upload dialog.
 */
export function UploadPicker({ events, loading }: { events: PhotoEvent[]; loading: boolean }) {
  const navigate = useNavigate()
  const [params, set] = useParamState()
  const open = params.get('upload') === '1'
  const [q, setQ] = useState('')
  useEffect(() => { if (open) setQ('') }, [open])

  const all = useMemo(() => recentFirst(events.filter((e) => e.status !== 'archived')), [events])
  const shown = all.filter((e) => matchesQuery(e, q))
  const close = () => set({ upload: undefined })
  const newEvent = () => set({ upload: undefined, new: '1' })

  return (
    <Modal open={open} onOpenChange={(v) => !v && close()} title="Upload photos to…" width={480}
      footer={all.length > 0 ? (
        <button type="button" onClick={newEvent} className="mr-auto inline-flex min-h-[38px] items-center gap-1.5 text-[13px] font-bold text-accent-text hover:underline">
          <Plus size={14} aria-hidden />New event instead
        </button>
      ) : undefined}>
      {loading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : all.length === 0 ? (
        <EmptyState className="py-8" icon={<CalendarPlus size={22} />} title="Create an event first"
          body="Photos always go into an event, so guests get one link for all of them."
          action={<Button variant="primary" icon={<Plus size={15} />} onClick={newEvent}>New event</Button>} />
      ) : (
        <>
          <Input icon={<Search size={15} />} placeholder="Search events" aria-label="Search events" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
          {shown.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-2">No events match “{q}”. Check the name or event code.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {shown.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => navigate(`/events/${e.id}?modal=upload`)}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-control px-2 py-1.5 text-left hover:bg-sunk">
                    <CoverMosaic tones={e.coverTones} className="h-[38px] w-[54px] shrink-0 overflow-hidden rounded-md" empty={e.photoCount === 0 ? ' ' : undefined} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px]">{e.name}</b>
                      <span className="block truncate text-[12px] text-ink-3">{fmt.date(e.date)} · {photoLine(e)}</span>
                    </span>
                    {(e.status === 'uploading' || e.status === 'draft' || e.status === 'expiring') && <EventStatusChip status={e.status} expiresInDays={daysLeft(e)} className="max-[420px]:hidden" />}
                    <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}
