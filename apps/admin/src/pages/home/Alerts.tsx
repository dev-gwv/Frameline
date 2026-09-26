import { useNavigate } from 'react-router-dom'
import { Bell, ScanFace } from 'lucide-react'
import type { PhotoEvent } from '@frameline/shared'
import { Button, Card } from '@frameline/ui'
import { expiringEvents, expiringFaceData } from './stats'

const dayWord = (d: number) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)

/** "What needs me today?" — expiring events and expiring face data, each with its fix. */
export function Alerts({ events }: { events: PhotoEvent[] }) {
  const navigate = useNavigate()
  const expiring = expiringEvents(events)
  const faces = expiringFaceData(events).filter((f) => !expiring.some((x) => x.event.id === f.event.id))
  if (!expiring.length && !faces.length) return null
  return (
    <div className="flex flex-col gap-2">
      {expiring.map(({ event, days }) => (
        <Card key={event.id} padded={false} className="flex flex-wrap items-center gap-3 border-transparent bg-warn-soft px-3.5 py-2.5">
          <Bell size={16} className="shrink-0 text-warn" aria-hidden />
          <div className="min-w-[min(100%,15rem)] flex-1 text-[13px]">
            <b>{event.name} expires {dayWord(days)}.</b>{' '}
            <span className="text-ink-2">Renew it yourself or send {event.hosts[0]?.name ?? 'the client'} a renewal link.</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate(`/plan?renew=${event.id}`)}>Send renewal link</Button>
            <Button size="sm" variant="primary" onClick={() => navigate(`/plan?renew=${event.id}&pay=now`)}>Renew</Button>
          </div>
        </Card>
      ))}
      {faces.map(({ event, days }) => (
        <Card key={`f-${event.id}`} padded={false} className="flex flex-wrap items-center gap-3 border-transparent bg-accent-soft px-3.5 py-2.5">
          <ScanFace size={16} className="shrink-0 text-accent-text" aria-hidden />
          <div className="min-w-[min(100%,15rem)] flex-1 text-[13px]">
            <b>Face data for {event.name} is deleted {dayWord(days)}.</b>{' '}
            <span className="text-ink-2">After that, guests can’t find themselves with a selfie.</span>
          </div>
          <Button size="sm" onClick={() => navigate(`/plan?renew=${event.id}&faces=1`)}>Keep face data</Button>
        </Card>
      ))}
    </div>
  )
}
