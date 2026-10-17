import { and, asc, count, eq } from 'drizzle-orm'
import { availableArticles, FEATURES } from '@frameline/shared'
import type { Env } from '../env'
import { getDb, schema } from '../db/client'
import { aiOn, effectiveSettings } from '../lib/features'
import { newId, nowIso } from '../lib/ids'
import { escalateTicket } from './support-desk'

/**
 * The support assistant: the first answer on every studio ticket (Help → Ask the team).
 *
 * It answers from the same help guides the Help page shows (only those for features that are on) and from the
 * studio's own facts (plan, wallet, the event's settings and failed photos), and says whether a person on our
 * team must take over: bugs, money, account access, anything it is not sure of. Those go to the support Sheet
 * and inbox (services/support-desk.ts); once a ticket is with our team the assistant stays quiet on it.
 *
 * Any OpenAI-compatible chat API works. Groq first, NVIDIA NIM as the fallback when Groq is down or out of
 * quota; with no key at all, every ticket goes straight to our team.
 */
export interface LlmConfig { name: string; baseUrl: string; apiKey: string; model: string }

export function llmConfigs(env: Env): LlmConfig[] {
  const out: LlmConfig[] = []
  if (env.SUPPORT_AI_API_KEY) {
    out.push({
      name: 'primary', apiKey: env.SUPPORT_AI_API_KEY,
      baseUrl: env.SUPPORT_AI_BASE_URL || 'https://api.groq.com/openai/v1',
      model: env.SUPPORT_AI_MODEL || 'llama-3.3-70b-versatile',
    })
  }
  if (env.SUPPORT_AI_FALLBACK_API_KEY) {
    out.push({
      name: 'fallback', apiKey: env.SUPPORT_AI_FALLBACK_API_KEY,
      baseUrl: env.SUPPORT_AI_FALLBACK_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      model: env.SUPPORT_AI_FALLBACK_MODEL || 'meta/llama-3.3-70b-instruct',
    })
  }
  return out
}

export type Category = 'how-to' | 'bug' | 'billing' | 'account' | 'feature' | 'other'
export type Urgency = 'low' | 'normal' | 'high'
export interface Verdict {
  /** What the studio reads. */
  reply: string
  category: Category
  urgency: Urgency
  /** A person on our team must take over. */
  needsHuman: boolean
  /** For our team (the Sheet): what is wrong, in two or three sentences. */
  summary: string
  /** For our team: steps to see it happen, when it is a bug. */
  steps: string
}

const CATEGORIES: Category[] = ['how-to', 'bug', 'billing', 'account', 'feature', 'other']
const URGENCIES: Urgency[] = ['low', 'normal', 'high']
const TIMEOUT_MS = 25_000

type Fetch = typeof fetch
type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

/** One chat call per provider in turn; the first good answer wins. Null when every provider failed. */
export async function chat(configs: LlmConfig[], messages: Msg[], fetchImpl: Fetch = fetch): Promise<string | null> {
  for (const cfg of configs) {
    try {
      const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.2, max_tokens: 900, response_format: { type: 'json_object' } }),
      })
      if (!res.ok) {
        console.error(JSON.stringify({ level: 'warn', msg: 'support ai provider failed', provider: cfg.name, status: res.status }))
        continue
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const text = body.choices?.[0]?.message?.content
      if (text) return text
    } catch (e) {
      console.error(JSON.stringify({ level: 'warn', msg: 'support ai provider unreachable', provider: cfg.name, error: String(e).slice(0, 200) }))
    }
  }
  return null
}

/** The model's JSON, checked. Anything malformed means "a person should look": never a made-up answer. */
export function parseVerdict(text: string | null): Verdict | null {
  if (!text) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return null
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const reply = str(raw.reply, 2000)
  if (!reply) return null
  const category = CATEGORIES.includes(raw.category as Category) ? (raw.category as Category) : 'other'
  const urgency = URGENCIES.includes(raw.urgency as Urgency) ? (raw.urgency as Urgency) : 'normal'
  return {
    reply, category, urgency,
    // Bugs, money and account problems always reach a person, whatever the model said.
    needsHuman: raw.needs_human === true || category === 'bug' || category === 'billing' || category === 'account',
    summary: str(raw.summary, 1000), steps: str(raw.steps, 1500),
  }
}

const SYSTEM = `You are the support assistant for Frameline, an online photo gallery app for Indian wedding and event photography studios. A studio owner or their team has written to support from the Help page of the Frameline admin app.

Rules:
- Answer ONLY from GUIDES and FACTS below. Never invent buttons, menus, features, prices or timelines. If the guides do not cover it, say a person on the team will reply, and set needs_human to true.
- Features listed under SWITCHED OFF do not exist for them right now. Never suggest them.
- Never promise refunds, credits, plan changes or account changes. Money, payments, sign-in or access problems, lost photos, and anything that looks like a bug: set needs_human to true, tell them our team has it, and ask for what is missing (which event, what they clicked, what they saw, a screenshot).
- Write short, warm, plain sentences, like a helpful person on WhatsApp. No markdown headings. Use the studio's own language: if they wrote in Hindi or Hinglish, answer the same way; button names stay in English.
- Reply with JSON only, exactly these keys:
  {"reply": string, "category": "how-to"|"bug"|"billing"|"account"|"feature"|"other", "urgency": "low"|"normal"|"high", "needs_human": boolean, "summary": string, "steps": string}
  "summary" and "steps" are for our team, not the studio: what is wrong in two or three sentences, and the steps to see it happen (empty if not a bug). Urgency is high when an event is happening now or within two days, guests cannot open the gallery, or photos are lost.`

/** The studio's facts the assistant may use. */
async function factsFor(env: Env, ticket: typeof schema.tickets.$inferSelect): Promise<string> {
  const db = getDb(env.DB)
  const [st] = await db.select().from(schema.studios).where(eq(schema.studios.id, ticket.studioId)).limit(1)
  const lines = [
    `Studio: ${st?.name ?? 'unknown'}; plan ${st?.planId ?? '?'} valid till ${st?.validTill?.slice(0, 10) ?? '?'}; wallet ₹${((st?.walletPaise ?? 0) / 100).toFixed(0)}; photos used ${st?.photosUsed ?? 0} of ${st?.photosLimit ?? 0}.`,
    `Where they see it: ${ticket.platform}.`,
  ]
  if (ticket.eventId) {
    const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, ticket.eventId)).limit(1)
    if (ev) {
      const s = effectiveSettings(env, ev.settings)
      const p = schema.photos
      const [{ failed }] = await db.select({ failed: count() }).from(p).where(and(eq(p.eventId, ev.id), eq(p.status, 'failed')))
      const [{ processing }] = await db.select({ processing: count() }).from(p).where(and(eq(p.eventId, ev.id), eq(p.status, 'processing')))
      lines.push(
        `Event: "${ev.name}" on ${ev.date.slice(0, 10)}, status ${ev.status}, ${ev.photoCount} photos (${failed} failed to process, ${processing} still processing), gallery closes ${ev.expiresAt.slice(0, 10)}.`,
        `Event settings: access ${s.access}${s.access === 'link-pin' ? ' (PIN required)' : ''}; registration ${s.requireRegistration ? 'on' : 'off'}; downloads ${s.downloads}; full-size downloads ${s.originalDownloads ? 'on' : 'off'}; guest uploads ${s.guestUploads ? 'on' : 'off'}; selling ${s.storeEnabled ? 'on' : 'off'}; gallery ${s.disabled ? 'turned off' : 'on'}.`,
      )
    }
  }
  return lines.join('\n')
}

function switchedOff(env: Env): string {
  const off = [
    !aiOn(env) && 'selfie search / "Find my photos" / face recognition',
    !FEATURES.aiEnhance && 'AI enhance',
    !FEATURES.cameraSync && 'camera FTP sync',
    !FEATURES.driveImport && 'Google Drive import',
    !FEATURES.broadcasts && 'broadcast messages to guests',
    !FEATURES.website && 'website builder',
  ].filter(Boolean)
  return off.length ? off.join('; ') : 'nothing'
}

/** The prompt for one ticket: rules, guides, facts, then the conversation so far. */
export async function promptFor(env: Env, ticket: typeof schema.tickets.$inferSelect, msgs: (typeof schema.ticketMessages.$inferSelect)[]): Promise<Msg[]> {
  const guides = availableArticles({ ai: aiOn(env) }).map((a) => `- ${a.title}: ${a.answer}`).join('\n')
  const system = `${SYSTEM}\n\nGUIDES:\n${guides}\n\nSWITCHED OFF: ${switchedOff(env)}\n\nFACTS:\n${await factsFor(env, ticket)}`
  const convo: Msg[] = msgs.slice(-10).map((m) => ({
    role: m.from === 'me' ? 'user' : 'assistant',
    content: m.from === 'support' ? `(A person on the Frameline team wrote:) ${m.body}` : m.from === 'assistant' ? JSON.stringify({ reply: m.body }) : m.body,
  }))
  if (convo[0]?.role === 'user') convo[0] = { role: 'user', content: `Subject: ${ticket.subject}\n\n${convo[0].content}` }
  return [{ role: 'system', content: system }, ...convo]
}

const HANDOVER = 'Thanks for writing in. A person on the Frameline team will look at this and reply here, usually within a working day.'

/**
 * Answers a ticket whose last message is the studio's (ai_state pending). Safe to call twice: it claims the
 * ticket first, so the request's own background run and the minute cron never both answer.
 */
export async function answerTicket(env: Env, ticketId: string, fetchImpl: Fetch = fetch): Promise<'answered' | 'handed-over' | 'skipped'> {
  const db = getDb(env.DB)
  const t = schema.tickets
  const claimed = await db.update(t).set({ aiState: 'done' }).where(and(eq(t.id, ticketId), eq(t.aiState, 'pending'))).run()
  if (!claimed.meta.changes) return 'skipped'
  const [ticket] = await db.select().from(t).where(eq(t.id, ticketId)).limit(1)
  if (!ticket || ticket.status === 'closed') return 'skipped'
  const msgs = await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, ticketId)).orderBy(asc(schema.ticketMessages.at))

  const configs = llmConfigs(env)
  const verdict = configs.length ? parseVerdict(await chat(configs, await promptFor(env, ticket, msgs), fetchImpl)) : null
  // No assistant (no key, every provider down, or an answer we could not trust): straight to a person.
  const v: Verdict = verdict ?? { reply: HANDOVER, category: 'other', urgency: 'normal', needsHuman: true, summary: ticket.subject, steps: '' }
  const now = nowIso()
  await db.batch([
    db.insert(schema.ticketMessages).values({ id: newId('tm'), ticketId, from: 'assistant', body: v.reply, at: now }),
    db.update(t).set({
      status: 'answered', updatedAt: now, category: v.category, urgency: v.urgency,
      aiState: v.needsHuman ? 'human' : 'done', summary: v.summary || ticket.summary,
    }).where(eq(t.id, ticketId)),
  ])
  if (v.needsHuman) {
    await escalateTicket(env, ticketId, { summary: v.summary || msgs.find((m) => m.from === 'me')?.body.slice(0, 500) || ticket.subject, steps: v.steps })
    return 'handed-over'
  }
  return 'answered'
}

/** Minute cron: tickets still waiting for the assistant (its background run failed or timed out). */
export async function answerPendingTickets(env: Env, limit = 5): Promise<number> {
  const db = getDb(env.DB)
  const t = schema.tickets
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  const rows = await db.select({ id: t.id, at: t.updatedAt }).from(t).where(eq(t.aiState, 'pending')).orderBy(asc(t.updatedAt)).limit(limit * 3)
  let n = 0
  for (const r of rows.filter((x) => x.at <= cutoff).slice(0, limit)) if ((await answerTicket(env, r.id)) !== 'skipped') n++
  return n
}
