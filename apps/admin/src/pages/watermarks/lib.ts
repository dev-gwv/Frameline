import { useCallback, useEffect, useState } from 'react'
import type { WatermarkSettings } from '@frameline/shared'

/** Fonts offered for the watermark. Fraunces and Manrope are already loaded by the app. */
export const FONTS = ['Fraunces', 'Manrope', 'PT Serif', 'Libre Baskerville', 'Abril Fatface'] as const

export const fontStack = (font: string) => {
  const serif = font === 'Manrope' ? 'system-ui, sans-serif' : 'Georgia, serif'
  return `"${font}", ${serif}`
}

const EXTRA_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Libre+Baskerville:wght@400;700&family=PT+Serif:wght@400;700&display=swap'

/** Injects the extra watermark fonts once (page-local; the app shell only loads the UI fonts). */
export function useWatermarkFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-fl-watermark-fonts]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = EXTRA_FONTS_HREF
    link.dataset.flWatermarkFonts = '1'
    document.head.appendChild(link)
  }, [])
}

/** Watermark text height as a share of photo width (cqw), per size choice. */
export const TEXT_SIZE: Record<WatermarkSettings['size'], number> = { subtle: 3.2, normal: 4.6, bold: 6.6 }
/** Logo width as a share of photo width (cqw), per size choice. */
export const LOGO_SIZE: Record<WatermarkSettings['size'], number> = { subtle: 12, normal: 18, bold: 27 }

/** The form edits WatermarkSettings directly (six positions: top/bottom × left/centre/right). */
export type WmPosition = WatermarkSettings['position']
export type WmDraft = WatermarkSettings

export const POSITIONS: { value: WmPosition; label: string }[] = [
  { value: 'tl', label: 'Top left' },
  { value: 'tc', label: 'Top' },
  { value: 'tr', label: 'Top right' },
  { value: 'bl', label: 'Bottom left' },
  { value: 'bc', label: 'Bottom' },
  { value: 'br', label: 'Bottom right' },
]

export const SIZES: { value: WatermarkSettings['size']; label: string }[] = [
  { value: 'subtle', label: 'Small' },
  { value: 'normal', label: 'Medium' },
  { value: 'bold', label: 'Large' },
]

/**
 * useState persisted to localStorage. Writes can fail (quota, private mode):
 * `persisted` is false then and the value lives for this session only.
 */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...(JSON.parse(raw) as T) } : initial
    } catch { return initial }
  })
  const [persisted, setPersisted] = useState(true)
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      try { localStorage.setItem(key, JSON.stringify(v)); setPersisted(true) } catch { setPersisted(false) }
      return v
    })
  }, [key])
  return [value, set, persisted] as const
}

export function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Couldn’t read that file'))
    r.readAsDataURL(file)
  })
}

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`

export const isEditableTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
