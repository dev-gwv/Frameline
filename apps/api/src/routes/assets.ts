import { createRoute, z } from '@hono/zod-openapi'
import { ASSET_RULES } from '@frameline/shared'
import { getDb, schema } from '../db/client'
import { mediaUrl } from '../db/mappers'
import { AppError, PayloadTooLarge } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { IdempotencyHeader, createRouter, json, problems, security } from '../lib/openapi'
import { membershipOf, requireStudio } from '../middleware/auth'
import { idempotent } from '../middleware/idempotency'
import { Asset, AssetKind } from '../schemas/domain'
import { audit } from '../services/audit'

export const assetRoutes = createRouter()

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }

/** Absolute media URL (https in production) for an R2 key. */
export function assetUrl(c: { env: { PUBLIC_MEDIA_BASE?: string; API_PUBLIC_URL?: string }; req: { url: string } }, key: string) {
  if (c.env.PUBLIC_MEDIA_BASE) return mediaUrl(key, c.env.PUBLIC_MEDIA_BASE)
  return `${(c.env.API_PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '')}${mediaUrl(key)}`
}

assetRoutes.openapi(createRoute({
  method: 'post', path: '/assets', tags: ['Studio'], summary: 'Upload an image or document (logo, cover, watermark logo, broadcast image, QR logo, KYC document)',
  description: 'Send the raw file as the request body with its Content-Type. Images (JPG, PNG, WebP, GIF) and documents (PDF, JPG, PNG) up to 10 MB. Returns a URL to store in the matching field (`logoUrl`, `coverUrl`, `imageUrl`…); KYC documents attach via `updateStoreSettings` with `documents[].assetId`.',
  security, middleware: [requireStudio('editor', 'upload files'), idempotent] as const,
  request: { headers: IdempotencyHeader, query: z.object({ kind: AssetKind, filename: z.string().trim().min(1).max(200) }) },
  responses: { 201: json(Asset, 'Uploaded'), ...problems(401, 403, 413, 415, 422) },
}), async (c) => {
  const m = membershipOf(c)
  const { kind, filename } = c.req.valid('query')
  const rule = ASSET_RULES[kind]
  const contentType = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!rule.types.includes(contentType)) {
    throw new AppError(415, 'unsupported_media_type', 'Unsupported media type', `Upload a ${rule.types.map((t) => EXT[t].toUpperCase()).join(', ')} file.`)
  }
  const declared = Number(c.req.header('content-length') ?? 0)
  if (declared > rule.maxBytes) throw new PayloadTooLarge(rule.maxBytes)
  const bytes = await c.req.arrayBuffer()
  if (bytes.byteLength > rule.maxBytes) throw new PayloadTooLarge(rule.maxBytes)
  if (bytes.byteLength === 0) throw new AppError(422, 'empty_file', 'Empty file', 'The file is empty.')
  const id = newId('as')
  const key = `studios/${m.studioId}/assets/${kind}/${id}.${EXT[contentType]}`
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { fileName: filename } })
  const row = { id, studioId: m.studioId, kind, key, contentType, size: bytes.byteLength, fileName: filename, createdBy: c.get('user')?.id ?? null, createdAt: nowIso() }
  await getDb(c.env.DB).insert(schema.assets).values(row).run()
  audit(c, 'asset.upload', { type: 'asset', id }, { kind, size: row.size })
  return c.json({ id, kind, url: assetUrl(c, key), contentType, size: row.size, fileName: filename, createdAt: row.createdAt }, 201)
})
