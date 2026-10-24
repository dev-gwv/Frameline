import type { Env } from '../env'
import { guestPhotoOut, photoOut, webCopyKey } from '../db/mappers'
import type { schema } from '../db/client'
import { hmacSha256, timingSafeEqual, toBase64Url } from './crypto'

/**
 * Photo files are served by /v1/media only with a signature, and only the API hands one out: the studio's
 * API for every file of its photos, the guest API for just the files a gallery gives guests (the web copy,
 * and the original only when the gallery offers full-size downloads). Addresses alone used to be enough, and
 * an original's address can be worked out from its web copy's, so guests could take full-size, unwatermarked
 * files the studio never offered.
 *
 * A guest signature also works only while guests can see the photo -- not hidden, in the trash, waiting for
 * (or failed) review, or still processing.
 *
 * Signatures last a day, rounded to the hour so a page of thumbnails keeps the same URLs (and the browser
 * cache) while people scroll.
 */
const TTL_SEC = 24 * 3600

type PhotoRow = typeof schema.photos.$inferSelect
export type MediaScope = 'studio' | 'guest'

export const guestCanSee = (r: Pick<PhotoRow, 'hidden' | 'deletedAt' | 'reviewStatus' | 'status'>) =>
  !r.hidden && !r.deletedAt && r.status === 'ready' && (!r.reviewStatus || r.reviewStatus === 'approved')

const sigOf = async (secret: string, key: string, exp: number, scope: MediaScope) =>
  toBase64Url(await hmacSha256(secret, `${scope === 'guest' ? 'guest-media' : 'media'}:${key}:${exp}`)).slice(0, 27)

export async function signMediaKey(secret: string, key: string, now = Date.now(), scope: MediaScope = 'studio'): Promise<string> {
  const exp = Math.ceil(now / 3_600_000) * 3600 + TTL_SEC
  return `exp=${exp}&sig=${await sigOf(secret, key, exp, scope)}`
}

export async function verifyMediaSig(secret: string, key: string, exp: string | undefined, sig: string | undefined, now = Date.now(), scope: MediaScope = 'studio'): Promise<boolean> {
  const e = Number(exp)
  if (!sig || !Number.isFinite(e) || e * 1000 < now) return false
  return timingSafeEqual(await sigOf(secret, key, e, scope), sig)
}

/** Adds a signature to a /v1/media address; other addresses (a CDN base, external URLs) stay as they are. */
const signed = async (env: Env, url: string | undefined, key: string, scope: MediaScope) =>
  url?.startsWith('/v1/media/') ? `${url}?${await signMediaKey(env.JWT_SECRET, key, Date.now(), scope)}` : url

/** Signs a photo's url and webUrl (each for its own file). */
async function signPhoto<T extends { url?: string; webUrl?: string }>(env: Env, out: T, r: PhotoRow, scope: MediaScope): Promise<T> {
  if (!r.r2Key) return out
  const web = webCopyKey(r.r2Key)
  const url = await signed(env, out.url, out.url && out.url === out.webUrl ? web : r.r2Key, scope)
  const webUrl = await signed(env, out.webUrl, web, scope)
  return { ...out, ...(url ? { url } : {}), ...(webUrl ? { webUrl } : {}) }
}

/** The studio's view of a photo: like photoOut, with signed URLs. */
export const studioPhotoOut = (env: Env, r: PhotoRow) => signPhoto(env, photoOut(r, env.PUBLIC_MEDIA_BASE), r, 'studio')

export const studioPhotosOut = (env: Env, rows: PhotoRow[]) => Promise.all(rows.map((r) => studioPhotoOut(env, r)))

/** A guest's view of photos (see guestPhotoOut), signed for guests. */
export const guestPhotosOut = (env: Env, rows: PhotoRow[], fullSize: boolean) =>
  Promise.all(rows.map((r) => signPhoto(env, guestPhotoOut(r, env.PUBLIC_MEDIA_BASE, fullSize), r, 'guest')))
