import { useEffect, useState } from 'react'
import { DEMO_NOW, type EventType, type PresetId, type Studio } from '@frameline/shared'

export type StudioKind = 'photographer' | 'studio' | 'agency'

/** Everything the wizard collects; saved to the studio / new event step by step. */
export interface SetupDraft {
  kind: StudioKind
  city: string
  heard: string
  name: string
  logoUrl?: string
  coverUrl?: string
  brandColor: string
  handle: string
  phone: string
  instagram: string
  eventName: string
  eventDate: string
  eventType: EventType
  preset: PresetId
}
export type Patch = (p: Partial<SetupDraft>) => void

export const BRAND_SWATCHES = ['#B37C22', '#1F3A5F', '#8C2F39', '#2F5D50', '#1B1712', '#6B4F7A']
export const HEARD_OPTIONS = ['Instagram', 'A friend or another photographer', 'Google search', 'YouTube', 'A guest gallery I saw', 'Other']
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: 'Wedding', engagement: 'Engagement', couple: 'Couple shoot', family: 'Family', baby: 'Baby shoot', birthday: 'Birthday',
  corporate: 'Corporate', school: 'School', sports: 'Sports', product: 'Product', 'real-estate': 'Real estate', themed: 'Themed', other: 'Other',
}
export const TAKEN_HANDLES = ['studio', 'photos', 'admin']
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function draftFromStudio(s?: Studio): SetupDraft {
  return {
    kind: 'studio',
    city: s?.city ?? '',
    heard: '',
    name: s?.name ?? '',
    logoUrl: s?.logoUrl,
    brandColor: s?.brandColor ?? BRAND_SWATCHES[2],
    handle: s?.handle ?? '',
    phone: s?.phone ?? '',
    instagram: s?.instagram ?? '',
    eventName: '',
    eventDate: isoDay(DEMO_NOW + 8 * 86_400_000),
    eventType: 'wedding',
    preset: 'private-family',
  }
}

export type HandleStatus = 'empty' | 'invalid' | 'checking' | 'available' | 'taken'

/** Debounced (simulated) availability check for `<handle>.frameline.in`. */
export function useHandleCheck(handle: string): HandleStatus {
  const [status, setStatus] = useState<HandleStatus>('empty')
  useEffect(() => {
    const h = handle.trim()
    if (!h) { setStatus('empty'); return }
    if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(h)) { setStatus('invalid'); return }
    setStatus('checking')
    const t = setTimeout(() => setStatus(TAKEN_HANDLES.includes(h) ? 'taken' : 'available'), 450)
    return () => clearTimeout(t)
  }, [handle])
  return status
}
