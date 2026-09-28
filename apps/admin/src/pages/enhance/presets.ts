import { ENHANCE_COST } from '@frameline/shared'

/** Rupees taken from the wallet (prepaid) per saved photo; the API debits the same ENHANCE_COST. */
export const COST = ENHANCE_COST

export interface Preset { id: string; label: string; filter: string; hint: string }

/** Preset ids are sent to api.enhancePhoto; the on-screen preview uses a CSS filter as an approximation. */
export const PRESETS: Preset[] = [
  { id: 'faces', label: 'Brighten faces', filter: 'brightness(1.16) contrast(1.04) saturate(1.1)', hint: 'Lifts shadows on faces only.' },
  { id: 'skin', label: 'Smooth skin', filter: 'blur(.4px) brightness(1.06) saturate(1.05) contrast(.94)', hint: 'Smooths skin while keeping texture.' },
  { id: 'distraction', label: 'Remove a distraction', filter: 'saturate(1.15) contrast(1.06) brightness(1.03)', hint: 'Erases people or clutter in the background.' },
  { id: 'warm', label: 'Warmer colours', filter: 'sepia(.28) saturate(1.3) brightness(1.06) hue-rotate(-8deg)', hint: 'Golden-hour warmth, richer colour.' },
]

/** A description maps to the closest look by keyword (preview only). */
export function filterForPrompt(prompt: string): string | undefined {
  const p = prompt.toLowerCase()
  if (!p.trim()) return undefined
  if (/black|white|mono|b&w/.test(p)) return 'grayscale(1) contrast(1.18) brightness(1.04)'
  if (/warm|glow|golden|sunset/.test(p)) return PRESETS[3].filter
  if (/bright|light|face|lift/.test(p)) return PRESETS[0].filter
  if (/skin|soft|smooth/.test(p)) return PRESETS[1].filter
  if (/cool|blue|cold/.test(p)) return 'saturate(1.1) hue-rotate(12deg) brightness(1.04)'
  return 'saturate(1.18) brightness(1.08) contrast(1.05)'
}
