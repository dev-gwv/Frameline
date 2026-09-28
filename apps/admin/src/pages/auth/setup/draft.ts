import { useEffect, useState } from 'react'
import { DEMO_NOW, handleProblem, type PresetId, type Studio } from '@frameline/shared'
import { useApi } from '../../../lib/api'

export type StudioKind = 'photographer' | 'studio' | 'agency'
export const KINDS: { value: StudioKind; label: string }[] = [
  { value: 'photographer', label: 'A photographer' },
  { value: 'studio', label: 'A studio with a team' },
  { value: 'agency', label: 'An agency' },
]

/** Everything the wizard collects; saved to the studio / new event step by step. */
export interface SetupDraft {
  kind: StudioKind
  name: string
  city: string
  logoUrl?: string
  brandColor: string
  handle: string
  phone: string
  eventName: string
  eventDate: string
  eventCity: string
  preset: PresetId
}
export type Patch = (p: Partial<SetupDraft>) => void

export const BRAND_SWATCHES = ['#B8862B', '#1C1814', '#8E3B46', '#2F6B5E', '#3C5A99']
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const slug = (s: string) => s.toLowerCase().replace(/\b(studio|studios|photography|photos|films)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function draftFromStudio(s?: Studio): SetupDraft {
  return {
    kind: KINDS.some((k) => k.value === s?.studioType) ? (s!.studioType as StudioKind) : 'photographer',
    name: s?.name ?? '',
    city: s?.city ?? '',
    logoUrl: s?.logoUrl,
    brandColor: s?.brandColor && isHex(s.brandColor) ? s.brandColor : BRAND_SWATCHES[0],
    handle: s?.handle ?? '',
    phone: s?.phone ?? '',
    eventName: '',
    eventDate: isoDay(DEMO_NOW + 8 * 86_400_000),
    eventCity: s?.city ?? '',
    preset: 'private-family',
  }
}
/** Suggests a gallery address from the studio name ("Northlight Studio" → northlight). */
export const suggestHandle = (name: string) => slug(name)

export type HandleStatus = 'empty' | 'invalid' | 'checking' | 'available' | 'taken'

/**
 * Inline check for `<handle>.frameline.in` (api.checkHandle, debounced while typing): Checking → Available / Taken.
 * `taken` is a handle the API refused on save (409 `handle_taken`), shown as taken without asking again.
 */
export function useHandleCheck(handle: string, own?: string, taken?: string): HandleStatus {
  const api = useApi()
  const [status, setStatus] = useState<HandleStatus>('empty')
  useEffect(() => {
    const h = handle.trim().toLowerCase()
    if (!h) { setStatus('empty'); return }
    const bad = handleProblem(h)
    if (bad?.reason === 'invalid') { setStatus('invalid'); return }
    if (bad || h === taken) { setStatus('taken'); return }
    if (h === own) { setStatus('available'); return }
    setStatus('checking')
    let live = true
    const t = setTimeout(() => {
      api.checkHandle(h).then(
        (r) => { if (live) setStatus(r.available ? 'available' : r.reason === 'invalid' ? 'invalid' : 'taken') },
        // Can't check right now: let them go on; saving still answers 409 if it's taken.
        () => { if (live) setStatus('available') },
      )
    }, 400)
    return () => { live = false; clearTimeout(t) }
  }, [api, handle, own, taken])
  return status
}
