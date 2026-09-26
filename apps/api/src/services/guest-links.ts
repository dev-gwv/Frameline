import { eq } from 'drizzle-orm'
import { cleanGuestLinkPayload, decodeGuestLink, guestLinkKind, type GuestLinkKind, type GuestLinkPayload } from '@frameline/shared'
import { getDb, schema } from '../db/client'
import { hmacSha256, randomInt, toBase64Url } from '../lib/crypto'
import { nowIso } from '../lib/ids'

/**
 * Signed short codes for personal links: `<id:8><sig:6>`, e.g. `/v/k3j9x0q2Ab_9zQ`.
 * The payload lives in D1 (guest_links); the signature stops code guessing from hitting the database.
 * Unsigned legacy tokens (base64url JSON, as the mock and early gallery builds produce) still resolve,
 * but their VIP flags are ignored because anyone could forge them.
 */
const ALNUM = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ID_LEN = 8
const SIG_LEN = 6

async function sign(secret: string, id: string) {
  return toBase64Url(await hmacSha256(secret, `guest-link:${id}`)).slice(0, SIG_LEN)
}

export async function createSignedLink(env: { DB: D1Database; JWT_SECRET: string }, studioId: string, eventId: string, payload: GuestLinkPayload, createdBy?: string) {
  let id = ''
  for (let i = 0; i < ID_LEN; i++) id += ALNUM[randomInt(ALNUM.length)]
  const clean = cleanGuestLinkPayload(payload)
  await getDb(env.DB).insert(schema.guestLinks).values({ id, studioId, eventId, payload: clean, createdBy: createdBy ?? null, createdAt: nowIso() }).run()
  const code = id + (await sign(env.JWT_SECRET, id))
  return { code, kind: guestLinkKind(clean), payload: clean }
}

export async function resolveLink(env: { DB: D1Database; JWT_SECRET: string }, code: string): Promise<{ kind: GuestLinkKind; payload: GuestLinkPayload; signed: boolean } | null> {
  if (code.length === ID_LEN + SIG_LEN) {
    const id = code.slice(0, ID_LEN)
    if ((await sign(env.JWT_SECRET, id)) === code.slice(ID_LEN)) {
      const [row] = await getDb(env.DB).select().from(schema.guestLinks).where(eq(schema.guestLinks.id, id)).limit(1)
      if (row) return { kind: guestLinkKind(row.payload), payload: row.payload, signed: true }
    }
  }
  const legacy = decodeGuestLink(code)
  if (!legacy) return null
  const { vip: _vip, ...rest } = legacy
  const payload = cleanGuestLinkPayload(rest)
  return { kind: 's', payload, signed: false }
}

