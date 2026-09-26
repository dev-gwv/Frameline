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
const KINDS: StudioKind[] = ['photographer', 'studio', 'agency']
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function draftFromStudio(s?: Studio): SetupDraft {
  return {
    kind: KINDS.includes(s?.studioType as StudioKind) ? (s!.studioType as StudioKind) : 'studio',
    city: s?.city ?? '',
    heard: s?.referralSource ?? '',
    name: s?.name ?? '',
    logoUrl: s?.logoUrl,
    coverUrl: s?.coverUrl,
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

/**
 * Format check for `<handle>.frameline.in`, debounced while typing. Whether the address is free is
 * decided by the API when saving (409 `handle_taken`); pass that handle as `taken` to show it here.
 */
export function useHandleCheck(handle: string, taken?: string): HandleStatus {
  const [status, setStatus] = useState<HandleStatus>('empty')
  useEffect(() => {
    const h = handle.trim()
    if (!h) { setStatus('empty'); return }
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(h)) { setStatus('invalid'); return }
    if (taken && h === taken) { setStatus('taken'); return }
    setStatus('checking')
    const t = setTimeout(() => setStatus('available'), 300)
    return () => clearTimeout(t)
  }, [handle, taken])
  return status
}
