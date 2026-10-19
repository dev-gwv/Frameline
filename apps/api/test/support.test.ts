import { SELF, env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, schema } from '../src/db/client'
import { answerTicket, handOverLine, parseVerdict } from '../src/services/support-ai'
import { BASE, call, freshIp, tokenFor } from './helpers'

/**
 * The support desk: the assistant answers first (Groq, NIM as fallback); bugs, money and account problems are
 * handed over to Book a call (the owner's booking page), and the assistant then stays quiet on that ticket.
 */
const db = () => getDb(env.DB)
const CALL = 'https://book.test/harsh/intro-call'
const withAi = { ...env, SUPPORT_AI_API_KEY: 'gsk_test', SUPPORT_AI_FALLBACK_API_KEY: 'nvapi_test', SUPPORT_CALL_URL: CALL, AI_FEATURES: 'off' }

afterEach(() => vi.unstubAllGlobals())

/** A studio ticket waiting for the assistant, made directly (no request, so no background run races the test). */
async function newTicket(body: string, subject = 'Help') {
  const id = `tk_${crypto.randomUUID().slice(0, 12)}`
  const now = new Date().toISOString()
  await db().insert(schema.tickets).values({ id, studioId: 'st_northlight', subject, platform: 'admin', status: 'open', createdBy: 'u1', createdAt: now, updatedAt: now, aiState: 'pending' }).run()
  await db().insert(schema.ticketMessages).values({ id: `tm_${crypto.randomUUID()}`, ticketId: id, from: 'me', body, at: now }).run()
  return id
}

const llm = (verdict: Record<string, unknown>) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(verdict) } }] }), { status: 200 })
const messages = async (id: string) => db().select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, id))
const ticket = async (id: string) => (await db().select().from(schema.tickets).where(eq(schema.tickets.id, id)).limit(1))[0]!

describe('the support assistant', () => {
  it('answers a how-to from the guides, and tells the model what is switched off', async () => {
    const id = await newTicket('How do I change the PIN for my event?')
    const sent: { url: string; body: any }[] = []
    const fetchStub = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) })
      return llm({ reply: 'Open the event, then Share → New PIN.', category: 'how-to', urgency: 'low', needs_human: false, summary: '', steps: '' })
    }) as unknown as typeof fetch
    expect(await answerTicket(withAi as never, id, fetchStub)).toBe('answered')
    expect(sent[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const system = sent[0]!.body.messages[0].content as string
    expect(system).toContain('Change or reset an event PIN')
    expect(system).toContain('SWITCHED OFF: selfie search')
    expect(system).not.toContain('Guests say the selfie finds no photos') // that guide needs AI on
    expect((await messages(id)).at(-1)).toMatchObject({ from: 'assistant', body: 'Open the event, then Share → New PIN.' })
    expect(await ticket(id)).toMatchObject({ status: 'answered', aiState: 'done', category: 'how-to' })
  })

  it('hands a bug over to Book a call even when the model says it can answer', async () => {
    const id = await newTicket('Upload fails at 80% every time on the Sharma wedding')
    const outside = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', outside)
    const fetchStub = (async () => llm({ reply: 'Thanks, that sounds like a fault.', category: 'bug', urgency: 'high', needs_human: false, summary: 'Uploads stop at 80%.', steps: '1. Upload 200 photos' })) as unknown as typeof fetch
    expect(await answerTicket(withAi as never, id, fetchStub)).toBe('handed-over')
    expect(await ticket(id)).toMatchObject({ aiState: 'human', urgency: 'high', category: 'bug', summary: 'Uploads stop at 80%.' })
    expect((await ticket(id)).escalatedAt).toBeTruthy()
    expect((await messages(id)).at(-1)!.body).toBe(`Thanks, that sounds like a fault.\n\nBook a call with us at a time that suits you: ${CALL}`)
    expect(outside).not.toHaveBeenCalled() // no Sheet, no inbox
  })

  it('points to WhatsApp when there is no booking page', () => {
    expect(handOverLine({ SUPPORT_WHATSAPP: '+91 91091 92065' } as never)).toBe('Message us on WhatsApp and we will set up a call: +91 91091 92065')
    expect(handOverLine({} as never)).toBe('Please book a call with us from the Help page.')
  })

  it('falls back to the second provider, and with no answer at all hands over instead of guessing', async () => {
    const id = await newTicket('Where is my GST invoice?')
    const urls: string[] = []
    const fallback = (async (url: string) => {
      urls.push(url)
      return url.includes('groq') ? new Response('rate limited', { status: 429 }) : llm({ reply: 'Settings → Invoices.', category: 'how-to', urgency: 'low', needs_human: false, summary: '', steps: '' })
    }) as unknown as typeof fetch
    expect(await answerTicket(withAi as never, id, fallback)).toBe('answered')
    expect(urls).toEqual(['https://api.groq.com/openai/v1/chat/completions', 'https://integrate.api.nvidia.com/v1/chat/completions'])

    const id2 = await newTicket('Something else')
    expect(await answerTicket(withAi as never, id2, (async () => new Response('down', { status: 503 })) as unknown as typeof fetch)).toBe('handed-over')
    expect((await messages(id2)).at(-1)!.body).toContain(`This one needs a person on the Frameline team.\n\nBook a call with us at a time that suits you: ${CALL}`)
  })

  it('never trusts a malformed answer', () => {
    expect(parseVerdict('not json')).toBeNull()
    expect(parseVerdict(JSON.stringify({ reply: '' }))).toBeNull()
    expect(parseVerdict('```json\n{"reply":"Hi","category":"billing","needs_human":false}\n```')).toMatchObject({ reply: 'Hi', category: 'billing', needsHuman: true })
  })
})

describe('the studio side', () => {
  it('shows the assistant at work, and closes on "That solved it"', async () => {
    const token = await tokenFor('owner')
    const made = await call('/v1/tickets', { token, body: { subject: 'Watermark missing', platform: 'admin', body: 'The watermark is not on downloads' } })
    expect(made.json.assistant).toBe('thinking')
    const id = made.json.id as string

    // Gone with the Sheet: nobody on our side read them.
    expect((await SELF.fetch(`${BASE}/v1/tickets/${id}/attachments?filename=screen.png`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'cf-connecting-ip': freshIp() }, body: new Uint8Array([1]) })).status).toBe(404)
    expect((await call('/v1/integrations/support/reply', { body: { secret: 'x', ticketId: id, reply: 'x', status: 'replied' } })).status).toBe(404)

    const solved = await call(`/v1/tickets/${id}/resolve`, { token, body: {} })
    expect(solved.status).toBe(200)
    expect(solved.json.status).toBe('closed')
  })
})
