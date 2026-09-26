import { AwsClient } from 'aws4fetch'
import type { Env } from '../env'
import { AppError } from '../lib/errors'

/**
 * Multipart upload backends.
 * - `s3`: browser PUTs parts straight to R2 via presigned S3 URLs (production; needs R2 API token keys).
 * - `proxy`: parts are PUT to this Worker, which streams them into R2 through the binding (dev / no keys).
 */
export type UploadMode = 's3' | 'proxy'

export const PART_SIZE = 10 * 1024 * 1024 // 10 MiB (R2 minimum is 5 MiB for all but the last part)
export const PRESIGN_TTL_SEC = 3600

export function uploadMode(env: Env): UploadMode {
  return env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID ? 's3' : 'proxy'
}

function s3(env: Env) {
  const client = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' })
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}`
  const objectUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
  return { client, objectUrl }
}

const xmlTag = (xml: string, tag: string) => new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml)?.[1]
const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function storageError(action: string, status: number, body: string): AppError {
  console.error(JSON.stringify({ level: 'error', msg: `r2 ${action} failed`, status, body: body.slice(0, 500) }))
  return new AppError(502, 'storage_error', 'Bad gateway', `Storage could not ${action}. Try again.`)
}

export async function createMultipart(env: Env, mode: UploadMode, key: string, contentType: string): Promise<string> {
  if (mode === 'proxy') return (await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType } })).uploadId
  const { client, objectUrl } = s3(env)
  const res = await client.fetch(`${objectUrl(key)}?uploads`, { method: 'POST', headers: { 'Content-Type': contentType } })
  const text = await res.text()
  const id = xmlTag(text, 'UploadId')
  if (!res.ok || !id) throw storageError('start the upload', res.status, text)
  return id
}

/** Presigned UploadPart URL (s3 mode). */
export async function presignPart(env: Env, key: string, multipartId: string, partNumber: number): Promise<string> {
  const { client, objectUrl } = s3(env)
  const url = new URL(objectUrl(key))
  url.searchParams.set('partNumber', String(partNumber))
  url.searchParams.set('uploadId', multipartId)
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SEC))
  const signed = await client.sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } })
  return signed.url
}

export async function completeMultipart(env: Env, mode: UploadMode, key: string, multipartId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
  if (mode === 'proxy') {
    await env.MEDIA.resumeMultipartUpload(key, multipartId).complete(sorted)
    return
  }
  const { client, objectUrl } = s3(env)
  const xml = `<CompleteMultipartUpload>${sorted.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`
  const res = await client.fetch(`${objectUrl(key)}?uploadId=${encodeURIComponent(multipartId)}`, { method: 'POST', body: xml, headers: { 'Content-Type': 'application/xml' } })
  const text = await res.text()
  if (!res.ok || text.includes('<Error>')) throw storageError('finish the upload', res.status, text)
}

export async function abortMultipart(env: Env, mode: UploadMode, key: string, multipartId: string): Promise<void> {
  try {
    if (mode === 'proxy') await env.MEDIA.resumeMultipartUpload(key, multipartId).abort()
    else {
      const { client, objectUrl } = s3(env)
      await client.fetch(`${objectUrl(key)}?uploadId=${encodeURIComponent(multipartId)}`, { method: 'DELETE' })
    }
  } catch { /* already gone */ }
}

export function objectKey(studioId: string, eventId: string, photoId: string, filename: string): string {
  const safe = filename.normalize('NFKC').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'photo.jpg'
  return `studios/${studioId}/events/${eventId}/originals/${photoId}/${safe}`
}
