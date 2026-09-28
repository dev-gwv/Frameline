import { useSyncExternalStore } from 'react'
import type { ID } from '@frameline/shared'

/*
 * Two small module-level stores shared by the Photos tab and the event modals:
 *
 * 1. Trash with Undo (rule 8). Trashing calls the API straight away (photos and albums go to the trash; the API keeps
 *    them for TRASH_DAYS) and Undo calls restorePhotos / restoreAlbum. The ids are hidden locally while the call runs
 *    and until the refetch lands, so nothing flashes back.
 * 2. Files picked or dropped on the Photos tab, handed to the Upload modal (mounted by EventModals).
 */

type Listener = () => void
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }

/* ---------------- Trash with Undo ---------------- */

let hiddenPhotos = new Set<ID>()
let hiddenAlbums = new Set<ID>()
let snapshot = { photos: hiddenPhotos, albums: hiddenAlbums }
/** How long trashed ids stay hidden after the call succeeds (the live refetch normally lands well before). */
const SETTLE_MS = 2500

function publish() { snapshot = { photos: hiddenPhotos, albums: hiddenAlbums }; emit() }
function setHidden(kind: 'photos' | 'albums', ids: ID[], on: boolean) {
  const n = new Set(kind === 'photos' ? hiddenPhotos : hiddenAlbums)
  ids.forEach((i) => (on ? n.add(i) : n.delete(i)))
  if (kind === 'photos') hiddenPhotos = n; else hiddenAlbums = n
  publish()
}

/**
 * Moves `ids` to the trash now (`trash()`), hiding them at once. Returns `undo`, which calls `restore()`.
 * `onError` runs if either call fails (trashed items come back into view).
 */
export function trashWithUndo(kind: 'photos' | 'albums', ids: ID[], trash: () => Promise<unknown>, restore: () => Promise<unknown>, onError?: (e: unknown, what: 'trash' | 'restore') => void) {
  setHidden(kind, ids, true)
  const done = trash().then(
    () => { setTimeout(() => setHidden(kind, ids, false), SETTLE_MS); return true },
    (e) => { setHidden(kind, ids, false); onError?.(e, 'trash'); return false },
  )
  return () => {
    setHidden(kind, ids, false)
    void done.then((ok) => { if (ok) restore().catch((e) => onError?.(e, 'restore')) })
  }
}

export function usePendingDeletes() {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/* ---------------- Files waiting for the Upload modal ---------------- */

let files: File[] = []
export function setPendingFiles(next: File[]) { files = next; emit() }
export function usePendingFiles() { return useSyncExternalStore(subscribe, () => files) }

export const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|tiff?|gif|avif)$/i.test(f.name)
