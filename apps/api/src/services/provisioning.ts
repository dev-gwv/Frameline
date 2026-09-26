import { and, eq, gt, isNull } from 'drizzle-orm'
import { createSeed } from '@frameline/shared'
import type { DB } from '../db/client'
import { schema } from '../db/client'
import { newId, nowIso } from '../lib/ids'
import { toMinor } from '../lib/money'

type UserRow = typeof schema.users.$inferSelect

export const normalizeEmail = (e: string) => e.trim().toLowerCase()

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'studio'
}

function followCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return `FA-${Array.from(buf, (b) => A[b % A.length]).join('')}`
}

/** Creates a studio with sensible defaults (watermark, website, prices) and makes `userId` its owner. */
export async function createStudio(db: DB, userId: string, name: string, email: string): Promise<string> {
  const id = newId('st')
  const now = nowIso()
  const base = slugify(name)
  let handle = base
  for (let i = 0; i < 5; i++) {
    const [taken] = await db.select({ id: schema.studios.id }).from(schema.studios).where(eq(schema.studios.handle, handle)).limit(1)
    if (!taken) break
    handle = `${base}-${Math.floor(Math.random() * 9000 + 1000)}`
  }
  const defaults = createSeed()
  await db.batch([
    db.insert(schema.studios).values({
      id, name, handle, email, followCode: followCode(), createdAt: now,
      validTill: new Date(Date.now() + 14 * 86_400_000).toISOString(), planId: 'starter', photosLimit: 50_000,
    }),
    db.insert(schema.memberships).values({ id: newId('mem'), studioId: id, userId, role: 'owner', eventIds: [], createdAt: now }),
    db.insert(schema.watermarks).values({ studioId: id, settings: { ...defaults.watermark, text: name }, updatedAt: now }),
    db.insert(schema.websites).values({ studioId: id, published: false, template: 'editorial', headline: '', sections: defaults.website.sections, updatedAt: now }),
    db.insert(schema.prices).values(defaults.prices.map((p, i) => ({ studioId: id, id: p.id, label: p.label, detail: p.detail, pricePaise: toMinor(p.price), sortOrder: i }))),
  ])
  return id
}

/** Accepts every open invite for the email, turning each into a membership. Returns how many were accepted. */
export async function acceptInvites(db: DB, userId: string, email: string): Promise<number> {
  const inv = schema.teamInvites
  const open = await db.select().from(inv).where(and(eq(inv.email, email), isNull(inv.acceptedAt), gt(inv.expiresAt, nowIso())))
  for (const i of open) {
    await db.batch([
      db.insert(schema.memberships).values({ id: newId('mem'), studioId: i.studioId, userId, role: i.role, eventIds: i.eventIds, createdAt: nowIso() }).onConflictDoNothing(),
      db.update(inv).set({ acceptedAt: nowIso() }).where(eq(inv.id, i.id)),
    ])
  }
  return open.length
}

/**
 * Finds or creates the user for a verified email. New users accept pending invites; if they still
 * belong to no studio, a studio is created for them (self-serve photographer sign-up).
 */
export async function ensureUser(db: DB, rawEmail: string, opts: { name?: string; studioName?: string; googleSub?: string } = {}): Promise<{ user: UserRow; isNew: boolean }> {
  const email = normalizeEmail(rawEmail)
  const u = schema.users
  let [user] = await db.select().from(u).where(eq(u.email, email)).limit(1)
  let isNew = false
  if (!user) {
    const name = opts.name?.trim() || email.split('@')[0]
    const row = { id: newId('usr'), email, name, googleSub: opts.googleSub ?? null, emailVerifiedAt: nowIso(), createdAt: nowIso(), lastActiveAt: nowIso() }
    await db.insert(u).values(row).onConflictDoNothing().run()
    ;[user] = await db.select().from(u).where(eq(u.email, email)).limit(1)
    isNew = true
  } else {
    const patch: Partial<UserRow> = { lastActiveAt: nowIso() }
    if (!user.emailVerifiedAt) patch.emailVerifiedAt = nowIso()
    if (opts.googleSub && !user.googleSub) patch.googleSub = opts.googleSub
    await db.update(u).set(patch).where(eq(u.id, user.id)).run()
    user = { ...user, ...patch }
  }
  await acceptInvites(db, user.id, email)
  const [membership] = await db.select({ id: schema.memberships.id }).from(schema.memberships).where(eq(schema.memberships.userId, user.id)).limit(1)
  if (!membership) await createStudio(db, user.id, opts.studioName?.trim() || `${user.name}'s Studio`, email)
  return { user, isNew }
}
