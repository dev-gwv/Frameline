import type { PhotoEvent } from '@frameline/shared'
import { useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../../lib/api'

/** True when the full-access PIN means something: guests otherwise see only their own photos. */
export const fullPinMatters = (e: PhotoEvent) => e.settings.faceSearch && e.settings.facePrivacy

/** Turn on / change / turn off the event's full-access PIN (the couple and family see every photo with it). */
export function useFullAccessPin(event: PhotoEvent) {
  const api = useApi()
  const toast = useToast()
  return {
    async make() {
      const had = !!event.settings.fullAccessPin
      try {
        const pin = await api.setFullAccessPin(event.id)
        toast.success(`Full-access PIN is ${pin}`, had ? 'The old one no longer works.' : 'Give it to the couple and family: they see every photo with it.')
      } catch (e) { toast.error('Couldn’t make a full-access PIN', errorMessage(e)); throw e }
    },
    async clear() {
      try {
        await api.clearFullAccessPin(event.id)
        toast.success('Full-access PIN turned off', 'Guests with the event PIN see only their own photos.')
      } catch (e) { toast.error('Couldn’t turn it off', errorMessage(e)); throw e }
    },
  }
}
