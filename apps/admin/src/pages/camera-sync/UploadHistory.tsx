import { CheckCircle2, CircleSlash, Clock, Trash2, XCircle } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, cn, EmptyState, Modal, Skeleton } from '@frameline/ui'
import { useCameraUploads } from '../../lib/queries'
import { QueryError } from '../system'
import { LIVE_MS } from './CamerasTable'
import { clock, uploadResult } from './utils'

const TONE = {
  ok: { cls: 'text-ok', icon: <CheckCircle2 size={13} /> },
  warn: { cls: 'text-warn', icon: <Clock size={13} /> },
  bad: { cls: 'text-bad', icon: <XCircle size={13} /> },
  muted: { cls: 'text-ink-3', icon: <CircleSlash size={13} /> },
} as const

/** Every file a camera sent, newest first. Clearing asks first (the page shows the ConfirmDialog). */
export function UploadHistoryModal({ cam, onClose, onClear, clearing }: { cam: Camera | null; onClose: () => void; onClear: () => void; clearing?: boolean }) {
  const uploads = useCameraUploads(cam?.id, cam?.status === 'receiving' ? LIVE_MS : false)
  const list = uploads.data ?? []
  return (
    <Modal open={!!cam} onOpenChange={(v) => { if (!v) onClose() }} title="Upload history" width={600}
      description={cam ? `${cam.label}${cam.status === 'receiving' ? ' · refreshes every 5 seconds while it’s sending' : ''}` : undefined}
      bodyClassName="p-0"
      footer={<>
        <Button variant="danger" className="mr-auto" icon={<Trash2 size={14} />} disabled={!list.length} loading={clearing} onClick={onClear}>Clear history</Button>
        <Button onClick={onClose}>Close</Button>
      </>}>
      {uploads.error ? <QueryError error={uploads.error} retry={() => uploads.refetch()} />
        : uploads.isLoading ? <div className="flex flex-col gap-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        : !list.length ? (
          <EmptyState className="py-10" title="Nothing here yet"
            body={cam?.status === 'receiving' ? 'New photos show here as they arrive.' : 'Files show here as the camera sends them. Photos already in the album stay there.'} />
        ) : (
          <ul aria-live="polite">
            {list.map((u) => {
              const r = uploadResult(u, cam!.mode)
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line px-[22px] py-2.5 text-[13px] last:border-b-0">
                  <span className="w-[62px] shrink-0 text-ink-3 tnum">{clock(u.at)}</span>
                  <b className="min-w-0 flex-1 truncate">{u.filename}</b>
                  <span className="shrink-0 text-ink-3 tnum">{(u.sizeBytes / 1_000_000).toFixed(1)} MB</span>
                  <span className={cn('flex w-full items-center gap-1.5 pl-[74px] text-[12.5px] font-bold sm:w-[190px] sm:pl-0', TONE[r.tone].cls)}>
                    {TONE[r.tone].icon}<span className="min-w-0">{r.label.charAt(0).toUpperCase() + r.label.slice(1)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
    </Modal>
  )
}
