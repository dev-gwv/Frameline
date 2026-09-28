import { useCallback } from 'react'
import { useToast } from '@frameline/ui'

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


/** Renders an SVG string to a PNG blob (white background) at `size` px. Rejects if the image can't be drawn. */
export function svgToPng(svg: string, size = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = size; c.height = size
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the PNG'))), 'image/png')
      } catch (e) { reject(e) } finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t make the PNG')) }
    img.src = url
  })
}

export function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "7 pm Sat", "10:30 am 4 Oct" for scheduled switches. */
export function switchTime(iso: string, now = Date.now()) {
  const d = new Date(iso)
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  const time = `${h}${m ? `:${String(m).padStart(2, '0')}` : ''} ${d.getHours() < 12 ? 'am' : 'pm'}`
  const days = (d.getTime() - now) / 86_400_000
  const day = days < 6 ? d.toLocaleDateString('en-IN', { weekday: 'short' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${time} ${day}`
}
