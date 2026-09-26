import type { EventStatus, EventType } from './types'

/** Human labels for enums shown in the apps. */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: 'Wedding', engagement: 'Engagement', couple: 'Couple shoot', family: 'Family', baby: 'Baby shoot', birthday: 'Birthday',
  corporate: 'Corporate', school: 'School', sports: 'Sports', product: 'Product', 'real-estate': 'Real estate', themed: 'Themed', other: 'Other',
}

export const EVENT_TYPES: { value: EventType; label: string }[] = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => ({ value, label: EVENT_TYPE_LABELS[value] }))

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  live: 'Live', uploading: 'Uploading', expiring: 'Expiring soon', draft: 'Draft', archived: 'Archived',
}
