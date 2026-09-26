import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Pause, Play, X } from 'lucide-react'
import type { ID, UploadFile, UploadOptions } from '@frameline/shared'
import { Button, Meter, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../lib/api'

/**
 * Global upload queue. Uploads keep running while the photographer moves around the
 * app; the dock (bottom-right) shows progress everywhere.
 */
interface Job { id: string; eventId: ID; albumId: ID; albumName: string; total: number; done: number; paused: boolean; startedAt: number; bytes: number }
interface UploadCtx {
  jobs: Job[]
  start: (args: { eventId: ID; albumId: ID; albumName: string; files: UploadFile[] } & UploadOptions) => void
  togglePause: (id: string) => void
  dismiss: (id: string) => void
}
const Ctx = createContext<UploadCtx | null>(null)

const BATCH = 6

export function UploadProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const toast = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const paused = useRef(new Set<string>())

  const start = useCallback<UploadCtx['start']>(({ eventId, albumId, albumName, files, ...opts }) => {
    const id = Math.random().toString(36).slice(2)
    const bytes = files.reduce((s, f) => s + f.size, 0)
    setJobs((j) => [...j, { id, eventId, albumId, albumName, total: files.length, done: 0, paused: false, startedAt: Date.now(), bytes }])
    ;(async () => {
      for (let i = 0; i < files.length; i += BATCH) {
        while (paused.current.has(id)) await new Promise((r) => setTimeout(r, 300))
        try {
          await api.uploadPhotos(eventId, albumId, files.slice(i, i + BATCH), opts)
        } catch (e) {
          toast.error(`Upload to ${albumName} stopped`, errorMessage(e))
          return
        }
        setJobs((js) => js.map((j) => (j.id === id ? { ...j, done: Math.min(j.total, i + BATCH) } : j)))
      }
      toast.success(`${files.length} photos added to ${albumName}`)
    })()
  }, [api, toast])

  const togglePause = useCallback((id: string) => {
    if (paused.current.has(id)) paused.current.delete(id); else paused.current.add(id)
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, paused: !j.paused } : j)))
  }, [])
  const dismiss = useCallback((id: string) => setJobs((js) => js.filter((j) => j.id !== id)), [])

  const value = useMemo(() => ({ jobs, start, togglePause, dismiss }), [jobs, start, togglePause, dismiss])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUploads() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useUploads must be used inside <UploadProvider>')
  return c
}

export function UploadDock() {
  const { jobs, togglePause, dismiss } = useUploads()
  const [min, setMin] = useState(false)
  if (!jobs.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <b className="text-[13px]">{jobs.every((j) => j.done === j.total) ? 'Uploads complete' : 'Uploading'}</b>
        <button type="button" aria-label={min ? 'Expand' : 'Minimise'} className="rounded p-1 text-ink-2 hover:bg-sunk" onClick={() => setMin((m) => !m)}>{min ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      </div>
      {!min && jobs.map((j) => {
        const complete = j.done === j.total
        const secs = Math.max(1, (Date.now() - j.startedAt) / 1000)
        const rate = (j.bytes * (j.done / j.total)) / secs / 1e6
        const left = j.done ? Math.round(((j.total - j.done) / j.done) * secs / 60) : null
        return (
          <div key={j.id} className="px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <b className="truncate text-[13px]">{complete ? <span className="inline-flex items-center gap-1.5 text-ok"><CheckCircle2 size={14} />{j.albumName}</span> : `Uploading to ${j.albumName}`}</b>
              {complete
                ? <button type="button" aria-label="Dismiss" className="rounded p-1 text-ink-3 hover:bg-sunk" onClick={() => dismiss(j.id)}><X size={14} /></button>
                : <Button size="sm" icon={j.paused ? <Play size={12} /> : <Pause size={12} />} onClick={() => togglePause(j.id)}>{j.paused ? 'Resume' : 'Pause'}</Button>}
            </div>
            <Meter value={j.done} max={j.total} className="my-2" />
            <div className="flex justify-between text-[12px] text-ink-2">
              <span className="font-mono">{j.done} / {j.total}</span>
              <span>{complete ? 'Done' : j.paused ? 'Paused' : `${rate.toFixed(1)} MB/s${left !== null ? ` · about ${Math.max(1, left)} min left` : ''}`}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
