import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PhotoEvent } from '@frameline/shared'
import { useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { EditEventModal } from './EditEventModal'
import { galleryLink } from './lib'

export interface EventActions {
  share: (e: PhotoEvent) => void
  copyLink: (e: PhotoEvent) => void
  edit: (e: PhotoEvent) => void
  renew: (e: PhotoEvent) => void
  archive: (e: PhotoEvent) => void
  restoreArchived: (e: PhotoEvent) => void
  trash: (e: PhotoEvent) => void
}

/**
 * Everything the event card ⋯ menu does. Archive and trash act at once and offer Undo (rule 8).
 * Render `dialogs` once on the page (the Rename or change date modal).
 */
export function useEventActions(events: PhotoEvent[]) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<PhotoEvent | null>(null)

  const fail = (title: string) => (err: unknown) => toast.error(title, errorMessage(err))
  const setStatus = (e: PhotoEvent, status: PhotoEvent['status']) => api.updateEvent(e.id, { status })

  const actions: EventActions = {
    share: (e) => navigate(`/events/${e.id}?modal=share`),
    copyLink: async (e) => {
      const link = galleryLink(e)
      try { await navigator.clipboard.writeText(link); toast.success('Link copied', link) } catch { toast.error('Couldn’t copy the link', `Copy it by hand: ${link}`) }
    },
    edit: setEditing,
    renew: (e) => navigate(`/plan?renew=${e.id}`),
    archive: (e) => {
      setStatus(e, 'archived').then(
        () => toast.undo(`${e.name} archived`, () => void setStatus(e, e.status).catch(fail('Couldn’t undo')), 'Guests can’t open it until you restore it.'),
        fail('Couldn’t archive the event'),
      )
    },
    restoreArchived: (e) => {
      const next = e.photoCount ? 'live' : 'draft'
      setStatus(e, next).then(
        () => toast.undo(`${e.name} restored`, () => void setStatus(e, 'archived').catch(fail('Couldn’t undo'))),
        fail('Couldn’t restore the event'),
      )
    },
    trash: (e) => {
      api.deleteEvent(e.id).then(
        () => toast.undo(`${e.name} moved to trash`, () => void api.restoreEvent(e.id).catch(fail('Couldn’t undo')), 'It stays in Recently deleted for 30 days.'),
        fail('Couldn’t move the event to trash'),
      )
    },
  }

  const dialogs = <EditEventModal event={editing} events={events} onClose={() => setEditing(null)} />
  return { actions, dialogs }
}
