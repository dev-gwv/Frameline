import type { Env } from '../env'
import { photoOut, webCopyKey } from '../db/mappers'
import type { schema } from '../db/client'
import { hmacSha256, timingSafeEqual, toBase64Url } from './crypto'

/**
 * Photos a guest may not see -- hidden, in the trash, waiting for (or failed) review, still processing -- are
 * served by /v1/media only with a signature, and only the studio's own API hands one out. Their address used
 * to be enough: a guest who had once opened a photo kept it for a year after the studio hid it.
 *
 * Signatures last a day, rounded to the hour so a page of thumbnails keeps the same URLs (and the browser
 * cache) while the studio scrolls.
 */
const TTL_SEC = 24 * 3600

type PhotoRow = typeof schema.photos.$inferSelect

export const guestCanSee = (r: Pick<PhotoRow, 'hidden' | 'deletedAt' | 'reviewStatus' | 'status'>) =>
  !r.hidden && !r.deletedAt && r.status === 'ready' && (!r.reviewStatus || r.reviewStatus === 'approved')

const sigOf = async (secret: string, key: string, exp: number) => toBase64Url(await hmacSha256(secret, `media:${key}:${exp}`)).slice(0, 27)

export async function signMediaKey(secret: string, key: string, now = Date.now()): Promise<string> {
  const exp = Math.ceil(now / 3_600_000) * 3600 + TTL_SEC
  return `exp=${exp}&sig=${await sigOf(secret, key, exp)}`
}

export async function verifyMediaSig(secret: string, key: string, exp: string | undefined, sig: string | undefined, now = Date.now()): Promise<boolean> {
  const e = Number(exp)
  if (!sig || !Number.isFinite(e) || e * 1000 < now) return false
  return timingSafeEqual(await sigOf(secret, key, e), sig)
}

/** The studio's view of a photo: like photoOut, with a signed URL when guests can't see it. */
export async function studioPhotoOut(env: Env, r: PhotoRow) {
  const out = photoOut(r, env.PUBLIC_MEDIA_BASE)
  if (out.url && r.r2Key && !guestCanSee(r) && out.url.startsWith('/v1/media/')) {
    out.url = `${out.url}?${await signMediaKey(env.JWT_SECRET, r.r2Key)}`
    if (out.webUrl) out.webUrl = `${out.webUrl}?${await signMediaKey(env.JWT_SECRET, webCopyKey(r.r2Key))}`
  }
  return out
}

export const studioPhotosOut = (env: Env, rows: PhotoRow[]) => Promise.all(rows.map((r) => studioPhotoOut(env, r)))
