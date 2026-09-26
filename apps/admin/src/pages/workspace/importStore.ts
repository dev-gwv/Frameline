import { useSyncExternalStore } from 'react'
import { hash, type Album, type FramelineApi, type ID, type UploadFile } from '@frameline/shared'

/**
 * Simulated Google Drive import queue. It lives at module level so an import keeps
 * running when the modal closes or the photographer moves to another page.
 * The real version runs server-side (Drive API → Queues → R2).
 */

export interface ImportFolder {
  path: string
  count: number
  action: 'new' | 'existing' | 'merged'
  /** Album name the photos land in. */
  target: string
  albumId?: ID
}

export interface ImportJob {
  id: string
  eventId: ID
  folderId: string
  rootName: string
  total: number
  done: number
  skipped: number
  quality: 'web' | 'original'
  watermark: boolean
  status: 'running' | 'done' | 'failed' | 'cancelled'
  startedAt: number
  finishedAt?: number
  albumsCreated: number
  error?: string
}

const HISTORY_KEY = 'frameline.driveImports'
const listeners = new Set<() => void>()
let active: ImportJob[] = []
let history: ImportJob[] = (() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as ImportJob[] } catch { return [] } })()
let snapshot = { active, history }
const cancelled = new Set<string>()

function emit() {
  snapshot = { active, history }
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30))) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
function patch(id: string, p: Partial<ImportJob>) { active = active.map((j) => (j.id === id ? { ...j, ...p } : j)); emit() }
function finish(id: string, p: Partial<ImportJob>) {
  const job = active.find((j) => j.id === id)
  if (!job) return
  active = active.filter((j) => j.id !== id)
  history = [{ ...job, ...p, finishedAt: Date.now() }, ...history]
  emit()
}

export function useImports(eventId: ID) {
  const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => snapshot)
  return { active: s.active.filter((j) => j.eventId === eventId), history: s.history.filter((j) => j.eventId === eventId) }
}
export function clearHistory(eventId: ID) { history = history.filter((j) => j.eventId !== eventId); emit() }
export function cancelImport(id: string) { cancelled.add(id) }

/** Photos from this folder that an earlier finished import already brought in. */
export function previouslyImported(eventId: ID, folderId: string) {
  return history.filter((j) => j.eventId === eventId && j.folderId === folderId && j.status === 'done').reduce((s, j) => s + j.done, 0)
}

/* ---------------- Folder preview (derived from the folder ID until the Drive API is wired) ---------------- */

export const DRIVE_RE = /^(?:https?:\/\/)?drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/i
const NEW_NAMES = ['Reception', 'Portraits', 'Baraat', 'Family', 'Details', 'Getting ready', 'Candids', 'Pheras']

export function previewFolder(folderId: string, eventName: string, albums: Album[], opts: { createAlbums: boolean; merge: boolean; fallback?: Album }) {
  const h = hash(folderId)
  const rootName = `${eventName.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).join('-')}-Final`
  const regular = albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order)
  const existingPicks = regular.slice(0, Math.min(2, regular.length))
  const fresh = [NEW_NAMES[h % NEW_NAMES.length], NEW_NAMES[(h >> 4) % NEW_NAMES.length]].filter((n, i, arr) => arr.indexOf(n) === i && !regular.some((a) => a.name.toLowerCase() === n.toLowerCase()))
  const count = (name: string) => 20 + (hash(folderId + name) % 360)
  const top = [...fresh, ...existingPicks.map((a) => a.name)]
  const parent = top[top.length - 1] ?? fresh[0] ?? 'Photos'
  const raw: { path: string; parent?: string }[] = [...top.map((p) => ({ path: p })), { path: `${parent}/Candids`, parent }]

  const folders: ImportFolder[] = raw.map(({ path, parent: par }) => {
    const n = count(path)
    if (!opts.createAlbums) return { path, count: n, action: 'existing', target: opts.fallback?.name ?? 'Choose an album', albumId: opts.fallback?.id }
    if (par && opts.merge) {
      const a = regular.find((x) => x.name.toLowerCase() === par.toLowerCase())
      return { path, count: n, action: 'merged', target: par, albumId: a?.id }
    }
    const name = par ? path.replace('/', ' – ') : path
    const a = regular.find((x) => x.name.toLowerCase() === name.toLowerCase())
    return a ? { path, count: n, action: 'existing', target: a.name, albumId: a.id } : { path, count: n, action: 'new', target: name }
  })
  return { rootName, folders, total: folders.reduce((s, f) => s + f.count, 0) }
}

/* ---------------- Runner ---------------- */

const BATCH = 25
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function startImport(api: FramelineApi, args: { eventId: ID; folderId: string; rootName: string; folders: ImportFolder[]; skip: number; quality: 'web' | 'original'; watermark: boolean }) {
  const total = args.folders.reduce((s, f) => s + f.count, 0)
  const toImport = Math.max(0, total - args.skip)
  const job: ImportJob = {
    id: Math.random().toString(36).slice(2), eventId: args.eventId, folderId: args.folderId, rootName: args.rootName,
    total: toImport, done: 0, skipped: Math.min(total, args.skip), quality: args.quality, watermark: args.watermark,
    status: 'running', startedAt: Date.now(), albumsCreated: 0,
  }
  active = [...active, job]
  emit()

  ;(async () => {
    const created = new Map<string, ID>()
    let skipLeft = args.skip
    let done = 0
    try {
      for (const f of args.folders) {
        let n = f.count
        const skipHere = Math.min(skipLeft, n)
        skipLeft -= skipHere
        n -= skipHere
        if (n <= 0) continue
        let albumId = f.albumId ?? created.get(f.target.toLowerCase())
        if (!albumId) {
          const a = await api.createAlbum(args.eventId, f.target)
          albumId = a.id
          created.set(f.target.toLowerCase(), a.id)
          patch(job.id, { albumsCreated: created.size })
        }
        const prefix = f.path.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 16).toUpperCase()
        for (let i = 0; i < n; i += BATCH) {
          if (cancelled.has(job.id)) { finish(job.id, { status: 'cancelled', done }); return }
          const files: UploadFile[] = Array.from({ length: Math.min(BATCH, n - i) }, (_, k) => ({
            filename: `DRV_${prefix}_${String(skipHere + i + k + 1).padStart(4, '0')}.JPG`,
            size: 8_000_000 + (hash(`${f.path}${i + k}`) % 5_000_000),
          }))
          await api.uploadPhotos(args.eventId, albumId, files, { quality: args.quality })
          done += files.length
          patch(job.id, { done })
          await sleep(350)
        }
      }
      finish(job.id, { status: 'done', done })
    } catch (e) {
      finish(job.id, { status: 'failed', done, error: (e as Error).message })
    }
  })()
  return job
}
