import { useSyncExternalStore } from 'react'
import { friendlyError } from './errors'
import { toast } from './toast'

/**
 * Rule 8 ("Undo, not Are you sure?"): the action is sent straight away and an Undo toast offers the reverse call
 * (contract v5: restorePhotos, restoreAlbum, reopenAccessRequest, restoreGuest, setPhotoReview back to pending).
 * The affected ids are hidden at once (optimistic) so lists update before the refetch; Undo shows them again.
 */
let hidden = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const setHidden = (next: Set<string>) => { hidden = next; emit() }
const unhide = (ids: string[]) => { const next = new Set(hidden); ids.forEach((id) => next.delete(id)); setHidden(next) }

export async function actWithUndo({ title, detail, ids = [], run, undo, undone = 'Undone' }: {
  title: string; detail?: string; ids?: string[]; run: () => Promise<unknown>; undo: () => Promise<unknown>; undone?: string
}) {
  if (ids.length) setHidden(new Set([...hidden, ...ids]))
  try {
    await run()
  } catch (e) {
    unhide(ids)
    const f = friendlyError(e)
    toast.error(f.title, f.detail)
    return
  }
  toast.undo(title, async () => {
    try {
      await undo()
      unhide(ids)
      toast.success(undone)
    } catch (e) {
      const f = friendlyError(e)
      toast.error(f.title, f.detail)
    }
  }, detail)
}

/** Ids just acted on (filter them out of lists until the refetch lands). */
export const useHiddenIds = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => hidden, () => hidden)
