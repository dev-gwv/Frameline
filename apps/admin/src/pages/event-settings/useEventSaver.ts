import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EventSettings, PhotoEvent } from '@frameline/shared'
import { useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'

export type SaveSettings = (patch: Partial<EventSettings>) => void
export type SaveEvent = (patch: Partial<Omit<PhotoEvent, 'settings'>>) => void

/**
 * Autosave for event settings. Applies the change to the cached event right away
 * (optimistic), then persists it. Success is silent (the header indicator updates);
 * failures roll back and explain what happened in a toast.
 */
export function useEventSaver(routeId: string | undefined) {
  const api = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState(0)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const run = useCallback(async (optimistic: (e: PhotoEvent) => PhotoEvent, call: (id: string) => Promise<PhotoEvent>) => {
    const key = ['event', routeId]
    const current = qc.getQueryData<PhotoEvent>(key)
    if (!current) return
    qc.setQueryData(key, optimistic(current))
    setPending((n) => n + 1)
    try {
      const next = await call(current.id)
      qc.setQueryData(key, next)
      setSavedAt(Date.now())
    } catch (err) {
      qc.setQueryData(key, current)
      toast.error('Couldn’t save that change', `${err instanceof Error ? err.message : 'The request failed.'} Your previous setting is back — try again.`)
    } finally {
      setPending((n) => n - 1)
    }
  }, [qc, routeId, toast])

  const saveSettings = useCallback<SaveSettings>((patch) => {
    void run((e) => ({ ...e, settings: { ...e.settings, ...patch } }), (id) => api.updateEventSettings(id, patch))
  }, [api, run])

  const saveEvent = useCallback<SaveEvent>((patch) => {
    void run((e) => ({ ...e, ...patch }), (id) => api.updateEvent(id, patch))
  }, [api, run])

  return { saveSettings, saveEvent, saving: pending > 0, savedAt }
}
