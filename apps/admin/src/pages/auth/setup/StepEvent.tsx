import { EventBasics, type EventBasicsErrors } from '../../events/EventBasics'
import type { Patch, SetupDraft } from './draft'

/** The same three questions as New event, so people learn them once. */
export function StepEvent({ draft, patch, errors }: { draft: SetupDraft; patch: Patch; errors: EventBasicsErrors }) {
  return (
    <EventBasics idPrefix="fe" autoFocus errors={errors}
      value={{ name: draft.eventName, date: draft.eventDate, city: draft.eventCity, preset: draft.preset }}
      onChange={(p) => patch({
        ...(p.name !== undefined ? { eventName: p.name } : {}),
        ...(p.date !== undefined ? { eventDate: p.date } : {}),
        ...(p.city !== undefined ? { eventCity: p.city } : {}),
        ...(p.preset !== undefined ? { preset: p.preset } : {}),
      })} />
  )
}
