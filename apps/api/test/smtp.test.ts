import { describe, expect, it } from 'vitest'
import { buildMessage, sendSmtp, SmtpError, type SmtpSocket } from '../src/services/smtp'
import { SmtpMailer, smtpConfig } from '../src/services/mailer'
import type { Env } from '../src/env'

/** A pretend Gmail: answers each command the way smtp.gmail.com does, and records what it was sent. */
function fakeGmail(opts: { rejectPassword?: boolean } = {}) {
  const enc = new TextEncoder(), dec = new TextDecoder()
  const sent: string[] = []
  let push!: (s: string) => void
  let inData = false, data = ''
  const readable = new ReadableStream<Uint8Array>({ start(ctrl) { push = (s) => ctrl.enqueue(enc.encode(s)) } })
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const text = dec.decode(chunk)
      if (inData) {
        data += text
        if (data.endsWith('\r\n.\r\n')) { inData = false; sent.push(`DATA:${data}`); push('250 2.0.0 OK queued\r\n') }
        return
      }
      for (const line of text.split('\r\n').filter(Boolean)) {
        sent.push(line)
        if (line.startsWith('EHLO')) push('250-smtp.gmail.com at your service\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8\r\n')
        else if (line === 'AUTH LOGIN') push('334 VXNlcm5hbWU6\r\n')
        else if (sent.length === 3) push('334 UGFzc3dvcmQ6\r\n')
        else if (sent.length === 4) push(opts.rejectPassword ? '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 Learn more\r\n' : '235 2.7.0 Accepted\r\n')
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) push('250 2.1.0 OK\r\n')
        else if (line === 'DATA') { inData = true; data = ''; push('354 Go ahead\r\n') }
        else if (line === 'QUIT') push('221 2.0.0 closing\r\n')
      }
    },
  })
  queueMicrotask(() => push('220 smtp.gmail.com ESMTP ready\r\n'))
  const socket: SmtpSocket = { readable, writable, close: async () => undefined }
  return { sent, open: () => socket }
}

const cfg = { host: 'smtp.gmail.com', port: 465, user: 'support@gmail.com', pass: 'abcd efgh ijkl mnop', from: 'Frameline <support@gmail.com>' }

describe('SMTP (Gmail)', () => {
  it('signs in with the App Password and hands over one message', async () => {
    const g = fakeGmail()
    await sendSmtp(cfg, { to: 'Studio <owner@studio.in>', subject: 'Your request · अनुरोध', text: 'Hello\n.dot line', html: '<p>Hello</p>' }, g.open)
    expect(g.sent.slice(0, 7)).toEqual([
      'EHLO frameline', 'AUTH LOGIN', btoa('support@gmail.com'), btoa('abcd efgh ijkl mnop'),
      'MAIL FROM:<support@gmail.com>', 'RCPT TO:<owner@studio.in>', 'DATA',
    ])
    const data = g.sent[7]!
    expect(data).toContain('From: Frameline <support@gmail.com>')
    expect(data).toContain('To: owner@studio.in')
    expect(data).toContain('Subject: =?UTF-8?B?') // not plain ASCII, so encoded
    expect(data).toContain('Content-Type: multipart/alternative')
    expect(data.endsWith('\r\n.\r\n')).toBe(true)
    expect(g.sent.at(-1)).toBe('QUIT')
  })

  it('says which step was refused', async () => {
    const g = fakeGmail({ rejectPassword: true })
    const err = await sendSmtp(cfg, { to: 'a@b.in', subject: 'x', text: 'y' }, g.open).catch((e) => e)
    expect(err).toBeInstanceOf(SmtpError)
    expect(err.step).toBe('password')
    await expect(new SmtpMailer(cfg, fakeGmail({ rejectPassword: true }).open).send({ to: 'a@b.in', subject: 'x', text: 'y' })).rejects.toMatchObject({ code: 'email_failed' })
  })

  it('doubles a line that starts with a dot, so the message cannot end early', () => {
    const raw = buildMessage(cfg.from, { to: 'a@b.in', subject: 's', text: 't' })
    expect(raw).toContain('Content-Transfer-Encoding: base64')
    expect(raw.split('\r\n').some((l) => l === '.')).toBe(false)
  })

  it('is used only when the login and the App Password are both set, sending as the account', () => {
    expect(smtpConfig({ MAIL_FROM: 'Frameline <login@frameline.in>' } as Env)).toBeNull()
    expect(smtpConfig({ MAIL_FROM: 'Frameline <login@frameline.in>', SMTP_USER: 'support@gmail.com', SMTP_PASS: 'x' } as Env))
      .toEqual({ host: 'smtp.gmail.com', port: 465, user: 'support@gmail.com', pass: 'x', from: 'Frameline <support@gmail.com>' })
  })
})
