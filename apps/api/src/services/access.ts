import { Forbidden, NotFound } from '../lib/errors'

export type Role = 'owner' | 'editor' | 'uploader'

export interface Membership {
  id: string
  studioId: string
  userId: string
  role: Role
  /** Uploaders: events they are assigned to. Empty for owners/editors (they see all events). */
  eventIds: string[]
}

const RANK: Record<Role, number> = { uploader: 1, editor: 2, owner: 3 }

/**
 * Role policy:
 * - owner:    everything, including billing (credits, plan), payouts (orders, ledger) and team management
 * - editor:   events, albums, photos, settings, sharing tools, website, watermark, support
 * - uploader: read + upload for the events they are assigned to, nothing else
 */
export function hasRole(m: Membership, min: Role): boolean {
  return RANK[m.role] >= RANK[min]
}

export function assertRole(m: Membership, min: Role, action = 'do this'): void {
  if (!hasRole(m, min)) {
    throw new Forbidden(`Your role (${m.role}) cannot ${action}. Ask a studio ${min === 'owner' ? 'owner' : 'owner or editor'} for access.`, 'insufficient_role', { requiredRole: min, role: m.role })
  }
}

export function canSeeEvent(m: Membership, eventId: string): boolean {
  return m.role !== 'uploader' || m.eventIds.includes(eventId)
}

/** Uploaders get 404 (not 403) for events they aren't assigned to, so ids don't leak. */
export function assertEventVisible(m: Membership, eventId: string): void {
  if (!canSeeEvent(m, eventId)) throw new NotFound('Event', eventId)
}
