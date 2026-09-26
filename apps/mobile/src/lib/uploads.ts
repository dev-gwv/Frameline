import { useSyncExternalStore } from 'react'
import type { FramelineApi, ID, UploadQuality } from '@frameline/shared'
import { errorText } from './errors'
import { local } from './local'

/**
 * Photographer upload queue. The per-file progress bar is a local estimate; files are committed to `api.uploadPhotos`
 * in batches of 5 with their device URIs as `url` (source 'web', uploadedBy = the signed-in name). With the HTTP
 * client that call reads the file:// / content:// bytes and PUTs them to storage; the mock stores the URI directly.
 * Pause stops the loop.
 */
export interface UploadItem {
  id: string
  uri: string
  filename: string
  size: number
  width?: number
  height?: number
  eventId: ID
  albumId: ID
  quality: UploadQuality
  progress: number
  status: 'queued' | 'uploading' | 'sending' | 'done' | 'error'
  error?: string
}

interface QueueState { items: UploadItem[]; paused: boolean }

let state: QueueState = { items: [], paused: false }
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let api: FramelineApi | null = null
let committing = false

const set = (next: Partial<QueueState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()) }
const patch = (ids: Set<string>, p: Partial<UploadItem> | ((i: UploadItem) => Partial<UploadItem>)) =>
  set({ items: state.items.map((i) => (ids.has(i.id) ? { ...i, ...(typeof p === 'function' ? p(i) : p) } : i)) })

const PARALLEL = 3
const BATCH = 5

function tick() {
  if (state.paused) return
  const active = state.items.filter((i) => i.status === 'uploading')
  const queued = state.items.filter((i) => i.status === 'queued')
  const start = new Set(queued.slice(0, Math.max(0, PARALLEL - active.length)).map((i) => i.id))
  set({
    items: state.items.map((i) => {
      if (start.has(i.id)) return { ...i, status: 'uploading' }
      if (i.status !== 'uploading') return i
      const mb = i.size / 1e6 * (i.quality === 'original' ? 2 : 1)
      const progress = Math.min(1, i.progress + 0.05 + 0.25 / Math.max(1, mb))
      return progress >= 1 ? { ...i, progress: 1, status: 'sending' } : { ...i, progress }
    }),
  })
  commit()
  if (!state.items.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'sending')) stop()
}

async function commit() {
  if (committing || !api) return
  const sending = state.items.filter((i) => i.status === 'sending')
  const allDone = !state.items.some((i) => i.status === 'queued' || i.status === 'uploading')
  if (!sending.length || (sending.length < BATCH && !allDone)) return
  const first = sending[0]!
  const batch = sending.filter((i) => i.eventId === first.eventId && i.albumId === first.albumId && i.quality === first.quality).slice(0, BATCH)
  committing = true
  const ids = new Set(batch.map((i) => i.id))
  try {
    await api.uploadPhotos(first.eventId, first.albumId, batch.map((i) => ({ filename: i.filename, size: i.size, url: i.uri, width: i.width, height: i.height })), { quality: first.quality, source: 'web', uploadedBy: local.get().studioSession?.name || local.get().studioSession?.email })
    patch(ids, { status: 'done' })
  } catch (e) {
    patch(ids, { status: 'error', error: errorText(e) })
  } finally {
    committing = false
  }
  if (state.items.some((i) => i.status === 'sending')) commit()
}

function run() { if (!timer) timer = setInterval(tick, 160) }
function stop() { if (timer) { clearInterval(timer); timer = null } }

export const uploads = {
  bind(a: FramelineApi) { api = a },
  add(files: Omit<UploadItem, 'id' | 'progress' | 'status'>[]) {
    const now = Date.now()
    set({ items: [...state.items, ...files.map((f, i) => ({ ...f, id: `u${now}_${i}`, progress: 0, status: 'queued' as const }))] })
    if (!state.paused) run()
  },
  pause() { set({ paused: true }) },
  resume() { set({ paused: false }); run() },
  retry(id: string) { patch(new Set([id]), { status: 'queued', progress: 0, error: undefined }); run() },
  clearDone() { set({ items: state.items.filter((i) => i.status !== 'done') }) },
  cancelQueued() { set({ items: state.items.filter((i) => i.status !== 'queued') }) },
}

export const useUploads = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => state, () => state)
