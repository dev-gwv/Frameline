import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Pause, Play, RotateCcw, WifiOff, X } from 'lucide-react'
import { ApiError, fmt, type ID, type UploadFile, type UploadOptions } from '@frameline/shared'
import { Button, Meter, cn, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../lib/api'

/**
 * Global upload queue. Uploads keep running while the photographer moves around the app; the dock
 * (bottom-right; above the tab bar on phones) shows progress everywhere.
 *
 * - Offline: the queue pauses by itself ("Paused: you're offline") and resumes on the browser's `online` event.
 * - Server error: the job stops with the reason and a Retry button (retries from the failed batch).
 * - `useEventUploads(eventId)` gives a page the jobs for one event (the Photos tab's uploading strip).
 */
export type UploadJobState = 'running' | 'paused' | 'offline' | 'stopped' | 'done'
export interface UploadJob {
  id: string; eventId: ID; albumId: ID; albumName: string
  total: number; done: number
  /** @deprecated use `state === 'paused'` */
  paused: boolean
  state: UploadJobState
  startedAt: number
  /** Total bytes of the job's files. */
  bytes: number
  /** Why it stopped (state 'stopped'). */
  error?: string
}
interface UploadCtx {
  jobs: UploadJob[]
  online: boolean
  start: (args: { eventId: ID; albumId: ID; albumName: string; files: UploadFile[] } & UploadOptions) => void
  togglePause: (id: string) => void
  retry: (id: string) => void
  dismiss: (id: string) => void
}
const Ctx = createContext<UploadCtx | null>(null)

const BATCH = 6
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
const networkError = (e: unknown) => isOffline() || (e instanceof ApiError && (e.status === 0 || e.code === 'network_error')) || e instanceof TypeError

export function UploadProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const toast = useToast()
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [online, setOnline] = useState(!isOffline())
  const work = useRef(new Map<string, { files: UploadFile[]; opts: UploadOptions; next: number; paused: boolean; running: boolean }>())
  const onlineRef = useRef(online)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const patch = useCallback((id: string, p: Partial<UploadJob>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p, paused: (p.state ?? j.state) === 'paused' } : j))), [])

  const run = useCallback(async (id: string) => {
    const w = work.current.get(id)
    if (!w || w.running) return
    w.running = true
    try {
      const job = () => jobsRef.current.find((j) => j.id === id)
      while (w.next < w.files.length) {
        if (w.paused) { patch(id, { state: 'paused' }); return }
        if (!onlineRef.current) { patch(id, { state: 'offline' }); return }
        const j = job()
        if (!j) return
        try {
          await api.uploadPhotos(j.eventId, j.albumId, w.files.slice(w.next, w.next + BATCH), w.opts)
        } catch (e) {
          if (networkError(e)) { patch(id, { state: 'offline' }); return } // resumes on `online`
          patch(id, { state: 'stopped', error: errorMessage(e) })
          toast.error(`Upload to ${j.albumName} stopped`, errorMessage(e))
          return
        }
        w.next = Math.min(w.files.length, w.next + BATCH)
        patch(id, { done: w.next, state: 'running', error: undefined })
      }
      const j = job()
      patch(id, { state: 'done' })
      if (j) toast.success(`${fmt.count(j.total)} photos added to ${j.albumName}`)
    } finally {
      w.running = false
    }
  }, [api, patch, toast])

  // Pause while offline; pick everything back up when the connection returns.
  useEffect(() => {
    const on = () => {
      setOnline(true); onlineRef.current = true
      for (const j of jobsRef.current) if (j.state === 'offline') { patch(j.id, { state: 'running' }); void run(j.id) }
    }
    const off = () => { setOnline(false); onlineRef.current = false }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [patch, run])

  const start = useCallback<UploadCtx['start']>(({ eventId, albumId, albumName, files, ...opts }) => {
    const id = Math.random().toString(36).slice(2)
    const bytes = files.reduce((s, f) => s + f.size, 0)
    work.current.set(id, { files, opts, next: 0, paused: false, running: false })
    const job: UploadJob = { id, eventId, albumId, albumName, total: files.length, done: 0, paused: false, state: onlineRef.current ? 'running' : 'offline', startedAt: Date.now(), bytes }
    jobsRef.current = [...jobsRef.current, job]
    setJobs((j) => [...j, job])
    void run(id)
  }, [run])

  const togglePause = useCallback((id: string) => {
    const w = work.current.get(id)
    if (!w) return
    w.paused = !w.paused
    if (w.paused) patch(id, { state: 'paused' })
    else { patch(id, { state: onlineRef.current ? 'running' : 'offline' }); void run(id) }
  }, [patch, run])
  const retry = useCallback((id: string) => { patch(id, { state: 'running', error: undefined }); void run(id) }, [patch, run])
  const dismiss = useCallback((id: string) => {
    const w = work.current.get(id)
    if (w) w.paused = true
    work.current.delete(id)
    setJobs((js) => js.filter((j) => j.id !== id))
  }, [])

  const value = useMemo(() => ({ jobs, online, start, togglePause, retry, dismiss }), [jobs, online, start, togglePause, retry, dismiss])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUploads() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useUploads must be used inside <UploadProvider>')
  return c
}
/** Unfinished upload jobs for one event (for the Photos tab's "Uploading 212 of 404" strip). */
export function useEventUploads(eventId?: ID) {
  const { jobs, togglePause, retry } = useUploads()
  const list = jobs.filter((j) => j.eventId === eventId && j.state !== 'done')
  const total = list.reduce((s, j) => s + j.total, 0)
  const done = list.reduce((s, j) => s + j.done, 0)
  return { jobs: list, total, done, togglePause, retry }
}

/** Speed and time left for a running job. */
export function uploadRate(j: UploadJob) {
  const secs = Math.max(1, (Date.now() - j.startedAt) / 1000)
  const mbps = (j.bytes * (j.done / Math.max(1, j.total))) / secs / 1e6
  const minsLeft = j.done ? Math.max(1, Math.round((((j.total - j.done) / j.done) * secs) / 60)) : null
  return { mbps, minsLeft }
}

export function UploadDock() {
  const { jobs, togglePause, retry, dismiss } = useUploads()
  const [min, setMin] = useState(false)
  if (!jobs.length) return null
  const allDone = jobs.every((j) => j.state === 'done')
  return (
    <div className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-card border border-line bg-surface shadow-float md:inset-x-auto md:bottom-5 md:right-5 md:w-[300px]"
      role="region" aria-label="Uploads">
      {jobs.length > 1 && (
        <div className="flex items-center justify-between border-b border-line py-1.5 pl-3.5 pr-1.5">
          <b className="text-[13px]">{allDone ? 'Uploads complete' : ((n) => `${n} upload${n === 1 ? '' : 's'} running`)(jobs.filter((j) => j.state !== 'done').length)}</b>
          <MinButton min={min} onClick={() => setMin((m) => !m)} />
        </div>
      )}
      {(!min || jobs.length === 1) && jobs.map((j) => (
        <JobRow key={j.id} job={j} single={jobs.length === 1} min={min} onMin={() => setMin((m) => !m)}
          onPause={() => togglePause(j.id)} onRetry={() => retry(j.id)} onDismiss={() => dismiss(j.id)} />
      ))}
    </div>
  )
}

function MinButton({ min, onClick }: { min: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={min ? 'Show upload details' : 'Hide upload details'} aria-expanded={!min} onClick={onClick}
      className="grid size-8 place-items-center rounded-control text-ink-2 hover:bg-sunk">{min ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
  )
}

function JobRow({ job: j, single, min, onMin, onPause, onRetry, onDismiss }: {
  job: UploadJob; single: boolean; min: boolean; onMin: () => void; onPause: () => void; onRetry: () => void; onDismiss: () => void
}) {
  const { mbps, minsLeft } = uploadRate(j)
  const title = j.state === 'done' ? <span className="inline-flex items-center gap-1.5 text-ok"><CheckCircle2 size={15} />Added to {j.albumName}</span>
    : j.state === 'offline' ? <span className="inline-flex items-center gap-1.5 text-warn"><WifiOff size={15} />Paused: you’re offline</span>
    : j.state === 'stopped' ? <span className="text-bad">Upload to {j.albumName} stopped</span>
    : j.state === 'paused' ? `Paused: ${j.albumName}`
    : `Uploading to ${j.albumName}`
  return (
    <div className="border-t border-line px-3.5 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <b className="min-w-0 truncate text-[13.5px]">{title}</b>
        <div className="-mr-1.5 flex shrink-0 items-center gap-1">
          {j.state === 'running' || j.state === 'paused'
            ? <Button size="sm" variant="ghost" icon={j.state === 'paused' ? <Play size={12} /> : <Pause size={12} />} onClick={onPause}>{j.state === 'paused' ? 'Resume' : 'Pause'}</Button>
            : j.state === 'stopped' ? <Button size="sm" icon={<RotateCcw size={12} />} onClick={onRetry}>Retry</Button>
            : j.state === 'done' ? <button type="button" aria-label="Dismiss" className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-sunk" onClick={onDismiss}><X size={14} /></button>
            : null}
          {single && j.state !== 'done' && <MinButton min={min} onClick={onMin} />}
        </div>
      </div>
      {!(single && min) && (
        <>
          <Meter value={j.done} max={j.total} className="my-2" tone={j.state === 'offline' || j.state === 'paused' ? 'muted' : j.state === 'stopped' ? 'bad' : 'gold'} label={`${j.done} of ${j.total} uploaded`} />
          {j.state === 'offline' ? (
            <p className="text-[12.5px] text-ink-2"><span className="tnum">{fmt.count(j.done)} of {fmt.count(j.total)}</span> done. The rest will upload by themselves when you’re back.</p>
          ) : j.state === 'stopped' ? (
            <p className="text-[12.5px] text-ink-2">{j.error} <span className="tnum">{fmt.count(j.total - j.done)}</span> photos didn’t upload yet.</p>
          ) : (
            <div className={cn('flex justify-between text-[12px] text-ink-3 tnum')}>
              <span>{fmt.count(j.done)} / {fmt.count(j.total)}</span>
              <span>{j.state === 'done' ? 'Done' : j.state === 'paused' ? 'Paused' : `${mbps.toFixed(1)} MB/s${minsLeft ? ` · about ${minsLeft} min left` : ''}`}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
