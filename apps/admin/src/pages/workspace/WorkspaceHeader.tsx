import { Link, useNavigate } from 'react-router-dom'
import { Eye, HardDriveDownload, Settings, Share2, Users } from 'lucide-react'
import { DEMO_NOW, fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Chip, EventStatusChip } from '@frameline/ui'
import { useAccessRequests } from '../../lib/queries'
import { GALLERY_URL } from './lib'

export function WorkspaceHeader({ event, onImport, onShare }: { event: PhotoEvent; onImport: () => void; onShare: () => void }) {
  const navigate = useNavigate()
  const requests = useAccessRequests(event.id).data?.length ?? 0
  const v = event.visits
  const visits = v.web + v.android + v.ios
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-surface px-4 pb-3 pt-4 sm:px-7">
      <div className="min-w-0">
        <div className="text-[12px] text-ink-3"><Link to="/events" className="hover:text-ink-2 hover:underline">Events</Link> /</div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[23px] font-semibold leading-tight">{event.name}</h1>
          <EventStatusChip status={event.status} expiresInDays={fmt.daysUntil(event.expiresAt, DEMO_NOW)} />
          <span className="rounded-[5px] border border-line px-1.5 font-mono text-[12px] text-ink-3">{event.shortId}</span>
        </div>
        <div className="mt-0.5 text-[12.5px] text-ink-2">
          <span className="font-mono tnum">{fmt.count(event.photoCount)} / {fmt.count(event.photoLimit)}</span> photos
          {' · '}<span className="font-mono tnum">{fmt.count(visits)}</span> visits ({fmt.count(v.web)} web · {fmt.count(v.android)} Android · {fmt.count(v.ios)} iOS)
          {' · '}expires {fmt.date(event.expiresAt)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" icon={<HardDriveDownload size={14} />} onClick={onImport}>Import</Button>
        <Button variant="ghost" icon={<Users size={14} />} onClick={() => navigate(`/events/${event.id}/guests`)}>
          Guests{requests > 0 && <Chip tone="accent" aria-label={`${requests} access requests`}>{requests}</Chip>}
        </Button>
        <Button icon={<Eye size={14} />} onClick={() => window.open(`${GALLERY_URL}/${event.shortId}`, '_blank', 'noopener')}>Preview</Button>
        <Button icon={<Settings size={14} />} onClick={() => navigate(`/events/${event.id}/settings`)}>Settings</Button>
        <Button variant="primary" icon={<Share2 size={14} />} onClick={onShare}>Share</Button>
      </div>
    </header>
  )
}
