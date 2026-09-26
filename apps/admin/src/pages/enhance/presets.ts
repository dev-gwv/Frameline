import { ENHANCE_COST } from '@frameline/shared'

/** Credits charged per enhanced photo (debited by the API). */
export const COST = ENHANCE_COST

export interface Preset { id: string; label: string; filter: string; hint: string }

/** Preset ids are sent to api.enhancePhoto; the on-screen preview uses a CSS filter as an approximation. */
export const PRESETS: Preset[] = [
  { id: 'warm', label: 'Warm evening light', filter: 'sepia(.28) saturate(1.3) brightness(1.06) hue-rotate(-8deg)', hint: 'Golden-hour warmth, richer colour.' },
  { id: 'clean', label: 'Clean background', filter: 'contrast(1.12) saturate(.9) brightness(1.08)', hint: 'Removes clutter and evens out the backdrop.' },
  { id: 'skin', label: 'Soft skin retouch', filter: 'blur(.4px) brightness(1.06) saturate(1.05) contrast(.94)', hint: 'Smooths skin while keeping texture.' },
  { id: 'bw', label: 'Classic black & white', filter: 'grayscale(1) contrast(1.18) brightness(1.04)', hint: 'Deep blacks, film-like tones.' },
  { id: 'faces', label: 'Brighter faces', filter: 'brightness(1.16) contrast(1.04) saturate(1.1)', hint: 'Lifts shadows on faces only.' },
  { id: 'guests', label: 'Remove guests behind', filter: 'saturate(1.15) contrast(1.06) brightness(1.03)', hint: 'Erases people in the background.' },
]

/** A custom prompt maps to the closest look by keyword (preview only). */
export function filterForPrompt(prompt: string): string | undefined {
  const p = prompt.toLowerCase()
  if (!p.trim()) return undefined
  if (/black|white|mono|b&w/.test(p)) return PRESETS[3].filter
  if (/warm|glow|golden|sunset/.test(p)) return PRESETS[0].filter
  if (/bright|light|face|lift/.test(p)) return PRESETS[4].filter
  if (/skin|soft|smooth/.test(p)) return PRESETS[2].filter
  if (/cool|blue|cold/.test(p)) return 'saturate(1.1) hue-rotate(12deg) brightness(1.04)'
  return 'saturate(1.18) brightness(1.08) contrast(1.05)'
}

/** Variation used by "Try again" so each run looks slightly different. */
export const variation = (n: number) => (n === 0 ? '' : ` brightness(${(1 + ((n * 37) % 7 - 3) / 100).toFixed(2)}) saturate(${(1 + ((n * 53) % 9 - 4) / 100).toFixed(2)})`)
