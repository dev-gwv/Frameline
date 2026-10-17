import { connect } from 'cloudflare:sockets'
import type { MailMessage } from './mailer'

/**
 * A small SMTP client for Workers (cloudflare:sockets), enough for Gmail / Google Workspace:
 * implicit TLS on 465, AUTH LOGIN with an App Password, one message per connection.
 *
 * Gmail sends as the account it signs in with (an unregistered From is rewritten), so the From is
 * "<name> <SMTP_USER>" unless SMTP_FROM names a "Send mail as" alias the account owns.
 * Limits to know: about 500 recipients a day on a personal Gmail, 2,000 on Workspace.
 */
export interface SmtpConfig { host: string; port: number; user: string; pass: string; from: string }

export interface SmtpSocket {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  close(): Promise<void>
}
export type SmtpConnect = (host: string, port: number) => SmtpSocket

const realConnect: SmtpConnect = (host, port) => connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false })

const enc = new TextEncoder()
const dec = new TextDecoder()
const TIMEOUT_MS = 20_000

export class SmtpError extends Error {
  constructor(readonly step: string, readonly reply: string) { super(`SMTP ${step} failed: ${reply.slice(0, 200)}`) }
}

/** Sends one message. Throws SmtpError with the step and the server's reply when anything is refused. */
export async function sendSmtp(cfg: SmtpConfig, msg: MailMessage, open: SmtpConnect = realConnect): Promise<void> {
  const socket = open(cfg.host, cfg.port)
  const writer = socket.writable.getWriter()
  const reader = socket.readable.getReader()
  let buffer = ''
  const deadline = Date.now() + TIMEOUT_MS

  /** One full reply (multi-line replies end at "250 ..." rather than "250-..."). */
  async function reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = []
    for (;;) {
      const nl = buffer.indexOf('\r\n')
      if (nl >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 2)
        lines.push(line)
        if (/^\d{3}(?: |$)/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join('\n') }
        continue
      }
      if (Date.now() > deadline) throw new SmtpError('timeout', lines.join('\n'))
      const { value, done } = await reader.read()
      if (done) throw new SmtpError('connection', lines.join('\n') || 'closed by server')
      buffer += dec.decode(value, { stream: true })
    }
  }
  async function step(name: string, line: string | null, expect: number) {
    if (line !== null) await writer.write(enc.encode(`${line}\r\n`))
    const r = await reply()
    if (r.code !== expect) throw new SmtpError(name, r.text)
  }

  try {
    await step('greeting', null, 220)
    await step('ehlo', 'EHLO frameline', 250)
    await step('auth', 'AUTH LOGIN', 334)
    await step('user', b64(cfg.user), 334)
    await step('password', b64(cfg.pass), 235)
    await step('mail-from', `MAIL FROM:<${address(cfg.from)}>`, 250)
    await step('rcpt-to', `RCPT TO:<${address(msg.to)}>`, 250)
    await step('data', 'DATA', 354)
    await step('message', `${dotStuff(buildMessage(cfg.from, msg))}\r\n.`, 250)
    await writer.write(enc.encode('QUIT\r\n')).catch(() => undefined)
  } finally {
    await socket.close().catch(() => undefined)
  }
}

/** The bare address from "Name <a@b>" or "a@b". */
export const address = (s: string) => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim()

const b64 = (s: string) => {
  const bytes = enc.encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
/** Base64 wrapped at 76 characters, as MIME bodies must be. */
const b64Lines = (s: string) => b64(s).replace(/.{1,76}/g, '$&\r\n').trimEnd()
/** A header value, encoded only when it is not plain ASCII (RFC 2047). */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
const fromHeader = (from: string) => {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from)
  return m && m[1] ? `${header(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : address(from)
}
/** A line starting with "." would end DATA early: it is doubled (RFC 5321 4.5.2). */
const dotStuff = (s: string) => s.replace(/(^|\r\n)\./g, '$1..')

export function buildMessage(from: string, msg: MailMessage, now = new Date()): string {
  const boundary = `fl-${crypto.randomUUID()}`
  const domain = address(from).split('@')[1] ?? 'frameline'
  const head = [
    `From: ${fromHeader(from)}`,
    `To: ${address(msg.to)}`,
    `Subject: ${header(msg.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
  ]
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64Lines(body)].join('\r\n')
  if (!msg.html) return [...head, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lines(msg.text)].join('\r\n')
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part('text/plain', msg.text),
    part('text/html', msg.html),
    `--${boundary}--`,
  ].join('\r\n')
}
