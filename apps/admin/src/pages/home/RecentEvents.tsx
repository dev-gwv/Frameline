import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarPlus } from 'lucide-react'
import { DEMO_NOW, fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Card, CardHeader, CoverMosaic, EmptyState, EventStatusChip } from '@frameline/ui'

const visits = (e: PhotoEvent) => e.visits.web + e.visits.android + e.visits.ios

export function RecentEvents({ events }: { events: PhotoEvent[] }) {
  const navigate = useNavigate()
  const rows = events.filter((e) => e.status !== 'archived').slice(0, 5)
  return (
    <Card padded={false}>
      <CardHeader className="mb-0 px-4 pb-1.5 pt-3.5" title="Recent events"
        action={<Link to="/events"><Button variant="ghost" size="sm" iconRight={<ArrowRight size={12} />}>All events</Button></Link>} />
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarPlus size={22} />} title="No events yet" body="Create an event, upload photos and share one link with guests."
          action={<Button variant="primary" onClick={() => navigate('/events?new=1')}>New event</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-ink-3">
                <th className="px-4 py-2 font-semibold">Event</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 text-right font-semibold">Photos</th>
                <th className="px-2 py-2 text-right font-semibold">Visits</th>
                <th className="px-4 py-2 text-right font-semibold">Face matches</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => navigate(`/events/${e.id}`)} className="cursor-pointer border-t border-line hover:bg-sunk">
                  <td className="px-4 py-2.5">
                    <Link to={`/events/${e.id}`} className="flex items-center gap-2.5" onClick={(ev) => ev.stopPropagation()}>
                      <CoverMosaic tones={e.coverTones} className="h-[30px] w-11 shrink-0 overflow-hidden rounded" empty={e.photoCount === 0 ? ' ' : undefined} />
                      <span className="min-w-0">
                        <b className="block truncate font-bold">{e.name}</b>
                        <span className="text-[11.5px] text-ink-3">{fmt.date(e.date)} · {e.city}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2.5"><EventStatusChip status={e.status} expiresInDays={Math.max(0, fmt.daysUntil(e.expiresAt, DEMO_NOW))} /></td>
                  <td className="px-2 py-2.5 text-right font-mono tnum">{fmt.count(e.photoCount)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tnum">{fmt.count(visits(e))}</td>
                  <td className="px-4 py-2.5 text-right font-mono tnum">{fmt.count(e.faceMatches)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
