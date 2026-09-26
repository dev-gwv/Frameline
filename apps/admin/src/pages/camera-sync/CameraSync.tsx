import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera as CameraIcon, Plus, Trash2 } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, Card, CardHeader, Chip, EmptyState, PageHeader, Skeleton, useToast } from '@frameline/ui'
import { useCameras, useEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { AddCameraModal } from './AddCameraModal'
import { CamerasTable } from './CamerasTable'
import { CredentialsCard } from './Credentials'
import { SetupGuide } from './SetupGuide'
import { agoShort, clock, MAX_CAMERAS, nextFile, resultFor, seedLog, type LogLine } from './utils'

const STEPS = [
  ['Add a camera', 'Pick the event, the album, and whether photos need your review first'],
  ['Enter FTP details on the camera', 'Canon, Nikon, Sony and Fujifilm bodies with FTP over Wi-Fi; use passive mode'],
  ['Shoot', 'Photos appear in about 10 seconds; guests get a “new photos” alert'],
] as const

/** How often a "receiving" camera delivers a simulated new file. */
const TICK_MS = 4_000

export default function CameraSync() {
  const cams = useCameras()
  const events = useEvents().data ?? []
  const toast = useToast()
  const [selectedId, setSelectedId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [guide, setGuide] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Simulated live feed (the real one comes from the FTP upload hook).
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [extra, setExtra] = useState<Record<string, number>>({})
  const [last, setLast] = useState<Record<string, LogLine | undefined>>({})
  const seeded = useRef(new Set<string>())

  const list = cams.data ?? []
  const selected = list.find((c) => c.id === selectedId) ?? list[0]

  // Seed a believable history once per camera.
  useEffect(() => {
    const fresh = list.filter((c) => !seeded.current.has(c.id))
    if (!fresh.length) return
    const t = Date.now()
    fresh.forEach((c) => seeded.current.add(c.id))
    setLogs((l) => ({ ...l, ...Object.fromEntries(fresh.map((c) => [c.id, seedLog(c, t)])) }))
    setLast((l) => ({ ...l, ...Object.fromEntries(fresh.map((c) => [c.id, seedLog(c, t)[0]])) }))
  }, [list])

  // Clock for "8 s ago" labels.
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i) }, [])

  // New files arriving on receiving cameras.
  const receiving = list.filter((c) => c.status === 'receiving')
  const receivingKey = receiving.map((c) => c.id).join(',')
  const lastRef = useRef(last)
  lastRef.current = last
  useEffect(() => {
    if (!receiving.length) return
    const i = setInterval(() => {
      const t = Date.now()
      const lines: Record<string, LogLine> = {}
      for (const c of receiving) {
        const prev = lastRef.current[c.id]
        lines[c.id] = { id: `${c.id}-${t}`, at: t, file: nextFile(prev?.file ?? c.lastFile), sizeMb: 10.2 + Math.random() * 1.8, result: resultFor(c.mode) }
      }
      setLogs((l) => ({ ...l, ...Object.fromEntries(Object.entries(lines).map(([id, line]) => [id, [line, ...(l[id] ?? [])].slice(0, 60)])) }))
      setLast((l) => ({ ...l, ...lines }))
      setExtra((x) => ({ ...x, ...Object.fromEntries(Object.keys(lines).map((id) => [id, (x[id] ?? 0) + 1])) }))
    }, TICK_MS)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivingKey])

  const today = (c: Camera) => c.today + (extra[c.id] ?? 0)
  const idleFor = (c: Camera) => (c.status === 'idle' && last[c.id] ? now - last[c.id]!.at : undefined)

  const lastLine = useMemo(() => {
    if (!selected) return ''
    const l = last[selected.id]
    if (!l) return selected.status === 'offline' ? 'No photos yet — turn the camera’s FTP on to connect.' : 'Waiting for the first photo.'
    return `Last photo ${agoShort(now - l.at)} · ${l.file} · ${l.sizeMb.toFixed(1)} MB.`
  }, [selected, last, now])

  const header = (
    <PageHeader
      title={<span className="inline-flex items-center gap-2">Camera sync <Chip tone="accent">Beta</Chip></span>}
      subtitle="Photos go from your camera to an album while you shoot."
      actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Add camera</Button>}
    />
  )

  const history = selected ? logs[selected.id] ?? [] : []

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
              <CamerasTable cameras={list} events={events} selectedId={selected?.id} onSelect={setSelectedId} today={today} idleFor={idleFor} />
            )}

          {selected && (
            <Card>
              <CardHeader title={`Upload history · ${selected.label}`} action={
                <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} disabled={!history.length}
                  onClick={() => { setLogs((l) => ({ ...l, [selected.id]: [] })); toast.success('History cleared', 'Photos stay in the album.') }}>
                  Clear history
                </Button>
              } />
              {history.length ? (
                <div className="max-h-64 overflow-y-auto scrollbar-thin" aria-live="polite">
                  <div className="flex min-w-0 flex-col gap-[3px] font-mono text-[11.5px] text-ink-2">
                    {history.map((l, i) => (
                      <span key={l.id} className={i === 0 && now - l.at < 1500 ? 'animate-[fl-fade-in_400ms_ease-out] text-ink' : undefined}>
                        {clock(l.at)}{'  '}{l.file}{'  '}{l.sizeMb.toFixed(1)} MB{'  '}
                        <span className={l.result === 'published' ? 'text-ok' : l.result === 'stored' ? 'text-ink-2' : 'text-warn'}>
                          {l.result === 'published' ? '✓' : l.result === 'stored' ? '↓' : '◷'} {l.result}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-3">
                  {selected.status === 'receiving' ? 'History cleared. New photos will show here as they arrive.' : 'Nothing yet. Files show here as the camera sends them.'}
                </p>
              )}
            </Card>
          )}
        </div>

        {selected && <CredentialsCard cam={selected} lastLine={lastLine} onGuide={() => setGuide(true)} />}
      </div>

      <AddCameraModal open={adding} onOpenChange={setAdding} full={list.length >= MAX_CAMERAS} onCreated={(c) => setSelectedId(c.id)} />
      <SetupGuide open={guide} onOpenChange={setGuide} />
    </div>
  )
}
