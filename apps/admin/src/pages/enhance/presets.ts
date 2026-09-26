import { useCallback, useEffect, useState } from 'react'

export const COST = 8

export interface Preset { id: string; label: string; filter: string; hint: string }

/** Each preset is previewed with a CSS filter until the image-edit model is wired. */
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

const SPENT_KEY = 'frameline.enhance.spentCredits'

/**
 * The API has no "debit credits" call yet, so credits spent on enhancements are
 * tracked locally and subtracted from the wallet balance for display.
 */
export function useSpentCredits() {
  const read = () => { try { return Number(localStorage.getItem(SPENT_KEY) ?? 0) || 0 } catch { return 0 } }
  const [spent, setSpent] = useState(read)
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === SPENT_KEY) setSpent(read()) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])
  const spend = useCallback((n: number) => {
    setSpent((s) => { const v = s + n; try { localStorage.setItem(SPENT_KEY, String(v)) } catch { /* ignore */ } return v })
  }, [])
  return { spent, spend }
}
