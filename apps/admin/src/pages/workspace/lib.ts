import { useSyncExternalStore } from 'react'
import { hash, type ID, type Photo, type PhotoEvent } from '@frameline/shared'

/* ---------------- Links ---------------- */

export const GALLERY_URL: string = import.meta.env.VITE_GALLERY_URL ?? 'http://localhost:5174'

/** Public gallery link shown to guests (no protocol, as printed on cards). */
export function galleryLink(ev: Pick<PhotoEvent, 'shortId' | 'name'>, short = true) {
  const id = ev.shortId.toLowerCase()
  return short ? `frameline.in/${id}` : `frameline.in/gallery/${id}/${slug(ev.name)}`
}
export const appLink = (ev: Pick<PhotoEvent, 'shortId'>) => `frameline.in/app?code=${ev.shortId.toLowerCase()}`
export const https = (s: string) => (s.startsWith('http') ? s : `https://${s}`)
export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/** Deterministic short token for personal links (the real API signs these server-side). */
export function linkToken(...parts: (string | number | boolean | undefined)[]) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let h = hash(parts.map(String).join('|'))
  let out = ''
  for (let i = 0; i < 5; i++) { out += alphabet[h % alphabet.length]; h = (Math.floor(h / alphabet.length) ^ hash(out + i)) >>> 0 }
  return out
}

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

/* ---------------- Covers (the mock only stores cover tones, so we remember which photo) ---------------- */

interface CoverRecord { event?: ID; albums: Record<ID, ID> }
const COVER_KEY = 'frameline.covers'
const coverListeners = new Set<() => void>()
let coverCache: Record<ID, CoverRecord> | null = null
function readCovers(): Record<ID, CoverRecord> {
  if (coverCache) return coverCache
  try { coverCache = JSON.parse(localStorage.getItem(COVER_KEY) ?? '{}') } catch { coverCache = {} }
  return coverCache!
}
export function rememberCover(eventId: ID, photoId: ID, scope: 'event' | 'album', albumId?: ID) {
  const all = { ...readCovers() }
  const rec: CoverRecord = { ...all[eventId], albums: { ...all[eventId]?.albums } }
  if (scope === 'event') rec.event = photoId
  else if (albumId) rec.albums = { ...rec.albums, [albumId]: photoId }
  all[eventId] = rec
  coverCache = all
  try { localStorage.setItem(COVER_KEY, JSON.stringify(all)) } catch { /* ignore */ }
  coverListeners.forEach((l) => l())
}
export function useCovers(eventId?: ID): CoverRecord {
  const all = useSyncExternalStore((cb) => { coverListeners.add(cb); return () => { coverListeners.delete(cb) } }, readCovers)
  return (eventId && all[eventId]) || EMPTY_COVER
}
const EMPTY_COVER: CoverRecord = { albums: {} }

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
