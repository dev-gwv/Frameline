import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@frameline/ui'

/** State mirrored to localStorage (used where the API has no endpoint yet). */
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
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Copy with a toast that says what was copied. */
export function useCopy() {
  const toast = useToast()
  return useCallback(async (text: string, what: string) => {
    if (await copyText(text)) toast.success(`${what} copied`)
    else toast.error('Couldn’t copy', 'Your browser blocked the clipboard. Select the text and copy it by hand.')
  }, [toast])
}

export function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Serialises the first <svg> inside an element so it can be downloaded. */
export function svgMarkup(el: HTMLElement | null) {
  const svg = el?.querySelector('svg')
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return clone.outerHTML
}
