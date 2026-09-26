import type { Photo, PhotoEvent } from '@frameline/shared'

/* ---------------- Links ---------------- */

/** Guest gallery origin (apps/gallery). */
export const GALLERY_URL: string = (import.meta.env.VITE_GALLERY_URL ?? 'http://localhost:5174').replace(/\/$/, '')

/** Public gallery link guests open. The long form carries the event name for people who read links before tapping. */
export function galleryLink(ev: Pick<PhotoEvent, 'shortId' | 'name'>, short = true) {
  const base = `${GALLERY_URL}/${ev.shortId}`
  return short ? base : `${base}?e=${slug(ev.name)}`
}
export const appLink = (ev: Pick<PhotoEvent, 'shortId'>) => `https://frameline.in/app?code=${ev.shortId.toLowerCase()}`
/** A link without its protocol, for display and printing. */
export const displayUrl = (u: string) => u.replace(/^https?:\/\//, '')
export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/* ---------------- Clipboard & downloads ---------------- */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for insecure contexts / denied permission: select a hidden textarea.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch { return false }
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ---------------- Object URLs created in this browser session ---------------- */

const sessionUrls = new Set<string>()
export function objectUrl(file: Blob) { const u = URL.createObjectURL(file); sessionUrls.add(u); return u }
/** Blob URLs persisted by the mock die on reload; only use ones created in this session. */
export const liveUrl = (url?: string) => (!url ? undefined : url.startsWith('blob:') && !sessionUrls.has(url) ? undefined : url)

/* ---------------- Misc ---------------- */

export const SOURCE_LABEL: Record<Photo['source'], string> = {
  web: 'Web upload', camera: 'Camera sync', drive: 'Google Drive', guest: 'Guest upload', desktop: 'Desktop uploader',
}

export function captureRange(first?: string, last?: string) {
  if (!first || !last) return ''
  const a = new Date(first), b = new Date(last)
  const d = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
  const t = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
  if (a.toDateString() === b.toDateString()) return `${d.format(a)}, ${t.format(a)} – ${t.format(b)}`
  return `${d.format(a)}, ${t.format(a)} – ${d.format(b)}, ${t.format(b)}`
}
