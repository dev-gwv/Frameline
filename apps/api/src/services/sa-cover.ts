import { and, count, eq, isNull } from 'drizzle-orm'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import type { PartnerClaims } from '../lib/partner-token'

/**
 * Studio AutoPilot's cover (owner, 17 Nov): its Pro and Studio Max plans, and its trial, include Google Drive
 * imports here and the galleries made from them, up to a number of photos kept. Studio AutoPilot sends the cover
 * with every token it signs (`cover` in lib/partner-token.ts); the studio keeps the last one it was told.
 *
 * While a studio is covered, a Drive import counts against the cover (photos kept: deleting frees room) and never
 * against Frameline's own quota or trial; uploads from a computer or phone stay on Frameline's own plan. More room
 * is bought from the team on WhatsApp: Studio AutoPilot then sends a bigger number.
 */

export interface Cover {
  plan: string
  until: string
  photos: number
  /** Covered photos kept now (copies share a file and are not counted twice). */
  used: number
  /** The cover has not ended. */
  active: boolean
}

/** Saves what a token says the studio's plan covers. A token that says nothing leaves the last cover as it was. */
export async function saveCover(db: DB, studioId: string, claims: Pick<PartnerClaims, 'cover'>): Promise<void> {
  if (!('cover' in claims) || claims.cover === undefined) return
  const c = claims.cover
  await db.update(schema.studios)
    .set(c ? { saCoverPlan: c.plan, saCoverUntil: c.until, saCoverPhotos: c.photos } : { saCoverPlan: null, saCoverUntil: null, saCoverPhotos: 0 })
    .where(eq(schema.studios.id, studioId)).run()
}

/** Covered photos the studio keeps now. */
export async function coveredUsed(db: DB, studioId: string): Promise<number> {
  const p = schema.photos
  const [r] = await db.select({ n: count() }).from(p)
    .where(and(eq(p.studioId, studioId), eq(p.covered, true), isNull(p.deletedAt), isNull(p.copiedFrom)))
  return r?.n ?? 0
}

/** The studio's cover, or null when Studio AutoPilot never sent one (or it covers nothing). */
export async function coverOf(db: DB, studioId: string, now = Date.now()): Promise<Cover | null> {
  const s = schema.studios
  const [row] = await db.select({ plan: s.saCoverPlan, until: s.saCoverUntil, photos: s.saCoverPhotos }).from(s).where(eq(s.id, studioId)).limit(1)
  if (!row?.plan || !row.until) return null
  return { plan: row.plan, until: row.until, photos: row.photos, used: await coveredUsed(db, studioId), active: Date.parse(row.until) > now }
}

/** "Your Studio AutoPilot Pro plan includes 25,000 photos in Google Drive galleries and 24,800 are used." */
export function coverFullMessage(c: Pick<Cover, 'plan' | 'photos' | 'used'>, wanted: number): string {
  const n = (x: number) => x.toLocaleString('en-IN')
  return `Your Studio AutoPilot ${c.plan} plan includes ${n(c.photos)} photos in Google Drive galleries and ${n(c.used)} are used, `
    + `so ${n(wanted)} more won’t fit. Delete an old gallery to make room, or ask us for more on WhatsApp.`
}
