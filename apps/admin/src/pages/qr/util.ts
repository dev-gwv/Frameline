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

/**
 * Reads an image file as a data URL small enough for the API's string limits (QR logo and
 * broadcast image: 4096 chars; watermark logo: 2048). Downscales and re-encodes until it fits.
 * Stand-in until the API has an image upload endpoint.
 */
export async function imageDataUrl(file: File, maxChars: number, opts: { keepAlpha?: boolean } = {}): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Couldn’t read that file. Try another image.'))
    r.readAsDataURL(file)
  })
  if (src.length <= maxChars) return src
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('That image couldn’t be opened. Try a PNG or JPG.'))
    i.src = src
  })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser couldn’t resize the image.')
  const types = opts.keepAlpha ? ['image/webp', 'image/png'] : ['image/webp', 'image/jpeg']
  for (const side of [320, 240, 180, 128, 96, 64, 48, 32]) {
    const k = Math.min(1, side / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * k))
    canvas.height = Math.max(1, Math.round(img.height * k))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const type of types) {
      for (const q of type === 'image/png' ? [1] : [0.8, 0.6, 0.4]) {
        const out = canvas.toDataURL(type, q)
        if (out.startsWith(`data:${type}`) && out.length <= maxChars) return out
      }
    }
  }
  throw new Error('That image is too detailed to use here. Try a simpler, smaller image.')
}
