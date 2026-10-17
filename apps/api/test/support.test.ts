import { SELF, createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { getDb, schema } from '../src/db/client'
import { answerTicket, parseVerdict } from '../src/services/support-ai'
import { supportFilesUrl } from '../src/services/support-desk'
import { BASE, call, freshIp, tokenFor } from './helpers'

/**
 * The support desk: the assistant answers first (Groq, NIM as fallback), hands bugs, money and account problems
 * to the team (Sheet row + email), and the team's replies from the Sheet land back in the studio's ticket.
 */
const db = () => getDb(env.DB)
const SECRET = 'support-sheet-secret-0123456789-abcdef'
const withAi = { ...env, SUPPORT_AI_API_KEY: 'gsk_test', SUPPORT_AI_FALLBACK_API_KEY: 'nvapi_test', SUPPORT_SHEET_URL: 'https://sheet.test/exec', SUPPORT_SHEET_SECRET: SECRET, AI_FEATURES: 'off' }

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

  it('hands a bug to the team even when the model says it can answer, with a Sheet row', async () => {
    const id = await newTicket('Upload fails at 80% every time on the Sharma wedding')
    const sheet: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      sheet.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }))
    const fetchStub = (async () => llm({ reply: 'Thanks, our team is looking at this.', category: 'bug', urgency: 'high', needs_human: false, summary: 'Uploads stop at 80%.', steps: '1. Upload 200 photos' })) as unknown as typeof fetch
    expect(await answerTicket(withAi as never, id, fetchStub)).toBe('handed-over')
    expect(await ticket(id)).toMatchObject({ aiState: 'human', urgency: 'high', category: 'bug' })
    expect((await ticket(id)).escalatedAt).toBeTruthy()
    expect(sheet).toHaveLength(1)
    expect(sheet[0].url).toBe('https://sheet.test/exec')
    expect(sheet[0].body).toMatchObject({ secret: SECRET, action: 'append', row: { ticketId: id, type: 'bug', urgency: 'high', summary: 'Uploads stop at 80%.', steps: '1. Upload 200 photos' } })
    expect(sheet[0].body.row.files).toContain(`/v1/integrations/support/files/${id}.`)
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    expect(await answerTicket(withAi as never, id2, (async () => new Response('down', { status: 503 })) as unknown as typeof fetch)).toBe('handed-over')
    expect((await messages(id2)).at(-1)!.body).toContain('A person on the Frameline team will look at this')
  })

  it('never trusts a malformed answer', () => {
    expect(parseVerdict('not json')).toBeNull()
    expect(parseVerdict(JSON.stringify({ reply: '' }))).toBeNull()
    expect(parseVerdict('```json\n{"reply":"Hi","category":"billing","needs_human":false}\n```')).toMatchObject({ reply: 'Hi', category: 'billing', needsHuman: true })
  })
})

describe('the team, through the Sheet', () => {
  async function sheetReply(body: Record<string, unknown>) {
    const req = new Request('https://api.test/v1/integrations/support/reply', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': freshIp() }, body: JSON.stringify(body) })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, withAi as never, ctx)
    await waitOnExecutionContext(ctx)
    return res
  }

  it('puts the reply in the ticket, and Resolved closes it; a wrong secret changes nothing', async () => {
    const id = await newTicket('Payment went through but plan not active')
    expect((await sheetReply({ secret: 'wrong-secret-0123456789-abcdefgh', ticketId: id, reply: 'x', status: 'replied' })).status).toBe(401)
    expect((await sheetReply({ secret: SECRET, ticketId: id, reply: 'We have activated your plan.', status: 'replied', by: 'Harsh' })).status).toBe(200)
    expect((await messages(id)).at(-1)).toMatchObject({ from: 'support', body: 'We have activated your plan.' })
    expect(await ticket(id)).toMatchObject({ status: 'answered', aiState: 'human' })
    expect((await sheetReply({ secret: SECRET, ticketId: id, reply: '', status: 'resolved' })).status).toBe(200)
    expect(await ticket(id)).toMatchObject({ status: 'closed' })
    expect((await ticket(id)).resolvedAt).toBeTruthy()
    expect((await sheetReply({ secret: SECRET, ticketId: 'tk_nope', reply: 'x', status: 'replied' })).status).toBe(404)
  })
})

describe('the studio side', () => {
  it('shows the assistant at work, closes on "That solved it", and keeps screenshots for the team only', async () => {
    const token = await tokenFor('owner')
    const made = await call('/v1/tickets', { token, body: { subject: 'Watermark missing', platform: 'admin', body: 'The watermark is not on downloads' } })
    expect(made.json.assistant).toBe('thinking')
    const id = made.json.id as string

    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const up = await SELF.fetch(`${BASE}/v1/tickets/${id}/attachments?filename=screen.png`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'cf-connecting-ip': freshIp() }, body: png })
    expect(up.status).toBe(201)
    {
      const [t] = await db().select({ studioId: schema.tickets.studioId }).from(schema.tickets).where(eq(schema.tickets.id, id)).limit(1)
      const listed = await env.MEDIA.list({ prefix: `support/${t!.studioId}/${id}/` })
      expect(listed.objects).toHaveLength(1)
      expect((await call(`/v1/media/${listed.objects[0]!.key}`)).status).toBe(404)
    }
    const link = await supportFilesUrl(withAi as never, id)
    const page = await worker.fetch(new Request(`https://api.test${link!.replace(/^https?:\/\/[^/]+/, '')}`), withAi as never, createExecutionContext())
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('screen.png')
    const forged = await worker.fetch(new Request(`https://api.test/v1/integrations/support/files/${id}.9999999999.forged`), withAi as never, createExecutionContext())
    expect(forged.status).toBe(404)

    const solved = await call(`/v1/tickets/${id}/resolve`, { token, body: {} })
    expect(solved.status).toBe(200)
    expect(solved.json.status).toBe('closed')
  })
})
