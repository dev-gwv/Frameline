import { and, eq } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { hmacSha256, toBase64Url } from '../lib/crypto'
import { STUDIO_AUTOPILOT } from './partner'

/**
 * Tells Studio AutoPilot that one of its projects' galleries changed, so its Gallery tab, its client page and
 * its "photos are ready" bell never show a stale PIN or count.
 *
 * Changes are queued in KV per event and sent by the minute cron, one call per gallery: uploads come in many
 * batches, so a photo change waits until uploading has been quiet for PHOTO_QUIET_SEC (never longer than
 * MAX_WAIT_SEC after the first), while a PIN change goes on the next tick. The call says only *which* project
 * changed and why; Studio AutoPilot reads the gallery back through its own signed API, so nothing in a notice
 * is trusted beyond "go and look". A failed call is retried with backoff and dropped after MAX_ATTEMPTS.
 */
/** status: archived, restored, moved to the trash or deleted for good (Studio AutoPilot then reads it back, or gets a 404). */
export type NoticeReason = 'photos' | 'pin' | 'settings' | 'status'

const PREFIX = 'sa-out:'
const PHOTO_QUIET_SEC = 120
const MAX_WAIT_SEC = 600
const MAX_ATTEMPTS = 8
const TIMEOUT_MS = 10_000

interface Pending { key: string; reasons: NoticeReason[]; first: number; due: number; attempts: number }

/** Queues a notice for an event, if Studio AutoPilot made it. Never throws: a notice is never worth failing a request. */
export async function queuePartnerNotice(env: Env, eventId: string, reason: NoticeReason): Promise<void> {
  try {
    if (!env.STUDIOAUTOPILOT_WEBHOOK_URL) return
    const l = schema.partnerLinks
    const [row] = await getDb(env.DB).select({ key: l.externalId }).from(l)
      .where(and(eq(l.provider, STUDIO_AUTOPILOT), eq(l.kind, 'event'), eq(l.localId, eventId))).limit(1)
    if (!row) return
    const now = Math.floor(Date.now() / 1000)
    const old = await env.KV.get<Pending>(PREFIX + eventId, 'json')
    const first = old?.first ?? now
    // Photos push the send back while uploads keep coming (capped); anything else, or a PIN already waiting, goes now.
    const photosOnly = !old || old.reasons.every((r) => r === 'photos')
    const due = reason === 'photos' && photosOnly ? Math.min(now + PHOTO_QUIET_SEC, first + MAX_WAIT_SEC) : Math.min(now, old?.due ?? now)
    const next: Pending = { key: row.key, first, attempts: 0, reasons: [...new Set([...(old?.reasons ?? []), reason])], due }
    await env.KV.put(PREFIX + eventId, JSON.stringify(next), { expirationTtl: 86_400 })
  } catch { /* best effort */ }
}

/** The bearer token on a notice: ours, for Studio AutoPilot, one minute. */
export async function signNoticeToken(secret: string, companyId: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const enc = (o: object) => toBase64Url(new TextEncoder().encode(JSON.stringify(o)))
  const head = enc({ alg: 'HS256', typ: 'JWT' })
  const body = enc({ iss: 'frameline', aud: STUDIO_AUTOPILOT, purpose: 'notice', cid: companyId, jti: crypto.randomUUID(), iat: now, exp: now + 60 })
  return `${head}.${body}.${toBase64Url(await hmacSha256(secret, `${head}.${body}`))}`
}

/** Minute cron: sends the notices that are due. Returns how many were delivered. */
export async function sendPartnerNotices(env: Env, fetchImpl: typeof fetch = fetch): Promise<number> {
  const url = env.STUDIOAUTOPILOT_WEBHOOK_URL
  const secret = env.STUDIOAUTOPILOT_SECRET
  if (!url || !secret || secret.length < 32) return 0
  const now = Math.floor(Date.now() / 1000)
  const listed = await env.KV.list({ prefix: PREFIX, limit: 200 })
  let sent = 0
  for (const k of listed.keys) {
    const p = await env.KV.get<Pending>(k.name, 'json')
    if (!p || p.due > now) continue
    const [companyId, ...rest] = p.key.split(':')
    const projectId = rest.join(':')
    let ok = false
    try {
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
      const res = await fetchImpl(url, {
        method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await signNoticeToken(secret, companyId, now)}` },
        body: JSON.stringify({ type: 'gallery.changed', companyId, projectId, reasons: p.reasons }),
      }).finally(() => clearTimeout(timer))
      // 404: Studio AutoPilot no longer knows the project. Nothing to retry.
      ok = res.ok || res.status === 404
    } catch { ok = false }
    if (ok) { await env.KV.delete(k.name); sent++; continue }
    const attempts = p.attempts + 1
    if (attempts >= MAX_ATTEMPTS) { await env.KV.delete(k.name); continue }
    await env.KV.put(k.name, JSON.stringify({ ...p, attempts, due: now + 60 * 2 ** attempts }), { expirationTtl: 86_400 })
  }
  return sent
}
