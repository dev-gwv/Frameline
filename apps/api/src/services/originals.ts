import type { Env } from '../env'
import type { schema } from '../db/client'
import { webCopyKey } from '../db/mappers'
import { AppError } from '../lib/errors'
import { downloadFile } from './drive'

type PhotoRow = Pick<typeof schema.photos.$inferSelect, 'r2Key' | 'storage' | 'driveFileId' | 'studioId' | 'webCopy'>

export interface OpenedFile {
  body: ReadableStream<Uint8Array>
  size: number
  contentType?: string
  /** The original couldn't be read from Drive, so this is the 2048 px web copy. */
  fallback?: boolean
}

/**
 * A photo's full-size file: from R2, or from the studio's Google Drive for `storage: drive`. When Drive can't give it
 * (disconnected, file deleted there, Google down) the web copy stands in, so guests and ZIPs still get the photo.
 * Null when there is nothing at all.
 */
export async function openOriginal(env: Env, r: PhotoRow, opts: { range?: string } = {}): Promise<OpenedFile | null> {
  if (!r.r2Key) return null
  if (r.storage !== 'drive' || !r.driveFileId) {
    const o = await env.MEDIA.get(r.r2Key)
    return o && { body: o.body, size: o.size, contentType: o.httpMetadata?.contentType }
  }
  try {
    const res = await downloadFile(env, r.studioId, r.driveFileId, opts)
    if (res.body) return { body: res.body, size: Number(res.headers.get('content-length') ?? 0), contentType: res.headers.get('content-type') ?? undefined }
  } catch (e) {
    if (!(e instanceof AppError)) throw e
    console.warn(JSON.stringify({ level: 'warn', msg: 'drive original unavailable', code: e.code, driveFileId: r.driveFileId }))
  }
  const web = r.webCopy ? await env.MEDIA.get(webCopyKey(r.r2Key)) : null
  return web && { body: web.body, size: web.size, contentType: 'image/jpeg', fallback: true }
}
