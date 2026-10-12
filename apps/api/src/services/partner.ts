import { and, asc, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { Conflict, Unauthorized } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import type { PartnerClaims } from '../lib/partner-token'
import { createStudio, normalizeEmail } from './provisioning'

/**
 * Studio AutoPilot as a partner: its companies are our studios, its people our users, its projects our events.
 * The ids are joined in `partner_links`; nothing here trusts a claim that did not arrive in a verified token.
 */
export const STUDIO_AUTOPILOT = 'studioautopilot'

type Kind = (typeof schema.partnerLinks.$inferSelect)['kind']
type UserRow = typeof schema.users.$inferSelect

export async function linkedId(db: DB, kind: Kind, externalId: string): Promise<string | null> {
  const l = schema.partnerLinks
  const [row] = await db.select({ id: l.localId }).from(l)
    .where(and(eq(l.provider, STUDIO_AUTOPILOT), eq(l.kind, kind), eq(l.externalId, externalId))).limit(1)
  return row?.id ?? null
}

/** Records a link, or returns the one a concurrent request recorded first. */
export async function link(db: DB, kind: Kind, externalId: string, localId: string): Promise<string> {
  await db.insert(schema.partnerLinks).values({ provider: STUDIO_AUTOPILOT, kind, externalId, localId, createdAt: nowIso() }).onConflictDoNothing().run()
  return (await linkedId(db, kind, externalId)) ?? localId
}

/** Spends a token's jti, so a sign-in link cannot be opened twice. */
export async function spendJti(kv: KVNamespace, claims: Pick<PartnerClaims, 'jti' | 'exp'>): Promise<void> {
  const key = `partner:${STUDIO_AUTOPILOT}:jti:${claims.jti}`
  if (await kv.get(key)) throw new Unauthorized('This link was already used. Open it again from Studio AutoPilot.', 'partner_token_used')
  // Kept past the token's own expiry (plus the 30 s leeway verify allows); KV's floor is 60 s.
  const ttl = Math.max(60, claims.exp - Math.floor(Date.now() / 1000) + 90)
  await kv.put(key, '1', { expirationTtl: ttl })
}

/** An address for someone whose email the partner has not confirmed: theirs to show, nobody's inbox. */
const placeholderEmail = (sub: string) => `sa-${sub.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64)}@users.studioautopilot.invalid`

/**
 * Our user for a Studio AutoPilot person, made on first sight.
 *
 * Matched by their Studio AutoPilot id, and by email only when Studio AutoPilot has confirmed they own it.
 * Its team logins may use any email at all -- "any email, even a made-up one, is only a username" -- so
 * an unconfirmed email matched against our users would hand a stranger's account to whoever typed it. Such a
 * person gets a placeholder address instead; they still sign in, only ever through Studio AutoPilot.
 */
export async function ensurePartnerUser(db: DB, claims: PartnerClaims): Promise<UserRow> {
  const u = schema.users
  const linked = await linkedId(db, 'user', claims.sub)
  if (linked) {
    const [user] = await db.select().from(u).where(eq(u.id, linked)).limit(1)
    if (user) {
      await db.update(u).set({ lastActiveAt: nowIso() }).where(eq(u.id, user.id)).run()
      return user
    }
  }

  const realEmail = claims.email_verified && claims.email.includes('@') ? normalizeEmail(claims.email) : null
  const email = realEmail ?? placeholderEmail(claims.sub)
  let [user] = await db.select().from(u).where(eq(u.email, email)).limit(1)
  if (!user) {
    await db.insert(u).values({
      id: newId('usr'), email, name: claims.name.trim() || claims.cname, emailVerifiedAt: realEmail ? nowIso() : null,
      createdAt: nowIso(), lastActiveAt: nowIso(),
    }).onConflictDoNothing().run()
    ;[user] = await db.select().from(u).where(eq(u.email, email)).limit(1)
  }
  const id = await link(db, 'user', claims.sub, user!.id)
  if (id !== user!.id) [user] = await db.select().from(u).where(eq(u.id, id)).limit(1)
  return user!
}

/**
 * The studio for a Studio AutoPilot company, and this person's place in it.
 *
 * Only the company's owner may set the studio up: Frameline is a paid add-on and its wallet is the owner's.
 * An owner who already runs a Frameline studio of their own (and no other company has claimed it) keeps it,
 * rather than being handed a second, empty one. Everyone after the owner joins as an editor.
 */
export async function ensurePartnerStudio(db: DB, claims: PartnerClaims, user: UserRow): Promise<string> {
  const m = schema.memberships
  let studioId = await linkedId(db, 'studio', claims.cid)

  if (!studioId) {
    if (claims.role !== 'owner') {
      throw new Conflict('Your studio’s owner needs to open the gallery from Studio AutoPilot once first.', 'partner_studio_not_set_up')
    }
    const owned = await db.select({ studioId: m.studioId }).from(m).where(and(eq(m.userId, user.id), eq(m.role, 'owner'))).orderBy(asc(m.createdAt))
    let adopt: string | null = null
    for (const o of owned) {
      const l = schema.partnerLinks
      const [claimed] = await db.select({ id: l.externalId }).from(l)
        .where(and(eq(l.provider, STUDIO_AUTOPILOT), eq(l.kind, 'studio'), eq(l.localId, o.studioId))).limit(1)
      if (!claimed) { adopt = o.studioId; break }
    }
    studioId = await link(db, 'studio', claims.cid, adopt ?? await createStudio(db, user.id, claims.cname, user.email))
  }

  const role = claims.role === 'owner' ? 'owner' : 'editor'
  const [mine] = await db.select().from(m).where(and(eq(m.studioId, studioId), eq(m.userId, user.id))).limit(1)
  if (!mine) {
    await db.insert(m).values({ id: newId('mem'), studioId, userId: user.id, role, eventIds: [], createdAt: nowIso() }).onConflictDoNothing().run()
  } else if (role === 'owner' && mine.role !== 'owner') {
    // Moving up follows Studio AutoPilot; moving down is left to the studio's own Team screen.
    await db.update(m).set({ role: 'owner' }).where(eq(m.id, mine.id)).run()
  } else if (mine.role === 'uploader') {
    // Anyone Studio AutoPilot lets open a gallery runs the studio's events, so at least an editor.
    await db.update(m).set({ role: 'editor', eventIds: [] }).where(eq(m.id, mine.id)).run()
  }
  return studioId
}

/** The link key for a project: scoped to its company so two companies' ids can never meet. */
export const projectKey = (claims: Pick<PartnerClaims, 'cid'>, projectId: string) => `${claims.cid}:${projectId}`
