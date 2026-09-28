import type { Camera, CameraUpload } from '@frameline/shared'

export const FTP_HOST = 'ftp.frameline.in'
export const FTP_PORT = '21'
export const MAX_CAMERAS = 10

export const MODE_LABEL: Record<Camera['mode'], string> = {
  'live-2k': 'Live · 2K',
  'review-first': 'Review first',
  originals: 'Originals',
}

export const MODE_HELP: Record<Camera['mode'], string> = {
  'live-2k': 'Guests see a 2K copy about 10 seconds after you shoot.',
  'review-first': 'Photos land in a private album until you approve them.',
  originals: 'Full-size files, for your archive. Counts twice toward your limit.',
}

/**
 * FTP details as text. The password is only known right after the camera is added or its
 * password is reset (the API stores a hash), so it is left out otherwise.
 */
export function credentialsText(cam: Camera, password?: string) {
  return [
    `Camera: ${cam.label}`,
    `Server: ${FTP_HOST}`,
    'Port: 21 (passive mode / PASV)',
    `Username: ${cam.ftpUser}`,
    password ? `Password: ${password}` : 'Password: (reset it in Frameline to see a new one)',
  ].join('\n')
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

/** What happened to an uploaded file, in words, given the camera's mode. */
export function uploadResult(u: CameraUpload, mode: Camera['mode']): { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (u.status === 'failed') return { label: u.error ? `failed · ${u.error}` : 'failed', tone: 'bad' }
  if (u.status === 'skipped') return { label: 'skipped (already uploaded)', tone: 'muted' }
  if (mode === 'review-first') return { label: 'waiting for review', tone: 'warn' }
  if (mode === 'originals') return { label: 'stored', tone: 'muted' }
  return { label: 'published', tone: 'ok' }
}

export function agoShort(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86_400)} d ago`
}

export type Brand = 'canon' | 'nikon' | 'sony' | 'fuji'
export const BRAND_LABEL: Record<Brand, string> = { canon: 'Canon', nikon: 'Nikon', sony: 'Sony', fuji: 'Fujifilm' }
/** Guess the brand from the camera's name ("Canon R6 · Aarav" → canon). */
export function brandOf(label: string): Brand | undefined {
  const l = label.toLowerCase()
  if (/canon|eos/.test(l)) return 'canon'
  if (/nikon|z ?\d|d\d{3}/.test(l)) return 'nikon'
  if (/sony|a7|a9|a1/.test(l)) return 'sony'
  if (/fuji|x-h|x-t|gfx/.test(l)) return 'fuji'
  return undefined
}
