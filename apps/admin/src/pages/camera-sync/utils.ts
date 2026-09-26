import { hash, type Camera } from '@frameline/shared'

export const FTP_HOST = 'ftp.frameline.in'
export const FTP_PORT = '21 · passive (PASV)'
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
 * The API does not expose FTP passwords yet, so the screen derives a stable
 * one from the camera id. Replace with the real credential once the API returns it.
 */
export function cameraPassword(id: string) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let h = hash(`frameline-ftp:${id}`)
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += alphabet[h % alphabet.length]
    h = hash(out + id + i)
  }
  return out
}

export function credentialsText(cam: Camera) {
  return [
    `Camera: ${cam.label}`,
    `Server: ${FTP_HOST}`,
    'Port: 21 (passive mode / PASV)',
    `Username: ${cam.ftpUser}`,
    `Password: ${cameraPassword(cam.id)}`,
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

export interface LogLine { id: string; at: number; file: string; sizeMb: number; result: 'published' | 'waiting for review' | 'stored' }

const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

/** Next filename in the camera's sequence: IMG_4172.JPG → IMG_4173.JPG. */
export function nextFile(prev?: string) {
  if (!prev) return 'IMG_0001.JPG'
  const m = prev.match(/^(.*?)(\d+)(\.\w+)$/)
  if (!m) return `${prev}_1`
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}${m[3]}`
}

export function prevFile(file: string, back: number) {
  const m = file.match(/^(.*?)(\d+)(\.\w+)$/)
  if (!m) return file
  return `${m[1]}${String(Math.max(0, Number(m[2]) - back)).padStart(m[2].length, '0')}${m[3]}`
}

export const resultFor = (mode: Camera['mode']): LogLine['result'] => (mode === 'review-first' ? 'waiting for review' : mode === 'originals' ? 'stored' : 'published')

/** A believable recent history for a camera, ending at its last file. */
export function seedLog(cam: Camera, now: number): LogLine[] {
  if (!cam.lastFile || cam.today === 0) return []
  const n = Math.min(6, cam.today)
  const gap = cam.status === 'receiving' ? 8_000 : 60_000
  const start = cam.status === 'receiving' ? now - 8_000 : now - 12 * 60_000
  return Array.from({ length: n }, (_, i) => ({
    id: `${cam.id}-seed-${i}`,
    at: start - i * gap,
    file: prevFile(cam.lastFile!, i),
    sizeMb: 10.4 + ((hash(cam.id + i) % 18) / 10),
    result: resultFor(cam.mode),
  }))
}

export function agoShort(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}
