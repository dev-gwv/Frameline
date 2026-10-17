import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { newId, nowIso } from '../lib/ids'
import { hmacSha256, timingSafeEqual, toBase64Url } from '../lib/crypto'
import { getMailer } from './mailer'

/**
 * Our side of the support desk: where a ticket goes when a person must take over, and how their reply comes back.
 *
 * - Out: a row in the support Google Sheet (an Apps Script web app at SUPPORT_SHEET_URL, see
 *   docs/support-sheet.gs) and an email to SUPPORT_INBOX. A studio writing again on a ticket that is with our
 *   team adds a note to the same row and emails again.
 * - Back: the Sheet's script posts each reply to POST /v1/integrations/support/reply (applySheetReply): the reply
 *   lands in the studio's ticket and the studio gets an email.
 * - Every morning: one email to SUPPORT_INBOX listing what is still open, oldest first (supportDigest).
 *
 * Every step is best effort: a Sheet or inbox that is down never fails the studio's request, and the ticket keeps
 * its state so the next notice or the morning email still shows it.
 */
type Ticket = typeof schema.tickets.$inferSelect

const adminUrl = (env: Env, ticketId: string) => `${env.APP_URL.replace(/\/$/, '')}/support?ticket=${encodeURIComponent(ticketId)}`

async function postSheet(env: Env, payload: Record<string, unknown>): Promise<boolean> {
  if (!env.SUPPORT_SHEET_URL || !env.SUPPORT_SHEET_SECRET) return false
  try {
    // Apps Script answers a POST with a redirect to its result; fetch follows it.
    const res = await fetch(env.SUPPORT_SHEET_URL, {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.SUPPORT_SHEET_SECRET, ...payload }),
    })
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null
    if (!res.ok || body?.ok !== true) throw new Error(`sheet answered ${res.status}`)
    return true
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'support sheet failed', action: payload.action, error: String(e).slice(0, 200) }))
    return false
  }
}

async function mailInbox(env: Env, subject: string, text: string): Promise<void> {
  if (!env.SUPPORT_INBOX) return
  await getMailer(env).send({ to: env.SUPPORT_INBOX, subject, text }).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'support inbox email failed', error: String(e).slice(0, 200) })))
}

/** Who wrote in and from which studio, for the Sheet and the email. */
async function whoAndWhere(env: Env, ticket: Ticket) {
  const db = getDb(env.DB)
  const [st] = await db.select({ name: schema.studios.name, plan: schema.studios.planId }).from(schema.studios).where(eq(schema.studios.id, ticket.studioId)).limit(1)
  const [u] = ticket.createdBy ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, ticket.createdBy)).limit(1) : []
  const [ev] = ticket.eventId ? await db.select({ name: schema.events.name, shortId: schema.events.shortId }).from(schema.events).where(eq(schema.events.id, ticket.eventId)).limit(1) : []
  return {
    studio: st?.name ?? ticket.studioId, plan: st?.plan ?? '',
    person: u ? `${u.name}${realEmail(u.email) ? ` <${u.email}>` : ''}` : '',
    event: ev ? `${ev.name} (${ev.shortId})` : '',
    gallery: ev ? `${env.GALLERY_URL.replace(/\/$/, '')}/${ev.shortId}` : '',
  }
}

/** Placeholder addresses (Studio AutoPilot logins whose email is not confirmed) are nobody's inbox. */
const realEmail = (e: string | null | undefined) => !!e && e.includes('@') && !e.endsWith('.invalid')

/** Hands a ticket to our team: a Sheet row and an email. Once per ticket; later messages add notes. */
export async function escalateTicket(env: Env, ticketId: string, about: { summary: string; steps: string }): Promise<void> {
  const db = getDb(env.DB)
  const t = schema.tickets
  const [ticket] = await db.select().from(t).where(eq(t.id, ticketId)).limit(1)
  if (!ticket || ticket.escalatedAt) return
  await db.update(t).set({ escalatedAt: nowIso(), aiState: 'human' }).where(eq(t.id, ticketId)).run()
  const w = await whoAndWhere(env, ticket)
  const firstMessage = (await db.select({ body: schema.ticketMessages.body }).from(schema.ticketMessages)
    .where(and(eq(schema.ticketMessages.ticketId, ticketId), eq(schema.ticketMessages.from, 'me'))).orderBy(asc(schema.ticketMessages.at)).limit(1))[0]?.body ?? ''
  await postSheet(env, {
    action: 'append',
    row: {
      ticketId, opened: ticket.createdAt, studio: w.studio, plan: w.plan, person: w.person, type: ticket.category ?? 'other',
      urgency: ticket.urgency ?? 'normal', subject: ticket.subject, summary: about.summary, steps: about.steps,
      message: firstMessage.slice(0, 3000), event: w.event, gallery: w.gallery, platform: ticket.platform,
      files: (await supportFilesUrl(env, ticketId)) ?? '',
    },
  })
  await mailInbox(env, `[Frameline support] ${ticket.urgency === 'high' ? 'URGENT · ' : ''}${ticket.category ?? 'ticket'} · ${w.studio}: ${ticket.subject}`, [
    `${w.studio} (${w.plan} plan)${w.person ? `, ${w.person}` : ''} needs a person.`,
    '',
    `Subject: ${ticket.subject}`,
    `Type: ${ticket.category ?? 'other'} · Urgency: ${ticket.urgency ?? 'normal'} · Where: ${ticket.platform}`,
    w.event ? `Event: ${w.event} · ${w.gallery}` : '',
    '',
    `Summary: ${about.summary}`,
    about.steps ? `\nSteps:\n${about.steps}` : '',
    '',
    `Their message:\n${firstMessage.slice(0, 3000)}`,
    '',
    `Screenshots: ${(await supportFilesUrl(env, ticketId)) ?? '(none)'}`,
    `Reply in the support Sheet (column "Reply to studio", then set Status). Ticket ${ticketId}.`,
  ].filter((l) => l !== null).join('\n'))
}

/** The studio wrote again on a ticket that is with our team: a note on its Sheet row and an email. */
export async function noteStudioReply(env: Env, ticketId: string, body: string): Promise<void> {
  const db = getDb(env.DB)
  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).limit(1)
  if (!ticket) return
  const w = await whoAndWhere(env, ticket)
  await postSheet(env, { action: 'note', ticketId, note: body.slice(0, 3000), at: nowIso() })
  await mailInbox(env, `[Frameline support] ${w.studio} replied: ${ticket.subject}`, `${w.studio} wrote again on ticket ${ticketId}:\n\n${body.slice(0, 3000)}`)
}

export type SheetStatus = 'replied' | 'fixed' | 'resolved'

/**
 * A reply from the Sheet: lands in the studio's ticket (and their inbox). `fixed` and `resolved` mark it
 * resolved; `resolved` also closes it. Returns false for a ticket that does not exist.
 */
export async function applySheetReply(env: Env, input: { ticketId: string; reply: string; status: SheetStatus; by?: string }): Promise<boolean> {
  const db = getDb(env.DB)
  const t = schema.tickets
  const [ticket] = await db.select().from(t).where(eq(t.id, input.ticketId)).limit(1)
  if (!ticket) return false
  const now = nowIso()
  const done = input.status !== 'replied'
  const reply = input.reply.trim()
  const update = db.update(t).set({
    status: input.status === 'resolved' ? 'closed' : 'answered', updatedAt: now, aiState: 'human',
    ...(done ? { resolvedAt: now } : {}),
  }).where(eq(t.id, ticket.id))
  if (reply) await db.batch([db.insert(schema.ticketMessages).values({ id: newId('tm'), ticketId: ticket.id, from: 'support', body: reply, at: now }), update])
  else await update.run()
  // Tell the person who opened it, when we know a real address for them.
  const [u] = ticket.createdBy ? await db.select({ email: schema.users.email, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, ticket.createdBy)).limit(1) : []
  if (u && realEmail(u.email) && (reply || done)) {
    const lead = input.status === 'fixed' ? 'Good news: this is fixed.' : input.status === 'resolved' ? 'We have marked this as resolved.' : 'The Frameline team replied to your request.'
    await getMailer(env).send({
      to: u.email,
      subject: `Re: ${ticket.subject}`,
      text: `Hi ${u.name.split(' ')[0] || 'there'},\n\n${lead}\n\n${reply}\n\nSee the whole conversation or reply: ${adminUrl(env, ticket.id)}\n\n— Frameline support`,
    }).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'support reply email failed', error: String(e).slice(0, 200) })))
  }
  return true
}

/** Morning email: tickets with our team that are not resolved, high urgency and oldest first. */
export async function supportDigest(env: Env): Promise<number> {
  if (!env.SUPPORT_INBOX) return 0
  const db = getDb(env.DB)
  const t = schema.tickets
  const open = await db.select().from(t).where(and(eq(t.aiState, 'human'), ne(t.status, 'closed'), isNull(t.resolvedAt))).orderBy(sql`case ${t.urgency} when 'high' then 0 when 'normal' then 1 else 2 end`, asc(t.escalatedAt)).limit(100)
  if (!open.length) return 0
  const day = 86_400_000
  const lines = open.map((x) => {
    const age = Math.floor((Date.now() - Date.parse(x.escalatedAt ?? x.createdAt)) / day)
    return `- ${x.urgency === 'high' ? 'URGENT ' : ''}${x.category ?? 'ticket'} · ${x.subject} · ${age ? `${age} day${age === 1 ? '' : 's'} waiting` : 'today'} · ${x.id}`
  })
  const old = open.filter((x) => Date.now() - Date.parse(x.escalatedAt ?? x.createdAt) > day).length
  await mailInbox(env, `[Frameline support] ${open.length} open${old ? `, ${old} waiting over a day` : ''}`, `Still with the team:\n\n${lines.join('\n')}\n\nReply in the support Sheet.`)
  return open.length
}

// ── Screenshots ─────────────────────────────────────────────────────────────
// Kept in R2 under support/<studio>/<ticket>/, never under the public /v1/media prefixes. Our team sees them
// through one signed link per ticket (in the Sheet row and the email): a small page listing the files there now.
export const supportPrefix = (studioId: string, ticketId: string) => `support/${studioId}/${ticketId}/`
const FILES_TTL_SEC = 90 * 86_400

async function filesSig(secret: string, ticketId: string, exp: number) {
  return toBase64Url(await hmacSha256(secret, `support-files:${ticketId}:${exp}`))
}

/** The team's link to a ticket's screenshots, or null when the Sheet secret is not set. */
export async function supportFilesUrl(env: Env, ticketId: string): Promise<string | null> {
  if (!env.SUPPORT_SHEET_SECRET) return null
  const exp = Math.floor(Date.now() / 1000) + FILES_TTL_SEC
  const base = (env.API_PUBLIC_URL || '').replace(/\/$/, '')
  return `${base}/v1/integrations/support/files/${ticketId}.${exp}.${await filesSig(env.SUPPORT_SHEET_SECRET, ticketId, exp)}`
}

/** The ticket a files link is for, when its signature holds and it has not expired. */
export async function verifySupportFilesToken(env: Env, token: string): Promise<string | null> {
  const [ticketId, expRaw, sig] = token.split('.')
  const exp = Number(expRaw)
  if (!env.SUPPORT_SHEET_SECRET || !ticketId || !sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return null
  return timingSafeEqual(sig, await filesSig(env.SUPPORT_SHEET_SECRET, ticketId, exp)) ? ticketId : null
}
