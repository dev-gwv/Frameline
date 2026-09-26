import { useEffect, useState } from 'react'
import { Camera as CameraIcon, Plus, Trash2 } from 'lucide-react'
import type { Camera, ID } from '@frameline/shared'
import { Button, Card, CardHeader, Chip, cn, ConfirmDialog, EmptyState, PageHeader, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useCameras, useCameraUploads, useEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { AddCameraModal } from './AddCameraModal'
import { CamerasTable } from './CamerasTable'
import { CredentialsCard } from './Credentials'
import { SetupGuide } from './SetupGuide'
import { agoShort, clock, MAX_CAMERAS, uploadResult } from './utils'

const STEPS = [
  ['Add a camera', 'Pick the event, the album, and whether photos need your review first'],
  ['Enter FTP details on the camera', 'Canon, Nikon, Sony and Fujifilm bodies with FTP over Wi-Fi; use passive mode'],
  ['Shoot', 'Photos appear in about 10 seconds; guests get a “new photos” alert'],
] as const

/** While a camera is receiving, its list and upload history refresh this often. */
const LIVE_MS = 5_000

const TONE_CLASS = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', muted: 'text-ink-3' } as const
const TONE_MARK = { ok: '✓', warn: '◷', bad: '✕', muted: '↓' } as const

export default function CameraSync() {
  const api = useApi()
  const cams = useCameras()
  const events = useEvents().data ?? []
  const [selectedId, setSelectedId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Camera | null>(null)
  const [removing, setRemoving] = useState<Camera | null>(null)
  const [clearing, setClearing] = useState(false)
  const [resetting, setResetting] = useState<Camera | null>(null)
  const [guide, setGuide] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // FTP passwords are returned once (create / reset); keep them for this visit only.
  const [passwords, setPasswords] = useState<Record<ID, string>>({})

  const list = cams.data ?? []
  const selected = list.find((c) => c.id === selectedId) ?? list[0]
  const anyReceiving = list.some((c) => c.status === 'receiving')
  const uploads = useCameraUploads(selected?.id, selected?.status === 'receiving' ? LIVE_MS : false)

  // Keep "today" counts and statuses fresh while any camera is sending.
  const { refetch } = cams
  useEffect(() => {
    if (!anyReceiving) return
    const i = setInterval(() => { void refetch() }, LIVE_MS)
    return () => clearInterval(i)
  }, [anyReceiving, refetch])

  // Clock for "8 s ago" labels.
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i) }, [])

  const reset = useAction((c: Camera) => api.resetCameraPassword(c.id), {
    success: 'New password made — enter it on the camera',
    onSuccess: (c) => { if (c.password) setPasswords((p) => ({ ...p, [c.id]: c.password! })) },
  })
  const remove = useAction((c: Camera) => api.deleteCamera(c.id), {
    success: (_d, c) => `${c.label} removed. Photos it sent stay in the album.`,
    onSuccess: (_d, c) => { if (selectedId === c.id) setSelectedId(undefined) },
  })
  const clear = useAction((c: Camera) => api.clearCameraUploads(c.id), { success: 'History cleared. Photos stay in the album.' })

  const history = uploads.data ?? []
  const latest = history[0]
  const idleFor = (c: Camera) => (c.status === 'idle' && c.id === selected?.id && latest ? now - Date.parse(latest.at) : undefined)

  let lastLine = ''
  if (selected) {
    if (latest) lastLine = `Last file ${agoShort(now - Date.parse(latest.at))} · ${latest.filename} · ${(latest.sizeBytes / 1_000_000).toFixed(1)} MB.`
    else if (selected.lastFile) lastLine = `Last file: ${selected.lastFile}.`
    else lastLine = selected.status === 'offline' ? 'No photos yet — turn the camera’s FTP on to connect.' : 'Waiting for the first photo.'
  }

  const header = (
    <PageHeader
      title={<span className="inline-flex items-center gap-2">Camera sync <Chip tone="accent">Beta</Chip></span>}
      subtitle="Photos go from your camera to an album while you shoot."
      actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Add camera</Button>}
    />
  )

  return (
    <div className="pb-10">
      {header}
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card className="grid gap-4 sm:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="flex flex-col gap-0.5">
                <span className="eyebrow">Step {i + 1}</span>
                <b className="text-[13.5px]">{t}</b>
                <small className="text-[12px] text-ink-2">{d}</small>
              </div>
            ))}
          </Card>

          {cams.isLoading ? <Skeleton className="h-48" />
            : cams.error ? <Card><QueryError error={cams.error} retry={() => cams.refetch()} /></Card>
            : !list.length ? (
              <Card>
                <EmptyState icon={<CameraIcon size={22} />} title="No cameras yet"
                  body="Add your first camera to get its FTP login. Photos then land in the album you pick while you shoot."
                  action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Add camera</Button>} />
              </Card>
            ) : (
              <CamerasTable cameras={list} events={events} selectedId={selected?.id} onSelect={setSelectedId} idleFor={idleFor} />
            )}

          {selected && (
            <Card>
              <CardHeader title={`Upload history · ${selected.label}`} action={
                <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} disabled={!history.length} loading={clear.isPending} onClick={() => setClearing(true)}>
                  Clear history
                </Button>
              } />
              {uploads.error ? <QueryError error={uploads.error} retry={() => uploads.refetch()} />
                : uploads.isLoading ? <Skeleton className="h-24" />
                : history.length ? (
                  <div className="max-h-64 overflow-y-auto scrollbar-thin" aria-live="polite">
                    <div className="flex min-w-0 flex-col gap-[3px] font-mono text-[11.5px] text-ink-2">
                      {history.map((u, i) => {
                        const r = uploadResult(u, selected.mode)
                        const fresh = i === 0 && now - Date.parse(u.at) < LIVE_MS + 1000
                        return (
                          <span key={u.id} className={cn('break-words', fresh && 'animate-[fl-fade-in_400ms_ease-out] text-ink')}>
                            {clock(u.at)}{'  '}{u.filename}{'  '}{(u.sizeBytes / 1_000_000).toFixed(1)} MB{'  '}
                            <span className={TONE_CLASS[r.tone]}>{TONE_MARK[r.tone]} {r.label}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-3">
                    {selected.status === 'receiving' ? 'New photos will show here as they arrive.' : 'Nothing yet. Files show here as the camera sends them.'}
                  </p>
                )}
              {selected.status === 'receiving' && <p className="mt-2 text-[11px] text-ink-3">Refreshes every {LIVE_MS / 1000} seconds while the camera is sending.</p>}
            </Card>
          )}
        </div>

        {selected && (
          <CredentialsCard cam={selected} password={passwords[selected.id]} lastLine={lastLine} onGuide={() => setGuide(true)}
            onReset={() => setResetting(selected)} resetting={reset.isPending}
            onEdit={() => setEditing(selected)} onDelete={() => setRemoving(selected)} />
        )}
      </div>

      <AddCameraModal open={adding} onOpenChange={setAdding} full={list.length >= MAX_CAMERAS}
        onCreated={(c) => { setSelectedId(c.id); if (c.password) setPasswords((p) => ({ ...p, [c.id]: c.password! })) }} />
      <AddCameraModal open={!!editing} camera={editing} onOpenChange={(v) => { if (!v) setEditing(null) }} />
      <ConfirmDialog open={!!removing} onOpenChange={(v) => { if (!v) setRemoving(null) }}
        title={`Remove ${removing?.label ?? 'camera'}?`} confirmLabel="Remove camera" danger
        body="Its FTP login stops working straight away and its upload history is deleted. Photos it already sent stay in the album."
        onConfirm={() => { if (removing) remove.mutate(removing); setRemoving(null) }} />
      <ConfirmDialog open={clearing} onOpenChange={setClearing}
        title="Clear upload history?" confirmLabel="Clear history" danger
        body="The list of files is deleted. Photos stay in the album."
        onConfirm={() => { if (selected) clear.mutate(selected); setClearing(false) }} />
      <ConfirmDialog open={!!resetting} onOpenChange={(v) => { if (!v) setResetting(null) }}
        title={`Make a new password for ${resetting?.label ?? 'this camera'}?`} confirmLabel="Make new password"
        body="The old password stops working, so the camera disconnects until you enter the new one in its FTP settings."
        onConfirm={() => { if (resetting) reset.mutate(resetting); setResetting(null) }} />
      <SetupGuide open={guide} onOpenChange={setGuide} />
    </div>
  )
}
