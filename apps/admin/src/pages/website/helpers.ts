import { useCallback, useEffect, useState } from 'react'

/** Page-local persisted state (per browser). Falls back to memory if storage is blocked. */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
  }, [key, value])
  return [value, setValue] as const
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Copy + toast in one call. */
export function useCopy(toast: { success: (t: string, b?: string) => void; error: (t: string, b?: string) => void }) {
  return useCallback(async (text: string, what = 'Copied') => {
    if (await copyText(text)) toast.success(what)
    else toast.error('Couldn’t copy', 'Your browser blocked the clipboard. Select the text and copy it by hand.')
  }, [toast])
}

export const SITE_HOST = (handle: string) => `${handle}.frameline.in`

/** Readable text colour (black/white) on a brand colour. */
export function onColor(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#15120E' : '#FFFFFF'
}
