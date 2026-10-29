import { Pause, Play, RotateCcw, WifiOff } from 'lucide-react'
import { fmt, type ID } from '@frameline/shared'
import { Button, Chip, Meter } from '@frameline/ui'
import { uploadRate, useEventUploads } from '../../layout/UploadDock'
import { GoogleDriveIcon } from '../../lib/drive'
import { useDriveImports } from '../../lib/queries'

/** One line above the grid while Google Drive imports run on the server: "Importing from Google Drive · 120 of 400". */
export function DriveImportStrip({ eventId, onOpen }: { eventId: ID; onOpen: () => void }) {
  const running = (useDriveImports(eventId).data ?? []).filter((i) => i.status === 'running')
  if (!running.length) return null
  const total = running.reduce((n, i) => n + i.total, 0)
  const done = running.reduce((n, i) => n + i.done + i.skipped + i.failed, 0)
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-3.5 py-2.5" role="status" aria-live="polite">
      <Chip tone="accent" icon={<GoogleDriveIcon size={12} />}>Importing</Chip>
      <span className="min-w-0 flex-1 text-[13.5px]">
        <b className="tnum">{fmt.count(done)} of {fmt.count(total)}</b> <span className="text-ink-2">· from Google Drive · it keeps going if you close Frameline</span>
      </span>
      <Meter value={done} max={total || 1} className="order-last w-full sm:order-none sm:w-[220px]" tone="gold" label={`${done} of ${total} imported`} />
      <Button size="sm" onClick={onOpen}>Details</Button>
    </div>
  )
}

/** One line above the grid while this event uploads: "212 of 404 · about 6 min left · you can leave this page". Gone when done. */
export function UploadStrip({ eventId }: { eventId: ID }) {
  const { jobs, done, total, togglePause, retry } = useEventUploads(eventId)
  if (!jobs.length) return null
  const stopped = jobs.find((j) => j.state === 'stopped')
  const offline = jobs.some((j) => j.state === 'offline')
  const paused = jobs.every((j) => j.state === 'paused')
  const running = jobs.filter((j) => j.state === 'running')
  const mins = Math.max(0, ...running.map((j) => uploadRate(j).minsLeft ?? 0))
  const detail = stopped ? `stopped: ${stopped.error ?? 'the server didn’t accept a batch'}`
    : offline ? 'paused: you’re offline. It carries on by itself when you’re back'
    : paused ? 'paused'
    : `${mins ? `about ${mins} min left` : 'working out time left'} · you can leave this page`
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-3.5 py-2.5" role="status" aria-live="polite">
      {stopped ? <Chip tone="bad">Stopped</Chip> : offline ? <Chip tone="warn" icon={<WifiOff size={12} />}>Offline</Chip> : paused ? <Chip>Paused</Chip> : <Chip tone="accent">Uploading</Chip>}
      <span className="min-w-0 flex-1 text-[13.5px]">
        <b className="tnum">{fmt.count(done)} of {fmt.count(total)}</b> <span className="text-ink-2">· {detail}</span>
      </span>
      <Meter value={done} max={total || 1} className="order-last w-full sm:order-none sm:w-[220px]" tone={stopped ? 'bad' : offline || paused ? 'muted' : 'gold'} label={`${done} of ${total} uploaded`} />
      {stopped
        ? <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => retry(stopped.id)}>Retry</Button>
        : !offline && <Button size="sm" icon={paused ? <Play size={13} /> : <Pause size={13} />} onClick={() => jobs.forEach((j) => (paused ? j.state === 'paused' : j.state === 'running') && togglePause(j.id))}>{paused ? 'Resume' : 'Pause'}</Button>}
    </div>
  )
}
